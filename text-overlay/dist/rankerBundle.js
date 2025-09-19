import { fitText } from "./layoutOracle.js";
import { normalizeForEquality } from './llm/dedup.js';
import { loadProfile } from './config/profiles.js';
function areasForRole(tpl, role) {
    const ids = (tpl.priority || []).filter(id => (tpl.areas.find(a => a.id === id)?.role) === role);
    const rest = tpl.areas.filter(a => a.role === role && !ids.includes(a.id)).map(a => a.id);
    const orderedIds = [...ids, ...rest];
    return orderedIds.map(id => tpl.areas.find(a => a.id === id)).filter(Boolean);
}
export async function fitBundleAllRoles(tpl, bundle, fontFamily, locale) {
    const texts = {};
    const fits = {};
    let ok = true;
    const roleScores = { headline: [], body: [], cta: [] };
    function computeUpperBoundFontPx(area) {
        const H = area.shape.h;
        const Lmax = typeof area.constraints.maxLines === 'number' ? area.constraints.maxLines : area.constraints.maxLines.max;
        const LH = area.constraints.lineHeight?.value || 1.1;
        const C = area.constraints.fontSizing?.capHeightRatio ?? 0.70;
        const targetCap = area.constraints.fontSizing?.optical?.targetCapHeightPx ?? undefined;
        const byHeight = Math.floor(H / Math.max(1, (Lmax * LH)));
        const byOptics = Number.isFinite(targetCap) ? Math.floor(targetCap / Math.max(1e-6, C)) : Number.POSITIVE_INFINITY;
        return Math.max((area.constraints.minFont || 0), Math.min(byHeight, byOptics));
    }
    function scoreArea(area, fontPx, lines, widthLimited) {
        const profile = loadProfile();
        const ub = computeUpperBoundFontPx(area) || 1;
        const ratio = Math.max(0, Math.min(1, fontPx / ub));
        let s = (ratio * 1.0); // primary driver: how close to upper bound
        if (ratio < 0.75)
            s -= 0.40; // smallCutoff penalty
        if (ratio >= 0.90 && ratio <= 1.0)
            s += 0.20; // sweet spot bonus
        if (lines === 1)
            s += 0.10;
        else if (lines === 2)
            s -= 0.04;
        else if (lines >= 3)
            s -= 0.08; // prefer fewer lines
        if (widthLimited)
            s += (profile.ranking?.widthLimitedPenalty ?? -0.02);
        // Optional: penalty if far from optical target
        const C = area.constraints.fontSizing?.capHeightRatio ?? 0.70;
        const tgtCap = area.constraints.fontSizing?.optical?.targetCapHeightPx;
        if (Number.isFinite(tgtCap) && tgtCap > 0) {
            const optPx = tgtCap / Math.max(1e-6, C);
            const dev = Math.abs((fontPx - optPx) / Math.max(1, optPx));
            if (dev > 0.15)
                s -= Math.min(0.25, dev * 0.5); // gently discourage far-from-optimal sizes
        }
        return s;
    }
    // headline (required if present)
    const hAreas = areasForRole(tpl, "headline");
    let hText = bundle.roles["headline"];
    const profFonts = loadProfile();
    if (hText) {
        let t = String(hText);
        if (profFonts?.fonts?.headlineUppercase) t = t.toUpperCase();
        const a = hAreas[0] || tpl.areas[0];
        const rep = await fitText(t, a, fontFamily, tpl.pixelSize?.w, { locale, fontWeight: (profFonts?.fonts?.headlineWeight || 'normal') });
        if (!rep.fits)
            ok = false;
        texts["headline"] = [t];
        const widthLimited = (rep.reasons || []).some(r => String(r).includes("width"));
        fits["headline"] = [{ font_px: rep.font_px || 0, lines: rep.lines || 1, widthLimited }];
        roleScores.headline.push(scoreArea(a, rep.font_px || 0, rep.lines || 1, widthLimited));
    }
    // body (0..N)
    const bAreas = areasForRole(tpl, "body");
    const bVals = Array.isArray(bundle.roles["body"]) ? bundle.roles["body"] :
        bundle.roles["body"] ? [String(bundle.roles["body"])] : [];
    texts["body"] = [];
    fits["body"] = [];
    for (let i = 0; i < Math.min(bAreas.length, bVals.length); i++) {
        let t = String(bVals[i] || '');
        const a = bAreas[i];
        const isSub = /HEADLINE[_-]?SUB/i.test(String(a.id || ''));
        const ff = loadProfile();
        const up = isSub ? !!ff?.fonts?.subheadlineUppercase : !!ff?.fonts?.bodyUppercase;
        const wt = isSub ? (ff?.fonts?.subheadlineWeight || 'normal') : (ff?.fonts?.bodyWeight || 'normal');
        if (up) t = t.toUpperCase();
        const rep = await fitText(t, a, fontFamily, tpl.pixelSize?.w, { locale, fontWeight: wt });
        if (!rep.fits)
            ok = false;
        const widthLimited = (rep.reasons || []).some(r => String(r).includes("width"));
        texts["body"].push(t);
        fits["body"].push({ font_px: rep.font_px || 0, lines: rep.lines || 1, widthLimited });
        roleScores.body.push(scoreArea(a, rep.font_px || 0, rep.lines || 1, widthLimited));
    }
    // cta (0..1)
    const cAreas = areasForRole(tpl, "cta");
    let cText = bundle.roles["cta"] ? String(bundle.roles["cta"]) : "";
    if (cText && cAreas.length) {
        const ff2 = loadProfile();
        const up = !!ff2?.fonts?.ctaUppercase;
        const wt = (ff2?.fonts?.ctaWeight || 'normal');
        if (up) cText = cText.toUpperCase();
        const rep = await fitText(cText, cAreas[0], fontFamily, tpl.pixelSize?.w, { locale, fontWeight: wt });
        if (!rep.fits)
            ok = false;
        const widthLimited = (rep.reasons || []).some(r => String(r).includes("width"));
        texts["cta"] = [cText];
        fits["cta"] = [{ font_px: rep.font_px || 0, lines: rep.lines || 1, widthLimited }];
        roleScores.cta.push(scoreArea(cAreas[0], rep.font_px || 0, rep.lines || 1, widthLimited));
    }
    // penalties for duplicates / insufficient unique items in multi-area roles
    let duplicatePenalty = 0;
    let insufficientPenalty = 0;
    const profile = loadProfile();
    const penalizeRole = (roleName) => {
        const areas = (tpl.areas || []).filter((a) => a.role === roleName).length;
        if (!areas || areas <= 1)
            return;
        const vals = texts[roleName] || [];
        const normed = vals.map(v => normalizeForEquality(String(v || ''))).filter(Boolean);
        const uniq = new Set(normed);
        const dupPen = profile.ranking?.duplicatePenalty ?? 0.40;
        const shortPen = profile.ranking?.shortCountPenalty ?? 0.50;
        if (uniq.size < normed.length)
            duplicatePenalty -= dupPen;
        if (uniq.size < areas)
            insufficientPenalty -= shortPen;
    };
    try {
        penalizeRole('body');
        penalizeRole('bullets');
    }
    catch { }
    // aggregate score: weighted by role importance using ratio-to-upper-bound and optical target
    const scoreH = roleScores.headline.length ? 0.70 * roleScores.headline[0] : 0;
    const scoreB = roleScores.body.length ? 0.25 * (roleScores.body.reduce((a, b) => a + b, 0) / roleScores.body.length) : 0;
    const scoreC = roleScores.cta.length ? 0.05 * roleScores.cta[0] : 0;
    // Red-thread scoring: reward semantic relatedness between headline and body,
    // independent of whether the headline is a question. Penalize generic bodies.
    let answerShape = 0;
    try {
        const headRaw = String(bundle.roles?.headline || '').toLowerCase();
        const bVals = (texts['body'] || []).map(x => String(x || '').toLowerCase());
        const w = profile.ranking?.answerShapeWeight ?? 0.15;
        const stop = new Set(['a','an','the','and','or','to','of','for','with','in','on','at','by','from','your','our','their','this','that','is','are','be','can','you','we','it']);
        const tok = (s) => (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t && !stop.has(t));
        const overlap = (A, B) => {
            if (!A.length || !B.length) return 0;
            const a = new Set(A);
            const b = new Set(B);
            let inter = 0;
            for (const t of a) if (b.has(t)) inter++;
            const denom = Math.min(a.size, b.size) || 1;
            return inter / denom; // proportion of smaller set covered
        };
        const H = tok(headRaw);
        let maxSim = 0;
        for (const bv of bVals) {
            const sim = overlap(H, tok(bv));
            if (sim > maxSim) maxSim = sim;
        }
        // Generic weak openers in bodies deserve a small penalty if similarity is low
        const weakStart = /^(explore|learn|discover|check\s+out)\b/i;
        const anyWeak = bVals.some(t => weakStart.test(t.trim()));
        if (maxSim >= 0.6) answerShape += w;           // clearly related
        else if (maxSim <= 0.2 && anyWeak) answerShape -= w * 0.5; // unrelated + generic
        // else: neutral
    }
    catch { }
    const score = scoreH + scoreB + scoreC + answerShape + duplicatePenalty + insufficientPenalty;
    return { bundleId: bundle.id, texts, fits, ok, score, scoreBreakdown: { headline: scoreH, body: scoreB, cta: scoreC, answerShape, penalties: { duplicates: duplicatePenalty, insufficient: insufficientPenalty } } };
}
export function pickTopBundleByAggregate(fits, policy) {
    for (const bf of fits) {
        const p = policy?.[bf.bundleId];
        if (!p)
            continue;
        if (!p.ctaOk)
            bf.score -= 0.25;
        bf.score += 0.08 * (p.coherence || 0);
    }
    return fits.filter(f => f.ok).sort((a, b) => b.score - a.score)[0];
}
