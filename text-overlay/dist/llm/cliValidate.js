import fs from 'fs';
import path from 'path';
import { deriveRoleSchema } from '../roles.js';
import { enrichSchema } from '../roleSemantics.js';
import { validateAndClean } from './ingest.js';
function getArg(flag) {
    const idx = process.argv.indexOf(flag);
    if (idx >= 0 && idx + 1 < process.argv.length)
        return process.argv[idx + 1];
    return undefined;
}
async function main() {
    const tplPath = getArg('--template');
    const bundlesPath = getArg('--bundles');
    const ctxPath = getArg('--ctx');
    if (!tplPath || !bundlesPath) {
        console.error('Usage: node dist/llm/cliValidate.js --template <path> --bundles <path> [--ctx <path>]');
        process.exit(2);
    }
    const tpl = JSON.parse(fs.readFileSync(path.resolve(tplPath), 'utf-8'));
    const ctx = ctxPath ? JSON.parse(fs.readFileSync(path.resolve(ctxPath), 'utf-8')) : {};
    const schema = deriveRoleSchema(tpl);
    const enriched = enrichSchema(tpl, schema, ctx);
    const bundles = JSON.parse(fs.readFileSync(path.resolve(bundlesPath), 'utf-8'));
    const res = validateAndClean(bundles, schema, enriched);
    if (!res.ok) {
        console.error(JSON.stringify({ ok: false, errors: res.errors, warnings: res.warnings }, null, 2));
        process.exit(1);
    }
    console.log(JSON.stringify({ ok: true, count: res.bundles?.length, warnings: res.warnings, scores: res.scores }, null, 2));
}
main().catch(err => { console.error(err); process.exit(1); });
