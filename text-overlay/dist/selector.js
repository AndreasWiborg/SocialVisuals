import { mmrSelect } from './mmr.js';
import { endsWithStopword, collapseSpaces } from './textQuality.js';
import { trigramSet, loadNovelty, saveNovelty, noveltyPenalty } from './novelty.js';
export function baseScore(c) {
    const s = Math.log(1 + Math.max(0, c.fit.font_px));
    const penalties = 0.5 * (c.fit.penalties || 0);
    const linesPenalty = c.fit.lines > 3 ? 0.2 : 0;
    const hyphPenalty = c.fit.used_hyphenation ? 0.05 : 0;
    const textPenalty = qualityPenalty(c.text);
    return s - penalties - linesPenalty - hyphPenalty - textPenalty;
}
function clamp(n, min = 0, max = Infinity) {
    return Math.max(min, Math.min(max, n));
}
function qualityPenalty(text) {
    const t = collapseSpaces(text);
    let p = 0;
    if (!t)
        return 0.5; // heavy penalty for empty
    const isQuestion = /\b(what if|how to)\b/i.test(t);
    if (isQuestion && !t.trim().endsWith('?'))
        p += 0.1;
    if (endsWithStopword(t))
        p += 0.25; // stronger to avoid truncated tails
    if (/\b(every|without|with|and|or|to|for|of)\b\.?$/i.test(t))
        p += 0.2;
    const toks = t.split(/\s+/);
    if (toks.length < 3)
        p += 0.2;
    // ends with a verb-like word (common generator verbs)
    if (/\b(ship|create|design|launch|scale|refine|automate|test|publish|build|wrote)\b\.?$/i.test(t))
        p += 0.1;
    return p;
}
export async function selectTop(cands, opts) {
    const { k, key, quotas, lambda = 0.75 } = opts;
    if (k <= 0 || cands.length === 0)
        return [];
    // a) base score
    const scored = cands.map(c => ({ ...c, _score: baseScore(c) }));
    // b) novelty penalty
    let recent = new Set();
    if (key) {
        recent = await loadNovelty(key);
    }
    const withNovelty = scored.map(c => {
        const penalty = key ? noveltyPenalty(c.text, recent) : 0;
        return { ...c, _score: c._score - penalty };
    });
    // c) MMR selection to get pool of 2k
    const items = withNovelty.map(c => ({ id: c.id, text: c.text, score: c._score }));
    const poolSize = clamp(2 * k, 1, items.length);
    const mmrPoolIds = mmrSelect(items, poolSize, lambda).map(it => it.id);
    const idToCand = new Map(withNovelty.map(c => [c.id, c]));
    const pool = mmrPoolIds.map(id => idToCand.get(id)).filter(Boolean);
    // d) Enforce quotas
    const maxPct = quotas?.maxPct || {};
    const minPct = quotas?.minPct || {};
    const maxCounts = new Map();
    const minCounts = new Map();
    const angles = Array.from(new Set(pool.map(p => p.angle)));
    for (const a of angles) {
        if (a in maxPct)
            maxCounts.set(a, Math.floor(clamp(maxPct[a], 0, 1) * k));
        else
            maxCounts.set(a, Infinity);
        if (a in minPct)
            minCounts.set(a, Math.ceil(clamp(minPct[a], 0, 1) * k));
    }
    const selected = [];
    const counts = new Map();
    const usedIds = new Set();
    // First satisfy minimums where possible
    for (const [ang, minCount] of minCounts) {
        if (minCount <= 0)
            continue;
        for (const cand of pool) {
            if (selected.length >= k)
                break;
            if (usedIds.has(cand.id))
                continue;
            if (cand.angle !== ang)
                continue;
            const maxC = maxCounts.get(ang) ?? Infinity;
            const curr = counts.get(ang) || 0;
            if (curr >= maxC)
                continue;
            selected.push(cand);
            usedIds.add(cand.id);
            counts.set(ang, curr + 1);
            if ((counts.get(ang) || 0) >= minCount)
                break;
        }
    }
    // Then fill remaining respecting max
    for (const cand of pool) {
        if (selected.length >= k)
            break;
        if (usedIds.has(cand.id))
            continue;
        const ang = cand.angle;
        const maxC = maxCounts.get(ang) ?? Infinity;
        const curr = counts.get(ang) || 0;
        if (curr >= maxC)
            continue;
        selected.push(cand);
        usedIds.add(cand.id);
        counts.set(ang, curr + 1);
    }
    // e) Update novelty store
    if (key) {
        const merged = new Set(recent);
        for (const c of selected)
            for (const g of trigramSet(c.text))
                merged.add(g);
        await saveNovelty(key, merged);
    }
    return selected;
}
