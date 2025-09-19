import { Command } from 'commander';
import path from 'path';
import { promises as fs } from 'fs';
import { fitText } from './layoutOracle.js';
import { renderText } from './render.js';
import { generateBundles } from './bundleGen.js';
import { deriveRoleSchema } from './roles.js';
import { selectTop } from './selector.js';
import { compressToBudget } from './compress.js';
import { maxLinesValue } from './types.js';
async function readJson(p) {
    const buf = await fs.readFile(p, 'utf-8');
    return JSON.parse(buf);
}
function resolveFontForArea(tpl, area, override) {
    if (override)
        return override;
    const roleFont = tpl.fonts[area.role];
    if (roleFont?.family)
        return roleFont.family;
    return 'Arial';
}
const program = new Command();
program
    .name('pipeline')
    .description('End-to-end bundles → selection → render');
program
    .command('run')
    .requiredOption('--template <path>', 'Template JSON path')
    .requiredOption('--bg <path>', 'Background image path')
    .option('--brand <hexes>', 'Comma-separated brand hex colors, e.g. "#0057FF,#FF3B30"')
    .option('--font <family>', 'Font family override')
    .option('--brandId <id>', 'Brand identifier', 'demoBrand')
    .option('--k <number>', 'How many to select', (v) => parseInt(v, 10), 3)
    .option('--minFontRatio <r>', 'Min acceptable font ratio vs bound (0-1)', (v) => parseFloat(v), 0.70)
    .option('--headlineText <text>', 'Override headline/scoring text')
    .action(async (opts) => {
    const tplPath = path.resolve(opts.template);
    const tpl = await readJson(tplPath);
    const schema = deriveRoleSchema(tpl);
    const hlSpec = schema.specs.find(s => s.role === 'headline') || schema.specs[0];
    if (!hlSpec) {
        console.error('No roles found in template');
        process.exit(1);
    }
    const headline = tpl.areas.find(a => a.role === hlSpec.role);
    if (!headline) {
        console.error('No area found matching role for scoring:', hlSpec.role);
        process.exit(1);
    }
    const fontFamily = resolveFontForArea(tpl, headline, opts.font);
    const ctx = {
        product: { name: 'Demo Product', benefit: 'Saves time' },
        audience: 'Marketers and designers',
        tone: 'friendly, concise',
        brandVoice: 'confident, helpful',
        mustInclude: [],
        mustAvoid: [],
        locale: 'en-US'
    };
    const bundles = await generateBundles(ctx, schema, 14);
    // Fit each bundle H1 into headline area
    const fitReports = new Map();
    const cands = [];
    for (const b of bundles) {
        const roleVal = b.roles[hlSpec.role];
        const derivedText = Array.isArray(roleVal) ? String(roleVal.join(' ')) : String(roleVal || '');
        const text = opts.headlineText ? String(opts.headlineText) : derivedText;
        if (!text)
            continue;
        let rep = await fitText(text, headline, fontFamily, tpl.pixelSize?.w, { locale: ctx.locale });
        // Upper bound estimate for this area
        const H = headline.shape.h;
        const Lmax = maxLinesValue(headline.constraints.maxLines);
        const LH = headline.constraints.lineHeight.value || 1.1;
        const upperBoundEstimate = Math.floor(H / (Lmax * LH));
        // If it doesn't fit, or font is too low relative to bound, try compression up to 2 passes
        let usedText = text;
        let compressedOnce = false;
        for (let pass = 0; pass < 2; pass++) {
            if (rep.fits && rep.font_px && rep.font_px >= Math.floor((opts.minFontRatio || 0.70) * upperBoundEstimate))
                break;
            const target = Math.max(12, Math.floor(usedText.length * 0.85));
            const comp = await compressToBudget(usedText, { targetGraphemes: target, mustInclude: ctx.mustInclude });
            if (!comp.changed)
                break;
            usedText = comp.text;
            rep = await fitText(usedText, headline, fontFamily, tpl.pixelSize?.w, { locale: ctx.locale });
            compressedOnce = true;
            if (rep.fits && rep.font_px && rep.font_px >= Math.floor((opts.minFontRatio || 0.70) * upperBoundEstimate))
                break;
        }
        if (compressedOnce) {
            console.log(`[compress] ${b.id}: compressed (${text.length}→${usedText.length}) and refit (font=${rep.font_px})`);
        }
        if (!rep.fits)
            continue;
        fitReports.set(b.id, rep);
        cands.push({
            id: b.id,
            bundleId: b.id,
            angle: b.angle,
            text: usedText,
            fit: {
                font_px: rep.font_px || 0,
                lines: rep.lines || (rep.lineBreaks ? rep.lineBreaks.length : 0) || 0,
                penalties: rep.used_hyphenation ? 0.1 : 0,
                used_hyphenation: rep.used_hyphenation
            }
        });
    }
    if (cands.length === 0) {
        console.error('No fitting candidates');
        process.exit(2);
    }
    const brandColors = opts.brand
        ? String(opts.brand).split(',').map(s => s.trim()).filter(Boolean)
        : tpl.palette?.brand;
    const selected = await selectTop(cands, {
        k: opts.k,
        key: { brandId: opts.brandId, templateId: tpl.templateId },
        quotas: { maxPct: { QUESTION: 0.34 } },
        lambda: 0.75
    });
    const best = selected[0];
    const bestRep = fitReports.get(best.id);
    const outPath = path.resolve('out_pipeline.png');
    const meta = await renderText(path.resolve(opts.bg), outPath, headline, best.text, fontFamily, bestRep, brandColors);
    const topSummaries = selected.slice(0, 3).map(s => ({ id: s.id, angle: s.angle, font_px: (fitReports.get(s.id)?.font_px || 0), text: s.text }));
    console.log(JSON.stringify({ selected: topSummaries, out: meta }, null, 2));
});
program.parseAsync(process.argv);
