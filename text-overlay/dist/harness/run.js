import fs from 'fs/promises';
import path from 'path';
import { corpus } from './corpus.js';
async function postJSON(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}
function uniqueCount(arr) {
  const seen = new Set(arr.map(s => s.trim().toLowerCase()));
  return seen.size;
}
async function main() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.resolve(`runs/harness/${ts}`);
  await fs.mkdir(outDir, { recursive: true });
  const base = process.env.API_BASE || 'http://localhost:3000';
  const results = [];
  for (const item of corpus) {
    try {
      const payload = { templateId: item.templateId, bgPath: item.bgPath, profileId: 'staging', twoStage: true, outDir };
      if (item.url) payload.url = item.url; else if (item.ctx) payload.ctx = item.ctx;
      const r = await postJSON(`${base}/pipeline/generateOnComposed`, payload);
      const winnerId = r?.winnerId;
      const rolePayload = r?.rolePayloadUsed || {};
      const roles = rolePayload?.roles || r?.rolesUsed || {};
      const perRoleFit = r?.perRoleFit || {};
      const trace = r?.trace || {};
      const candidates = Array.isArray(trace?.candidates) ? trace.candidates : [];
      const picked = trace?.picked || winnerId;
      const pickedC = candidates.find((c) => c.id === picked) || {};
      const headlineFit = (r?.rankTrace?.[0]?.perRole?.headline?.[0]) || (pickedC?.perRole?.headline?.[0]) || null;
      const fitAttempts = Object.values(perRoleFit).flat().length;
      const fitSuccess = Object.values(perRoleFit).flat().filter((f) => (f.fontPx || 0) > 0).length;
      const fitRate = fitAttempts ? (fitSuccess / fitAttempts) : 0;
      const headlineRatio = headlineFit ? (headlineFit.ratio ?? ((headlineFit.fitPx || 0) / Math.max(1, headlineFit.upperBoundPx || 1))) : 0;
      const answerShape = pickedC?.scoreBreakdown?.answerShape ?? 0;
      const bodies = Array.isArray(roles?.body) ? roles.body : (roles?.body ? [String(roles.body)] : []);
      const duplicateBodiesCount = bodies.length - uniqueCount(bodies);
      const angle = pickedC?.angle || r?.rankTrace?.[0]?.angle || null;
      const metrics = { fitRate, headline: { ratio: headlineRatio }, answerShape, duplicateBodiesCount, angle };
      results.push({ templateId: item.templateId, ok: true, winnerId, angle, metrics });
    } catch (e) {
      results.push({ templateId: item.templateId, ok: false, error: String(e?.message || e) });
    }
  }
  const questionWins = results.filter(r => r.ok && r.metrics?.angle === 'QUESTION').length;
  const okCount = results.filter(r => r.ok).length || 1;
  const avgFitRate = results.filter(r => r.ok).reduce((a, r) => a + (r.metrics?.fitRate || 0), 0) / okCount;
  const avgAnswerShape = results.filter(r => r.ok).reduce((a, r) => a + (r.metrics?.answerShape || 0), 0) / okCount;
  const dupTotals = results.filter(r => r.ok).reduce((a, r) => a + (r.metrics?.duplicateBodiesCount || 0), 0);
  const summary = { ts, count: results.length, ok: results.filter(r => r.ok).length, questionWinnerRatio: questionWins / okCount, avgFitRate, avgAnswerShape, totalDuplicateBodies: dupTotals, results };
  await fs.mkdir(path.dirname(outDir), { recursive: true });
  await fs.writeFile(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf-8');
  console.log(`Harness summary written: ${path.join(outDir, 'summary.json')}`);
}
main().catch(e => { console.error(e); process.exit(1); });

