import { Command } from 'commander';
import { promises as fs } from 'fs';
import path from 'path';
import { fitText } from './layoutOracle.js';
import { renderText } from './render.js';
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
    .name('text-overlay')
    .description('Fit and render text to templates');
program
    .command('fit')
    .requiredOption('--template <path>', 'Template JSON path')
    .option('--role <role>', 'Role to target (e.g., headline)')
    .option('--area <id>', 'Specific area id')
    .requiredOption('--text <text>', 'Text to fit')
    .option('--font <family>', 'Font family override')
    .option('--locale <bcp47>', 'Locale (e.g., en-US, de-DE)')
    .action(async (opts) => {
    const tplPath = path.resolve(opts.template);
    const tpl = await readJson(tplPath);
    let area;
    if (opts.area) {
        area = tpl.areas.find(a => a.id === opts.area);
    }
    else if (opts.role) {
        area = tpl.areas.find(a => a.role === opts.role);
    }
    if (!area) {
        console.error('Area not found. Provide --area <id> or --role <role>.');
        process.exit(1);
    }
    const font = resolveFontForArea(tpl, area, opts.font);
    const report = await fitText(opts.text, area, font, tpl.pixelSize.w, { locale: opts.locale });
    // Print raw JSON report
    console.log(JSON.stringify(report, null, 2));
});
program
    .command('render')
    .requiredOption('--template <path>', 'Template JSON path')
    .requiredOption('--area <id>', 'Target area id')
    .requiredOption('--text <text>', 'Text to render')
    .requiredOption('--bg <path>', 'Background image path')
    .option('--out <path>', 'Output image path', 'out.png')
    .option('--stroke', 'Enable stroke outline')
    .option('--strokeWidth <px>', 'Stroke width in px')
    .option('--scrimMax <n>', 'Max scrim opacity (0..1)')
    .option('--brand <hexes>', 'Comma-separated brand hex colors, e.g. "#0057FF,#FF3B30"')
    .option('--font <family>', 'Font family override')
    .option('--locale <bcp47>', 'Locale (e.g., en-US, de-DE)')
    .action(async (opts) => {
    const tplPath = path.resolve(opts.template);
    const tpl = await readJson(tplPath);
    const area = tpl.areas.find(a => a.id === opts.area);
    if (!area) {
        console.error('Area not found in template: ' + opts.area);
        process.exit(1);
    }
    const font = resolveFontForArea(tpl, area, opts.font);
    const report = await fitText(opts.text, area, font, tpl.pixelSize.w, { locale: opts.locale });
    if (!report.fits) {
        console.error('Fit failed:', { reasons: report.reasons });
        process.exit(2);
    }
    const brandFromTpl = tpl.palette?.brand;
    const brandColors = opts.brand
        ? String(opts.brand).split(',').map(s => s.trim()).filter(Boolean)
        : brandFromTpl;
    const options = {
        stroke: opts.stroke ? { widthPx: opts.strokeWidth ? Number(opts.strokeWidth) : undefined } : undefined,
        scrim: opts.scrimMax ? { maxOpacity: Number(opts.scrimMax) } : undefined
    };
    const meta = await renderText(path.resolve(opts.bg), path.resolve(opts.out), area, opts.text, font, report, brandColors, options);
    console.log(JSON.stringify({ outPath: meta.outPath, usedColor: meta.usedColor, contrastRatio: meta.contrastRatio, appliedScrim: meta.appliedScrim }, null, 2));
});
program.parseAsync(process.argv);
