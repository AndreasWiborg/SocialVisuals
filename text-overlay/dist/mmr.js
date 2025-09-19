import { trigramSet } from './novelty.js';
export function jaccard(a, b) {
    if (a.size === 0 && b.size === 0)
        return 0;
    let inter = 0;
    for (const x of a)
        if (b.has(x))
            inter++;
    const union = a.size + b.size - inter;
    return union === 0 ? 0 : inter / union;
}
export function mmrSelect(items, k, lambda = 0.75) {
    if (k <= 0 || items.length === 0)
        return [];
    const grams = new Map();
    for (const it of items)
        grams.set(it.id, trigramSet(it.text));
    const remaining = [...items].sort((a, b) => b.score - a.score);
    const selected = [];
    // seed with highest score
    selected.push(remaining.shift());
    while (selected.length < k && remaining.length > 0) {
        let bestIdx = 0;
        let bestVal = -Infinity;
        for (let i = 0; i < remaining.length; i++) {
            const cand = remaining[i];
            const candGram = grams.get(cand.id);
            let maxSim = 0;
            for (const s of selected) {
                const sim = jaccard(candGram, grams.get(s.id));
                if (sim > maxSim)
                    maxSim = sim;
            }
            const mmr = lambda * cand.score - (1 - lambda) * maxSim;
            if (mmr > bestVal) {
                bestVal = mmr;
                bestIdx = i;
            }
        }
        selected.push(remaining.splice(bestIdx, 1)[0]);
    }
    return selected;
}
