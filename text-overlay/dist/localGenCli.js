import { Command } from 'commander';
import path from 'path';
import { promises as fs } from 'fs';
import { deriveRoleSchema } from './roles.js';
import { generateBundlesLocal } from './generateLocal.js';
async function readJson(p) {
    const buf = await fs.readFile(p, 'utf-8');
    return JSON.parse(buf);
}
const program = new Command();
program
    .name('local-gen')
    .description('Generate local, number-free bundles for a template');
program
    .requiredOption('--template <path>', 'Template JSON path')
    .option('--n <n>', 'Bundles to generate', '12')
    .option('--ctx <json>', 'Context JSON inline')
    .action(async (opts) => {
    const tplPath = path.resolve(opts.template);
    const tpl = await readJson(tplPath);
    const schema = deriveRoleSchema(tpl);
    let ctx = opts.ctx ? JSON.parse(opts.ctx) : {
        product: { name: 'Acme' },
        audience: 'SMBs',
        tone: 'clear',
        brandVoice: 'simple',
        locale: 'en-US'
    };
    const bundles = await generateBundlesLocal(ctx, schema, Number(opts.n || '12'));
    console.log(JSON.stringify({ schema, bundles }, null, 2));
});
program.parseAsync(process.argv);
