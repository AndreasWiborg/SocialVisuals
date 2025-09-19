import { Command } from 'commander';
import path from 'path';
import { promises as fs } from 'fs';
import { fitText } from './layoutOracle.js';
function resolveFontForArea(tpl, area) {
    const roleFont = tpl.fonts[area.role];
    return roleFont?.family || 'Arial';
}
function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
const WORDS = [
    'What', 'if', 'ads', 'wrote', 'themselves', 'turn', 'ideas', 'into', 'on-brand', 'creatives', 'in', 'minutes', 'fast', 'launches', 'better', 'quality', 'trusted', 'teams', 'ship', 'faster', 'design', 'marketing', 'workflow', 'automated', 'smart', 'layout', 'fit', 'balance', 'novel', 'angles', 'proof', 'numbers', 'how', 'to', 'get', 'started', 'today', 'free', 'trial', 'build', 'your', 'ad', 'now'
];
function makeSentence() {
    const len = randInt(4, 12); // keep moderate to avoid exceeding 3 lines
    const words = Array.from({ length: len }, () => WORDS[randInt(0, WORDS.length - 1)]);
    // basic capitalization and punctuation
    const s = words.join(' ');
    const cap = s.charAt(0).toUpperCase() + s.slice(1);
    const punct = Math.random() < 0.3 ? '?' : '.';
    return cap + punct;
}
function median(nums) {
    if (nums.length === 0)
        return 0;
    const a = [...nums].sort((x, y) => x - y);
    const mid = Math.floor(a.length - 1 / 2);
    if (a.length % 2)
        return a[(a.length - 1) / 2];
    const m1 = a[a.length / 2 - 1];
    const m2 = a[a.length / 2];
    return (m1 + m2) / 2;
}
async function main() {
    const program = new Command();
    program
        .requiredOption('--template <path>', 'Template JSON path')
        .option('--samples <n>', 'Number of samples', (v) => parseInt(v, 10), 200)
        .option('--role <role>', 'Area role', 'headline');
    const opts = program.parse(process.argv).opts();
    const tplPath = path.resolve(opts.template);
    const tpl = JSON.parse(await fs.readFile(tplPath, 'utf-8'));
    const area = tpl.areas.find(a => a.role === opts.role);
    if (!area) {
        console.error('Area not found for role:', opts.role);
        process.exit(1);
    }
    const H = area.shape.h;
    const Lmax = typeof area.constraints.maxLines === 'number' ? area.constraints.maxLines : (area.constraints.maxLines.max);
    const LH = area.constraints.lineHeight.value || 1.1;
    const upperBoundEstimate = Math.floor(H / (Lmax * LH));
    const fontFamily = resolveFontForArea(tpl, area);
    const rows = [];
    for (let i = 0; i < opts.samples; i++) {
        const text = makeSentence();
        const rep = await fitText(text, area, fontFamily, tpl.pixelSize.w);
        const font_px = rep.font_px || 0;
        const lines = rep.lines || (rep.lineBreaks ? rep.lineBreaks.length : 0) || 0;
        const ratio = upperBoundEstimate > 0 && rep.fits ? font_px / upperBoundEstimate : 0;
        rows.push({ text, fits: !!rep.fits, font_px, lines, ratio });
    }
    const fits = rows.filter(r => r.fits);
    const fitRate = rows.length ? Math.round((fits.length / rows.length) * 100) : 0;
    const medianFont = median(fits.map(r => r.font_px));
    const medianRatio = median(fits.map(r => r.ratio));
    // write CSV
    const header = 'text,fits,font_px,lines,ratio\n';
    const csv = rows.map(r => {
        const text = '"' + r.text.replace(/"/g, '""') + '"';
        return [text, r.fits ? 'true' : 'false', r.font_px.toFixed(0), r.lines.toString(), r.ratio.toFixed(3)].join(',');
    }).join('\n');
    await fs.writeFile('qa.csv', header + csv, 'utf-8');
    const summary = { samples: rows.length, fitRate, medianFont, medianRatio: Number(medianRatio.toFixed(3)), upperBoundEstimate };
    console.log(JSON.stringify(summary, null, 2));
}
main().catch(err => {
    console.error(err);
    process.exit(1);
});
