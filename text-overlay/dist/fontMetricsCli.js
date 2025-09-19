import { Command } from 'commander';
import path from 'path';
import { writeCapHeightForTemplate } from './fontMetrics.js';
const program = new Command();
program
    .requiredOption('--template <path>', 'Template JSON path')
    .action(async (opts) => {
    const p = path.resolve(opts.template);
    await writeCapHeightForTemplate(p);
    console.log('Updated capHeightRatio in template:', p);
});
program.parseAsync(process.argv);
