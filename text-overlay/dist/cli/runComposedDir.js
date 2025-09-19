import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { normalizePath } from '../util/paths.js';
import { loadTemplateByIdLoose } from '../pipeline/templateLookup.js';
import { generateOnComposed } from '../pipeline/generateOnComposed.js';
import { fetchUrl } from '../scrape/fetch.js';
import { parseHTML } from '../scrape/parse.js';
import { buildCtxFromParsed } from '../research/ctxBuilder.js';
function parseArgs(argv) {
    const out = { n: 16, k: 3, concurrency: 3 };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        const next = () => argv[++i];
        if (a === '--dir')
            out.dir = next();
        else if (a === '--url')
            out.url = next();
        else if (a === '--ctx')
            out.ctx = next();
        else if (a === '--n')
            out.n = parseInt(next(), 10);
        else if (a === '--k')
            out.k = parseInt(next(), 10);
        else if (a === '--brand')
            out.brand = next();
        else if (a === '--font')
            out.font = next();
        else if (a === '--concurrency')
            out.concurrency = parseInt(next(), 10);
    }
    if (!out.dir)
        throw new Error('--dir is required');
    return out;
}
function inferTemplateIdFromPre(file) {
    const base = path.basename(file).replace(/-pre\.png$/i, '');
    return base.replace(/_/g, '-').toLowerCase();
}
function asBrandArray(s) {
    if (!s)
        return undefined;
    return s.split(',').map(x => x.trim()).filter(Boolean);
}
async function ensureDir(p) { await fs.mkdir(p, { recursive: true }); }
async function readJSON(p) {
    const raw = await fs.readFile(p, 'utf-8');
    return JSON.parse(raw);
}
function fallbackCtx() {
    return {
        product: { name: 'Acme' },
        audience: 'General',
        tone: 'clear',
        brandVoice: 'simple',
        locale: 'en-US'
    };
}
async function buildCtx(url) {
    if (!url)
        return fallbackCtx();
    const { html, finalUrl } = await fetchUrl(url);
    const parsed = parseHTML(html, finalUrl);
    return buildCtxFromParsed(parsed);
}
async function main() {
    // Lightweight .env loader (mirror server behavior)
    try {
        const envPath = path.resolve(process.cwd(), '.env');
        if (fsSync.existsSync(envPath)) {
            const txt = fsSync.readFileSync(envPath, 'utf-8');
            for (const raw of txt.split(/\r?\n/)) {
                const line = raw.trim();
                if (!line || line.startsWith('#'))
                    continue;
                const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
                if (!m)
                    continue;
                let val = m[2];
                if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                    val = val.slice(1, -1);
                }
                if (process.env[m[1]] === undefined)
                    process.env[m[1]] = val;
            }
        }
    }
    catch { }
    const args = parseArgs(process.argv.slice(2));
    const dir = normalizePath(args.dir);
    const brandColors = asBrandArray(args.brand);
    let ctx;
    if (args.ctx) {
        ctx = await readJSON(normalizePath(args.ctx));
    }
    else if (args.url) {
        ctx = await buildCtx(args.url);
    }
    else {
        ctx = fallbackCtx();
    }
    const entries = await fs.readdir(dir);
    const jobs = entries.filter(f => f.toLowerCase().endsWith('-pre.png'));
    const total = jobs.length;
    if (total === 0) {
        console.log('No *-pre.png files found in', dir);
        process.exit(0);
    }
    const runDir = path.resolve('runs', `composed-${Date.now()}`);
    await ensureDir(runDir);
    // Promise pool
    const concurrency = Math.max(1, args.concurrency || 3);
    let idx = 0, succeeded = 0, failed = 0;
    const results = [];
    async function worker() {
        while (true) {
            const i = idx++;
            if (i >= total)
                break;
            const file = jobs[i];
            const absPng = path.join(dir, file);
            const templateId = inferTemplateIdFromPre(file);
            try {
                const tpl = await loadTemplateByIdLoose(templateId);
                const outFileName = `${templateId}.png`;
                const r = await generateOnComposed({
                    tpl,
                    ctx,
                    bgPath: absPng,
                    n: args.n,
                    k: args.k,
                    brandColors,
                    fontFamily: args.font,
                    outDir: runDir,
                    outFileName
                });
                if (r.ok) {
                    succeeded++;
                    const meta = r.meta || {};
                    const head = meta.headlineMeta || {};
                    const sidecar = {
                        ok: true,
                        winnerId: r.winnerId,
                        outPath: r.outPath,
                        policy: r.policy,
                        warnings: r.warnings,
                        meta,
                        ctxSummary: { product: ctx.product, audience: ctx.audience, locale: ctx.locale },
                        fontPx: head.font_px,
                        lines: head.lines
                    };
                    await fs.writeFile(path.join(runDir, `${templateId}.json`), JSON.stringify(sidecar, null, 2));
                    results.push({ templateId, ok: true, outPath: r.outPath, winnerId: r.winnerId });
                }
                else {
                    failed++;
                    const sidecar = { ok: false, errors: r.errors, warnings: r.warnings };
                    await fs.writeFile(path.join(runDir, `${templateId}.json`), JSON.stringify(sidecar, null, 2));
                    results.push({ templateId, ok: false });
                }
            }
            catch (e) {
                failed++;
                await fs.writeFile(path.join(runDir, `${templateId}.json`), JSON.stringify({ ok: false, error: String(e?.message || e) }, null, 2));
                results.push({ templateId, ok: false });
            }
        }
    }
    const workers = Array.from({ length: concurrency }, () => worker());
    await Promise.all(workers);
    const manifest = {
        dir,
        n: args.n,
        k: args.k,
        total,
        results: results.map(r => ({ templateId: r.templateId, ok: r.ok, outPath: r.outPath, winnerId: r.winnerId }))
    };
    await fs.writeFile(path.join(runDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    // Print compact table
    for (const r of results) {
        const sidePath = path.join(runDir, `${r.templateId}.json`);
        try {
            const side = JSON.parse(await fs.readFile(sidePath, 'utf-8'));
            const fontPx = side.fontPx ?? (side.meta?.headlineMeta?.font_px);
            const lines = side.lines ?? (side.meta?.headlineMeta?.lines);
            console.log(`${r.templateId} | ${r.ok ? 'OK' : 'FAIL'} | ${fontPx ?? '-'} | ${lines ?? '-'} | ${r.outPath ?? '-'}`);
        }
        catch {
            console.log(`${r.templateId} | ${r.ok ? 'OK' : 'FAIL'} | - | - | ${r.outPath ?? '-'}`);
        }
    }
    // Final short confirmation
    const sample = results.filter(r => r.ok).slice(0, 3).map(r => r.outPath).filter(Boolean);
    console.log('\nRun complete');
    console.log(`Run folder: ${runDir}`);
    console.log(`Discovered: ${total} | Succeeded: ${succeeded} | Failed: ${failed}`);
    if (sample.length) {
        console.log('Sample outputs:');
        for (const s of sample)
            console.log(` - ${s}`);
    }
}
main().catch(err => {
    console.error(err);
    process.exit(1);
});
