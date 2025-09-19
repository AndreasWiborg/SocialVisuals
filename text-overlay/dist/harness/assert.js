import fs from 'fs/promises';
import path from 'path';
async function main() {
  const baseDir = path.resolve('runs/harness');
  let latest = null;
  try {
    const entries = await fs.readdir(baseDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name).sort();
    latest = dirs[dirs.length - 1] || null;
  } catch {}
  if (!latest) { console.error('No harness runs found.'); process.exit(1); }
  const summaryPath = path.join(baseDir, latest, 'summary.json');
  const summaryRaw = JSON.parse(await fs.readFile(summaryPath, 'utf-8'));
  const baselinePath = path.join(baseDir, 'baseline.json');
  let baseline = null;
  try { baseline = JSON.parse(await fs.readFile(baselinePath, 'utf-8')); } catch {}
  const errors = [];
  const fitRate = summaryRaw.avgFitRate || 0;
  if (fitRate < 0.98) errors.push(`fitRate ${fitRate.toFixed(3)} < 0.98`);
  const qRatio = summaryRaw.questionWinnerRatio || 0;
  if (qRatio > 0.50) errors.push(`questionWinnerRatio ${qRatio.toFixed(3)} > 0.50`);
  if ((summaryRaw.totalDuplicateBodies || 0) !== 0) errors.push(`duplicateBodiesCount total ${summaryRaw.totalDuplicateBodies} != 0`);
  const avgAS = summaryRaw.avgAnswerShape || 0;
  if (avgAS < 0.05) errors.push(`avg(answerShape) ${avgAS.toFixed(3)} < 0.05`);
  if (baseline && typeof baseline.singleLineLiftMedian === 'number') {
    const lift = summaryRaw.singleLineLiftMedian || 0;
    if (lift < 0.06) errors.push(`singleLineLiftMedian ${lift.toFixed(3)} < 0.06`);
  }
  if (errors.length) { console.error('Harness assertions failed:\n- ' + errors.join('\n- ')); process.exit(1); }
  console.log('Harness assertions passed.');
}
main().catch(e => { console.error(e); process.exit(1); });

