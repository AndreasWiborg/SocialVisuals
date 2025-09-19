import path from 'path';
import { promises as fs } from 'fs';
import { deriveRoleSchema } from '../roles.js';
import { enrichSchema } from '../roleSemantics.js';
import { buildLLMPrompt } from '../llm/promptBuilder.js';
import { loadProfile } from '../config/profiles.js';
import { generateHeadlines, generateBodiesForHeadline, mergeToBundles } from '../llm/twoStage.js';
import { validateAndClean } from '../llm/ingest.js';
import { fitBundleAllRoles, pickTopBundleByAggregate } from '../rankerBundle.js';
import { buildCandidatesForHeadline, selectTopK } from '../ranker.js';
import { renderBundle } from './renderBundle.js';
import { appendItem } from '../runs/recorder.js';
import { getProvider } from '../llm/providers/index.js';
import { compressToBudget } from '../compress.js';
import { fitText } from '../layoutOracle.js';
import { dedupeArrayKeepOrder } from '../llm/dedup.js';
import { collapseSpaces } from '../textQuality.js';
export async function generateOnComposed(opts) {
    const { tpl, ctx, bgPath } = opts;
    const profile = loadProfile(opts?.profileId);
    process.env.PROFILE_ID = profile.id;
    const n = opts.n ?? 16;
    const useTwoStage = (typeof opts.twoStage === 'boolean') ? opts.twoStage : !!profile.twoStage;
    const angleQuotas = opts.angleQuotas || profile.angleQuotas;
    const preferJobFont = !!(profile.fonts?.preferJobFont);
    const font = preferJobFont ? (opts.fontFamily || tpl.fonts?.headline?.family || 'Arial') : (tpl.fonts?.headline?.family || opts.fontFamily || 'Arial');
    const schema = deriveRoleSchema(tpl);
    const enriched = enrichSchema(tpl, schema, ctx);
    const prompt = buildLLMPrompt(ctx, enriched, n, { bodyMinWords: 3 });
    const provider = getProvider();
    const out = await provider.generate({ prompt, n });
    let bundles = [];
    try {
        bundles = JSON.parse(out.text || '[]');
    }
    catch {
        bundles = [];
    }
    if (bundles && bundles.bundles)
        bundles = bundles.bundles;
    // Deduplicate bundles by normalized role text to reduce near-duplicates
    const seen = new Set();
    const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const signature = (b) => {
        const roles = b?.roles || {};
        const keys = Object.keys(roles).sort();
        return keys.map(k => {
            const v = roles[k];
            return Array.isArray(v) ? `${k}:${v.map(norm).join('|')}` : `${k}:${norm(v)}`;
        }).join('||');
    };
    const uniq = [];
    for (const b of (bundles || [])) {
        const sig = signature(b);
        if (sig && !seen.has(sig)) {
            seen.add(sig);
            uniq.push(b);
        }
    }
    bundles = uniq;
    // Validate/clean first to normalize bundles
    let vres = validateAndClean(bundles, schema, enriched);
    if (!vres.ok) {
        return { ok: false, errors: vres.errors, warnings: vres.warnings, prompt };
    }
    // Headline candidate screening (diversity + policy-aware preselection)
    // Use headline fit vs. theoretical upper bound and simple angle/start diversity
    try {
        const cleaned = vres.bundles || [];
        const cands = await buildCandidatesForHeadline(cleaned, tpl, schema, font, ctx?.locale);
        const kTop = Math.max(3, Math.min(6, opts.k ?? 3));
        const top = selectTopK(cands, kTop, vres.scores);
        const allow = new Set(top.map(c => c.bundleId));
        const filtered = cleaned.filter(b => allow.has(b.id));
        if (filtered.length >= 1)
            vres.bundles = filtered;
    }
    catch { }
    // Optional two-stage path: headlines -> pick -> bodies for each -> merge bundles
    const prompts = [];
    if (useTwoStage) {
        try {
            const { headlines: heads, prompt: pH } = await generateHeadlines(ctx, enriched, n, angleQuotas);
            if (pH)
                prompts.push(pH);
            // rank headline options by fit/diversity
            const pseudoBundles = heads.map(h => ({ id: h.id, angle: h.angle, roles: { headline: h.headline } }));
            const cands = await buildCandidatesForHeadline(pseudoBundles, tpl, schema, font, ctx?.locale);
            const M = Math.min(Math.max(1, (opts.k ?? 3) * 2), 8);
            const top = selectTopK(cands, M);
            const picked = new Map();
            for (const t of top) {
                const h = heads.find(x => x.id === t.bundleId);
                if (h)
                    picked.set(h.id, h);
            }
            // Determine counts per non-headline role
            const wantCounts = {};
            for (const s of enriched.specs) {
                if (s.role === 'headline')
                    continue;
                wantCounts[s.role] = s.count || 1;
            }
            const ctaWhitelist = (enriched.specs.find(s => s.semantics.kind === 'cta')?.semantics?.ctaWhitelist || []);
            const merged = [];
            for (const h of picked.values()) {
                const { roles, prompt: pB } = await generateBodiesForHeadline(ctx, enriched, h.headline, wantCounts, ctaWhitelist);
                if (pB)
                    prompts.push(pB);
                merged.push(...mergeToBundles(h, roles));
            }
            const twoStageRes = validateAndClean(merged, schema, enriched);
            if (twoStageRes.ok && twoStageRes.bundles?.length) {
                vres = twoStageRes;
            }
        }
        catch (e) {
            // Swallow and fall back to single-stage
        }
    }
    // Fit all roles per bundle and pick top via aggregate policy
    // Pre‑compress roles to grapheme budgets to favor larger fonts and crisper fits
    const fitResults = [];
    const normalizedById = new Map();
    const locale = ctx?.locale;
    const extraWarnings = [];
    const MIN_BODY_WORDS = 3;
    const BAD_END_RE = /\b(a|an|the|your|our|their|to|of|for|with|in|on|at|by|and|or)\s*$/i;
    const endsClean = (s) => {
        const t = collapseSpaces(String(s || ''));
        const q = /\?\s*$/.test(t);
        if (q)
            return !BAD_END_RE.test(t.replace(/\?+$/, '').trim());
        return !/[,:;]$/.test(t) && !BAD_END_RE.test(t);
    };
    const wc = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;
    const isShortFragment = (s) => {
        const txt = String(s || '').trim();
        const words = txt.split(/\s+/).filter(Boolean);
        return (words.length < 3) || txt.length < 12;
    };
    const preferSentence = (compressed, original) => {
        const c = String(compressed || '').trim();
        const o = String(original || '').trim();
        if (isShortFragment(c) && !isShortFragment(o))
            return o;
        return c;
    };
    for (const b0 of vres.bundles) {
        const roles = { ...b0.roles };
        // Body variant preselection: if body is an array with multiple options, pick the best ones for available areas
        try {
            const bodyAreas = (tpl.areas || []).filter((a) => a.role === 'body');
            const bodyCount = bodyAreas.length;
            if (bodyCount && roles['body']) {
                const arr = Array.isArray(roles['body']) ? roles['body'] : [String(roles['body'])];
                const area = bodyAreas[0];
                const computeUpper = (areaX) => {
                    const H = areaX.shape.h;
                    const Lmax = typeof areaX.constraints.maxLines === 'number' ? areaX.constraints.maxLines : areaX.constraints.maxLines.max;
                    const LH = areaX.constraints.lineHeight?.value || 1.1;
                    const C = areaX.constraints.fontSizing?.capHeightRatio ?? 0.70;
                    const targetCap = areaX.constraints.fontSizing?.optical?.targetCapHeightPx ?? undefined;
                    const byHeight = Math.floor(H / Math.max(1, (Lmax * LH)));
                    const byOptics = Number.isFinite(targetCap) ? Math.floor(targetCap / Math.max(1e-6, C)) : Number.POSITIVE_INFINITY;
                    return Math.max((areaX.constraints.minFont || 0), Math.min(byHeight, byOptics));
                };
                const ub = computeUpper(area) || 1;
                const scored = [];
                for (const t of arr) {
                    const tStr = String(t);
                    // Enforce minimum words for body options
                    if (wc(tStr) < MIN_BODY_WORDS)
                        continue;
                    const rep = await fitText(tStr, area, font, tpl.pixelSize?.w, { locale });
                    if (!rep?.fits)
                        continue;
                    const ratio = Math.max(0, Math.min(1, (rep.font_px || 0) / ub));
                    let s = ratio;
                    if (ratio < 0.75)
                        s -= 0.40;
                    if (ratio >= 0.90 && ratio <= 1.0)
                        s += 0.20;
                    scored.push({ text: tStr, score: s });
                }
                if (scored.length) {
                    scored.sort((a, b) => b.score - a.score);
                    roles['body'] = scored.slice(0, Math.max(1, bodyCount)).map(x => x.text);
                }
            }
        }
        catch { }
        for (const spec of enriched.specs) {
            const v = roles[spec.role];
            if (v == null)
                continue;
            const budget = spec.graphemeBudget;
            // For headlines, do not compress — prefer full sentence and let fitter size it
            if (String(spec.role).toLowerCase() === 'headline') {
                continue;
            }
            if (Array.isArray(v)) {
                const arr = [];
                for (const t of v) {
                    const cr = await compressToBudget(String(t), { targetGraphemes: budget });
                    arr.push(preferSentence(cr.text, String(t)));
                }
                roles[spec.role] = arr;
            }
            else {
                const cr = await compressToBudget(String(v), { targetGraphemes: budget });
                roles[spec.role] = preferSentence(cr.text, String(v));
            }
        }
        // After compression, enforce role-wise uniqueness and attempt targeted fill for missing multi-area items
        try {
            const rolesWithCounts = new Map();
            for (const a of (tpl.areas || [])) {
                rolesWithCounts.set(a.role, (rolesWithCounts.get(a.role) || 0) + 1);
            }
            for (const [roleName, areaCount] of rolesWithCounts.entries()) {
                if (!areaCount || areaCount <= 1)
                    continue;
                let val = roles[roleName];
                if (val == null)
                    continue;
                // If a single string but template expects multiple areas, try sentence split
                if (typeof val === 'string') {
                    const raw = String(val).trim();
                    // Split on sentence boundaries (., !, ?, …) followed by space/newline
                    let parts = raw.split(/(?<=[.!?…])\s+/).map(s => s.trim()).filter(Boolean);
                    if (parts.length <= 1 && raw.includes(',')) {
                        // Fallback: split on comma if no sentence punctuation
                        parts = raw.split(',').map(s => s.trim()).filter(Boolean);
                    }
                    // Enforce minimum words for body parts
                    if (/^body$/i.test(roleName)) {
                        parts = parts.filter(p => wc(p) >= MIN_BODY_WORDS);
                    }
                    if (parts.length > 1)
                        val = parts;
                    else
                        val = [raw];
                }
                if (Array.isArray(val)) {
                    let deduped = dedupeArrayKeepOrder(val.map((s) => String(s)));
                    if (/^body$/i.test(roleName)) {
                        deduped = deduped.filter(s => wc(s) >= MIN_BODY_WORDS);
                    }
                    // If still short and non-bullet role, attempt targeted follow-up to generate missing unique items
                    if (deduped.length < areaCount && !/bullet|benefit|feature/i.test(roleName)) {
                        try {
                            const provider2 = getProvider();
                            const need = areaCount - deduped.length;
                            const headTxt = Array.isArray(roles['headline']) ? String(roles['headline'][0] || '') : String(roles['headline'] || '');
                            const distinct = deduped.length ? `\nDISTINCT FROM: ${JSON.stringify(deduped)}` : '';
                            const budget = (enriched.specs.find(s => s.role === roleName)?.graphemeBudget) || 80;
                            const maxLines = (enriched.specs.find(s => s.role === roleName)?.maxLines) || 3;
                            const promptMissing = `You are a precise copywriter.\nReturn JSON ONLY: { "items": ["..."] }\n\nHEADLINE:\n${headTxt}\nROLE: ${roleName}\nCOUNT: ${need}\nBUDGET: ≤ ${budget} graphemes; maxLines ${maxLines}.\nRULES:\n- DISTINCT items; 3+ words; end cleanly; no numbers/emojis/hashtags.${distinct}\n- If headline is a question, answer it directly; avoid generic openings (Explore/Learn/Discover/Check out).\n\nCONTEXT:\n${JSON.stringify(ctx)}\n\nReturn JSON only.`;
                            const outM = await provider2.generate({ prompt: promptMissing, n: need });
                            let parsed = {};
                            try {
                                parsed = JSON.parse(outM.text || '{}');
                            }
                            catch {
                                parsed = {};
                            }
                            let items = Array.isArray(parsed?.items) ? parsed.items.map((x) => collapseSpaces(String(x))) : [];
                            // Enforce hygiene: 3+ words and clean endings
                            items = items.filter(x => wc(x) >= MIN_BODY_WORDS && endsClean(x));
                            items = dedupeArrayKeepOrder(items);
                            for (const it of items) {
                                if (deduped.length < areaCount && (!deduped.includes(it)))
                                    deduped.push(it);
                            }
                        }
                        catch { }
                    }
                    // If still short and bullet-like, fill with bullets; else warn and leave short
                    if (deduped.length < areaCount) {
                        if (/bullet|benefit|feature/i.test(roleName)) {
                            while (deduped.length < areaCount)
                                deduped.push('•');
                        }
                        else {
                            extraWarnings.push({ bundleId: b0.id, role: roleName, reason: 'insufficient-unique-items', have: deduped.length, need: areaCount });
                        }
                    }
                    roles[roleName] = deduped.slice(0, areaCount);
                }
            }
        }
        catch { }
        const b = { ...b0, roles };
        normalizedById.set(b0.id, roles);
        fitResults.push(await fitBundleAllRoles(tpl, b, font, locale));
    }
    // Build rank trace with policy-adjusted scores
    const byId = new Map();
    for (const b of vres.bundles)
        byId.set(b.id, b);
    // Build detailed candidate trace with per-role fit vs upper bound
    function computeUpperBoundFontPx(area, tpl) {
        const H = area.shape.h;
        const Lmax = typeof area.constraints.maxLines === 'number' ? area.constraints.maxLines : area.constraints.maxLines.max;
        const LH = area.constraints.lineHeight?.value || 1.1;
        const role = area.role;
        const tplRatio = (tpl?.fonts?.[role]?.capHeightRatio);
        const C = (typeof tplRatio === 'number' ? tplRatio : (area.constraints.fontSizing?.capHeightRatio)) ?? 0.70;
        const targetCap = area.constraints.fontSizing?.optical?.targetCapHeightPx ?? Infinity;
        const byHeight = Math.floor(H / Math.max(1, (Lmax * LH)));
        const byOptics = Number.isFinite(targetCap) ? Math.floor(targetCap / Math.max(1e-6, C)) : Number.POSITIVE_INFINITY;
        return Math.max(area.constraints.minFont || 0, Math.min(byHeight, byOptics));
    }
    const trace = fitResults.map(fr => {
        const pol = vres.scores?.[fr.bundleId] || {};
        const adj = fr.score + (pol.ctaOk === false ? -0.25 : 0) + 0.08 * (pol.coherence || 0);
        // Show the exact headline used for fitting (post-normalization/compression rules)
        const head = normalizedById.get(fr.bundleId)?.headline ?? byId.get(fr.bundleId)?.roles?.headline;
        const angle = byId.get(fr.bundleId)?.angle || null;
        const hFit = fr.fits?.headline?.[0] || {};
        // Per-role details
        const perRole = {};
        const roles = ['headline', 'body', 'cta'];
        for (const r of roles) {
            const areas = (tpl.areas || []).filter((a) => a.role === r);
            const fits = fr.fits?.[r] || [];
            perRole[r] = areas.map((a, idx) => {
                const f = fits[idx] || {};
                const ub = computeUpperBoundFontPx(a, tpl) || 1;
                const px = f.font_px ?? f.fontPx ?? 0;
                const ratio = ub > 0 ? (px / ub) : 0;
                return { areaId: a.id, fitPx: px, upperBoundPx: ub, ratio, lines: f.lines ?? 0, widthLimited: !!f.widthLimited };
            });
        }
        // Reasons (derived)
        const reasons = [];
        const pen = fr.scoreBreakdown?.penalties || {};
        if ((pen.duplicates || 0) < 0)
            reasons.push('duplicate-items');
        if ((pen.insufficient || 0) < 0)
            reasons.push('insufficient-unique-items');
        const anyWidthLimited = Object.values(fr.fits || {}).flat().some((f) => (f && f.widthLimited));
        if (anyWidthLimited)
            reasons.push('width-limited');
        return {
            bundleId: fr.bundleId,
            angle,
            headline: typeof head === 'string' ? head.slice(0, 80) : Array.isArray(head) ? String(head[0] || '').slice(0, 80) : '',
            headlineFontPx: hFit.font_px ?? hFit.fontPx ?? 0,
            headlineLines: hFit.lines ?? 0,
            ok: !!fr.ok,
            score: fr.score,
            scoreAdjusted: adj,
            scoreBreakdown: fr.scoreBreakdown || {},
            perRole,
            reasons
        };
    }).sort((a, b) => (b.scoreAdjusted - a.scoreAdjusted)).slice(0, 8);
    // Persist top candidates with full roles for debugging/analysis
    try {
        if (opts.outDir) {
            const top = trace.map(t => ({
                bundleId: t.bundleId,
                angle: t.angle,
                headline: t.headline,
                roles: normalizedById.get(t.bundleId) || byId.get(t.bundleId)?.roles || {},
                score: t.score,
                scoreAdjusted: t.scoreAdjusted,
                scoreBreakdown: t.scoreBreakdown,
                perRole: t.perRole,
                reasons: t.reasons || []
            }));
            const file = path.join(opts.outDir, `${tpl.templateId}.candidates.json`);
            await fs.writeFile(file, JSON.stringify({ templateId: tpl.templateId, count: top.length, candidates: top }, null, 2), 'utf-8');
        }
    }
    catch { }
    const best = pickTopBundleByAggregate(fitResults, vres.scores);
    const winnerId = best?.bundleId || vres.bundles[0]?.id;
    const winner = vres.bundles.find(b => b.id === winnerId) || vres.bundles[0];
    const winnerRoles = normalizedById.get(winnerId) || winner.roles;
    const outPath = opts.outDir
        ? path.join(opts.outDir, opts.outFileName || `out_llm_${tpl.templateId}_${Date.now()}.png`)
        : `./out_llm_${tpl.templateId}_${Date.now()}.png`;
    const meta = await renderBundle(tpl, { id: winner.id, roles: winnerRoles }, bgPath, outPath, font, opts.brandColors, ctx?.locale, !!(preferJobFont && opts.fontFamily));
    if (opts.outDir) {
        try {
            const ctxSummary = { product: ctx?.product, audience: ctx?.audience, tone: ctx?.tone, brandVoice: ctx?.brandVoice, locale: ctx?.locale, brandId: ctx?.brandId };
            await appendItem(opts.outDir, {
                templateId: tpl.templateId,
                bgPath,
                outPath,
                chosenBundleId: winner.id,
                angle: winner.angle,
                meta,
                ctxSummary,
                rolesUsed: best?.texts || winnerRoles || {},
                perRoleFit: best?.fits || {},
                brandId: ctx?.brandId
            });
        }
        catch { }
    }
    const policy = { coherence: vres.scores?.[winnerId]?.coherence ?? 0, ctaOk: !!(vres.scores?.[winnerId]?.ctaOk ?? true) };
    // Expose roles and per-role fit details for downstream manifests
    const rolesUsed = best?.texts || {};
    const perRoleFit = best?.fits || {};
    const warningsOut = [...(vres.warnings ?? []), ...extraWarnings];
    const rolePayloadUsed = {
        templateId: tpl.templateId,
        roles: rolesUsed,
        locale: ctx?.locale,
        brandColors: opts.brandColors,
        fontFamily: font
    };
    const traceOut = { candidates: trace.map(t => ({ id: t.bundleId, angle: t.angle, score: t.score, scoreBreakdown: t.scoreBreakdown, reasons: t.reasons })), picked: winner.id };
    const promptsOut = useTwoStage ? ({ stage1: prompts[0], stage2: prompts[1] }) : undefined;
    const promptOut = useTwoStage ? promptsOut : prompt;
    const generationMode = useTwoStage ? 'twoStage' : 'singlePass';
    // Per-area summary for the picked winner
    const perArea = [];
    const roleAreaIndex = new Map();
    for (const a of tpl.areas || []) {
        const role = a.role;
        const idx = roleAreaIndex.get(role) || 0;
        const textsArr = Array.isArray(winnerRoles[role]) ? winnerRoles[role] : (winnerRoles[role] ? [String(winnerRoles[role])] : []);
        const text = textsArr[idx] || '';
        const fitsArr = (perRoleFit?.[role] || []);
        const fit = fitsArr[idx] || {};
        const ub = computeUpperBoundFontPx(a, tpl) || 1;
        const px = fit.font_px ?? fit.fontPx ?? 0;
        const ratio = ub > 0 ? (px / ub) : 0;
        perArea.push({ areaId: a.id, role, text, fontPx: px, upperBoundPx: ub, ratio, lines: fit.lines ?? 0, widthLimited: !!fit.widthLimited, lhUsed: null, trackingUsed: null });
        roleAreaIndex.set(role, idx + 1);
    }
    return { ok: true, outPath, meta, templateIdUsed: tpl.templateId, bgPathUsed: bgPath, prompts: promptsOut, prompt: promptOut, warnings: warningsOut, winnerId: winner.id, policy, rolePayloadUsed, rolesUsed, perRoleFit, perArea, rawBundleCount: (out.text ? (() => { try {
            const j = JSON.parse(out.text || '[]');
            return Array.isArray(j?.bundles) ? j.bundles.length : Array.isArray(j) ? j.length : 0;
        }
        catch {
            return 0;
        } })() : 0), dedupBundleCount: bundles.length, trace: traceOut, rankTrace: trace, twoStage: !!useTwoStage, angleQuotas, profile, generationMode };
}
