export function normalizeForEquality(s) {
    return s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!?…-]+$/, '');
}
export function dedupeArrayKeepOrder(a) {
    const seen = new Set();
    const out = [];
    for (const s of a) {
        const k = normalizeForEquality(s);
        if (!k || seen.has(k))
            continue;
        seen.add(k);
        out.push(s.trim());
    }
    return out;
}
// Alias matching requested API name
export function dedupeKeepOrder(a) {
    return dedupeArrayKeepOrder(a);
}
