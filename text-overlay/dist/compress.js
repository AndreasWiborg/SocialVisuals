export const COMPRESS_PROMPT = `You are a precise copy editor.
Shorten the text to <= {{BUDGET}} graphemes while preserving the main claim.
Keep must-include tokens: {{MUST}}. Avoid: {{AVOID}}.
Tone: {{TONE}}. Return plain text only.`;
function collapseSpaces(s) {
    return s.trim().replace(/\s+/g, ' ');
}
const FILLERS = new Set([
    'really', 'very', 'just', 'that', 'actually', 'basically', 'literally', 'simply'
]);
const PHRASE_REPLACEMENTS = [
    [/\bin order to\b/gi, 'to'],
    [/\bas well as\b/gi, 'and'],
    [/\bkind of\b/gi, ''],
    [/\bsort of\b/gi, ''],
];
function containsAllMust(text, must) {
    if (!must || must.length === 0)
        return true;
    const lower = text.toLowerCase();
    return must.every(tok => lower.includes(String(tok).toLowerCase()));
}
function removeAvoids(text, avoid) {
    if (!avoid || avoid.length === 0)
        return text;
    let out = text;
    for (const a of avoid) {
        const re = new RegExp(a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        // Simple synonym replacements for a couple of common avoids
        const replacement = a.toLowerCase() === 'free trial' ? 'trial' : '';
        out = out.replace(re, replacement);
    }
    return collapseSpaces(out);
}
export async function compressToBudget(text, opts) {
    const budget = Math.max(1, opts.targetGraphemes | 0);
    const must = opts.mustInclude || [];
    const avoid = opts.mustAvoid || [];
    const orig = collapseSpaces(text);
    let curr = orig;
    let changed = false;
    const removed = [];
    if (curr.length <= budget && containsAllMust(curr, must)) {
        return { ok: true, text: curr, changed: false };
    }
    // 2) Phrase replacements
    for (const [re, repl] of PHRASE_REPLACEMENTS) {
        const next = collapseSpaces(curr.replace(re, repl));
        if (next !== curr)
            changed = true;
        curr = next;
    }
    // 2b) Remove duplicate adjacent words
    {
        const toks = curr.split(/\s+/);
        const dedup = [];
        for (const w of toks) {
            if (dedup.length && dedup[dedup.length - 1].toLowerCase() === w.toLowerCase()) {
                changed = true;
                continue;
            }
            dedup.push(w);
        }
        curr = collapseSpaces(dedup.join(' '));
    }
    // 3) Remove filler words where safe
    {
        const toks = curr.split(/\s+/);
        const kept = [];
        for (const w of toks) {
            if (FILLERS.has(w.toLowerCase())) {
                changed = true;
                removed.push(w);
                continue;
            }
            kept.push(w);
        }
        const next = collapseSpaces(kept.join(' '));
        if (containsAllMust(next, must))
            curr = next;
    }
    // 6) Ensure mustAvoid not present
    curr = removeAvoids(curr, avoid);
    // 5) If still over budget, trim from end while preserving mustInclude
    if (curr.length > budget) {
        let toks = curr.split(/\s+/);
        while (toks.length > 1 && collapseSpaces(toks.join(' ')).length > budget) {
            const candidate = collapseSpaces(toks.slice(0, -1).join(' '));
            // only drop if must tokens still present
            if (containsAllMust(candidate, must)) {
                toks = toks.slice(0, -1);
                changed = true;
                continue;
            }
            break;
        }
        curr = collapseSpaces(toks.join(' '));
    }
    const ok = curr.length <= budget && containsAllMust(curr, must);
    const rationale = ok ? `compressed to ${curr.length}/${budget}` : `over budget ${curr.length}/${budget}`;
    return { ok, text: curr, changed, removed, rationale };
}
