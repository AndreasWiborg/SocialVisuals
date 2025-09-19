import fs from 'fs/promises';
import path from 'path';
import pLimit from 'p-limit';
import { fetchUrl } from '../scrape/fetch.js';
import { parseHTML } from '../scrape/parse.js';
import { buildCtxFromParsed } from '../research/ctxBuilder.js';
import { deriveRoleSchema } from '../roles.js';
import { enrichSchema } from '../roleSemantics.js';
import { buildLLMPrompt } from '../llm/promptBuilder.js';
import { getProvider } from '../llm/providers/index.js';
import { validateAndClean } from '../llm/ingest.js';
import { fitBundleAllRoles } from '../rankerBundle.js';
import { renderBundle } from './renderBundle.js';
import { initRun, appendItem, finalizeRun } from '../runs/recorder.js';
async function walkJsonFiles(startDir) {
    const out = [];
    async function rec(dir) {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const ent of entries) {
            const p = path.join(dir, ent.name);
            if (ent.isDirectory())
                await rec(p);
            else if (ent.isFile && ent.isFile?.() || ent.isFile === undefined) {
                if (p.toLowerCase().endsWith('.json'))
                    out.push(p);
            }
        }
    }
    await rec(startDir);
    return out;
}
function globToRegex(glob) {
    let esc = glob.replace(/[.+^${}()|\[\]\\]/g, '\\$&');
    esc = esc.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*');
    return new RegExp('^' + esc + '$');
}
export async function runBatchFromUrl(input) {
    const started = Date.now();
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const runDir = input.outDir || path.resolve(`./runs/${ts}`);
    await initRun(runDir, new Date().toISOString());
    // 1) scrape → parse → ctx once
    const f = await fetchUrl(input.url);
    if (f.status >= 400)
        throw new Error(`fetch failed: ${f.status}`);
    const parsed = parseHTML(f.html, f.finalUrl);
    const ctx = buildCtxFromParsed(parsed);
    const provider = getProvider();
    const items = [];
    // Build templates list (merge inline and glob)
    const merged = [];
    if (input.templates && Array.isArray(input.templates))
        merged.push(...input.templates);
    if (input.templatesGlob) {
        const absGlob = path.resolve(input.templatesGlob);
        const base = absGlob.split('*')[0] || process.cwd();
        const rx = globToRegex(absGlob);
        const files = await walkJsonFiles(base);
        for (const f of files) {
            const abs = path.resolve(f);
            if (rx.test(abs))
                merged.push({ templatePath: abs });
        }
    }
    if (merged.length === 0)
        throw new Error('No templates provided');
    const limit = pLimit(Math.max(1, input.concurrency || 4));
    const usedPrefixes = new Set();
    await Promise.all(merged.map(t => limit(async () => {
        const t0 = Date.now();
        let tpl;
        try {
            if (t.template)
                tpl = t.template;
            else if (t.templatePath) {
                const raw = await fs.readFile(path.resolve(t.templatePath), 'utf-8');
                tpl = JSON.parse(raw);
            }
            if (!tpl)
                throw new Error('template not provided');
            const templateId = tpl.templateId || path.basename(t.templatePath || 'template.json').replace(/\.json$/i, '');
            const schema = deriveRoleSchema(tpl);
            const enriched = enrichSchema(tpl, schema, ctx);
            const n = input.n || 16;
            const prompt = buildLLMPrompt(ctx, enriched, n);
            const { text } = await provider.generate({ prompt, n });
            let bundles;
            try {
                bundles = JSON.parse(text);
            }
            catch {
                bundles = JSON.parse(JSON.stringify({ bundles: [] })).bundles;
            }
            if (bundles && bundles.bundles)
                bundles = bundles.bundles;
            const parsedLLM = validateAndClean(bundles, schema, enriched);
            if (!parsedLLM.ok) {
                items.push({ templateId, template: tpl, outPath: '', warnings: parsedLLM.warnings, error: (parsedLLM.errors || []).join('; '), promptChars: prompt.length, ms: Date.now() - t0 });
                return;
            }
            // Fit all roles, pick best aggregate
            const font = input.fontFamily || tpl.fonts?.headline?.family || 'Arial';
            const fits = [];
            for (const b of parsedLLM.bundles) {
                fits.push(await fitBundleAllRoles(tpl, b, font, ctx?.locale));
            }
            // novelty-aware pick across outputs
            const sorted = fits.filter(f => f.ok).sort((a, b) => b.score - a.score);
            let winnerFit = sorted[0];
            for (const cand of sorted) {
                const h = (cand.texts?.headline?.[0] || '').toLowerCase();
                const prefix = h.split(/\s+/).slice(0, 3).join(' ');
                if (prefix && !usedPrefixes.has(prefix)) {
                    winnerFit = cand;
                    usedPrefixes.add(prefix);
                    break;
                }
            }
            if (!winnerFit) {
                items.push({ templateId, template: tpl, outPath: '', warnings: parsedLLM.warnings, error: 'no full-bundle candidates fit', promptChars: prompt.length, ms: Date.now() - t0 });
                return;
            }
            const winner = parsedLLM.bundles.find(b => b.id === winnerFit.bundleId);
            // Render
            const outPath = path.join(runDir, `${templateId}.png`);
            const meta = await renderBundle(tpl, winner, input.bgPath, outPath, font, input.brandColors, ctx?.locale);
            const record = {
                templateId,
                template: tpl,
                outPath,
                meta,
                winner: { bundleId: winnerFit.bundleId, texts: winnerFit.texts, fits: winnerFit.fits },
                policy: { coherence: (parsedLLM.scores?.[winnerFit.bundleId]?.coherence || 0), ctaOk: !!(parsedLLM.scores?.[winnerFit.bundleId]?.ctaOk ?? true) },
                warnings: parsedLLM.warnings,
                promptChars: prompt.length,
                ms: Date.now() - t0
            };
            items.push(record);
            try {
                const ctxSummary = { product: ctx?.product, audience: ctx?.audience, tone: ctx?.tone, brandVoice: ctx?.brandVoice, locale: ctx?.locale, brandId: ctx?.brandId };
                await appendItem(runDir, { templateId, bgPath: input.bgPath, outPath, chosenBundleId: winnerFit.bundleId, angle: winner.angle, meta, ctxSummary, rolesUsed: winnerFit.texts, perRoleFit: winnerFit.fits, brandId: ctx?.brandId });
            }
            catch { }
        }
        catch (e) {
            items.push({ templateId: tpl?.templateId || (t.templatePath || 'unknown'), template: tpl, outPath: '', error: String(e?.message || e), ms: Date.now() - t0 });
        }
    })));
    const manifest = {
        url: input.url,
        runDir,
        tookMs: Date.now() - started,
        items: items.map(i => ({
            templateId: i.templateId,
            outPath: i.outPath,
            policy: i.policy,
            promptChars: i.promptChars,
            ms: i.ms,
            warnings: i.warnings,
            error: i.error,
            winner: i.winner,
            meta: i.meta
        }))
    };
    try {
        await finalizeRun(runDir);
    }
    catch { }
    await fs.writeFile(path.join(runDir, 'manifest.json'), JSON.stringify({ ...manifest, startedAt: undefined, finishedAt: undefined, total: items.length }, null, 2), 'utf-8');
    return manifest;
}
