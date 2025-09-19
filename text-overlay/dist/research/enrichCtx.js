import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import crypto from 'crypto';
import { getProvider } from '../llm/providers/index.js';

function hashCtx(ctx) {
  try {
    const h = crypto.createHash('sha1');
    h.update(JSON.stringify({ name: ctx?.product?.name || '', type: ctx?.product?.type || '', benefit: ctx?.product?.benefit || '', audience: ctx?.audience || '', tone: ctx?.tone || '' }));
    return h.digest('hex').slice(0, 10);
  } catch {
    return String(Date.now());
  }
}

export async function enrichCtx(baseCtx, opts = {}) {
  const cacheDir = path.resolve('runs', 'enrich-cache');
  try { if (!fsSync.existsSync(cacheDir)) fsSync.mkdirSync(cacheDir, { recursive: true }); } catch {}
  const key = (opts.cacheKey || hashCtx(baseCtx));
  const cachePath = path.join(cacheDir, `${key}.json`);
  if (opts.useCache !== false) {
    try {
      const raw = await fs.readFile(cachePath, 'utf-8');
      const data = JSON.parse(raw);
      if (data && data.enriched) return data.enriched;
    } catch {}
  }
  const provider = getProvider();
  const prompt = `You are a market research assistant.\nReturn JSON ONLY:\n{\n  "benefits": ["..."],\n  "painPoints": ["..."],\n  "audienceSegments": ["..."],\n  "differentiators": ["..."],\n  "toneWords": ["..."],\n  "keywords": ["..."]\n}\n\nBRAND/PRODUCT CONTEXT:\n${JSON.stringify(baseCtx)}\n\nRULES:\n- Ground items to the provided brand/product/category.\n- Benefits & painPoints: 3–6 each, concrete, no numbers, ≤ 8 words.\n- Keywords: 5–10 domain nouns/phrases (no hashtags/emojis).\n- audienceSegments: 1–3 concise descriptions.\n- differentiators: 2–4 concise claims.\n- toneWords: 2–4 adjectives.\nReturn JSON only.`;
  try {
    const out = await provider.generate({ prompt, n: 1 });
    let parsed = {};
    try { parsed = JSON.parse(out.text || '{}'); } catch { parsed = {}; }
    const cleanArr = (a, min = 0, max = 10) => Array.isArray(a) ? a.map(x => String(x).trim()).filter(Boolean).slice(0, max) : [];
    const enriched = {
      benefits: cleanArr(parsed.benefits, 3, 6),
      painPoints: cleanArr(parsed.painPoints, 3, 6),
      audienceSegments: cleanArr(parsed.audienceSegments, 1, 3),
      differentiators: cleanArr(parsed.differentiators, 2, 4),
      toneWords: cleanArr(parsed.toneWords, 2, 4),
      keywords: cleanArr(parsed.keywords, 5, 10)
    };
    try { await fs.writeFile(cachePath, JSON.stringify({ when: new Date().toISOString(), key, enriched, base: baseCtx }, null, 2), 'utf-8'); } catch {}
    return enriched;
  } catch {
    return {};
  }
}

