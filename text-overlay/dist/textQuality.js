export const TRAILING_STOPWORDS = new Set([
    "a", "an", "the", "your", "our", "their", "to", "of", "for", "with", "in", "on", "at", "by", "and", "or",
    // add connectors that often indicate truncation when trailing
    "every", "without", "from", "into", "over", "under", "up", "down", "out", "off", "before", "after", "while", "as", "than", "via", "through"
]);
export function collapseSpaces(s) { return s.trim().replace(/\s+/g, " "); }
export function endsWithStopword(s) {
    const m = collapseSpaces(s).toLowerCase().match(/\b([a-z]+)\s*[\.\!\?]*$/i);
    if (!m)
        return false;
    return TRAILING_STOPWORDS.has(m[1]);
}
// returns null if it can't be rescued minimally
export function cleanHeadline(text, kind = "STATEMENT") {
    let t = collapseSpaces(text);
    // drop trailing stopwords (at most 2)
    let guard = 0;
    while (endsWithStopword(t) && guard++ < 2) {
        t = t.replace(/\s*[^\s]+\s*[\.\!\?]*\s*$/, " ").trim();
    }
    if (!t)
        return null;
    // enforce terminal punctuation for questions
    if (kind === "QUESTION") {
        t = t.replace(/[?.!\s]+$/, " ").trim() + "?";
    }
    else {
        // remove stray punctuation like trailing commas
        t = t.replace(/[,.\s]+$/, " ").trim();
    }
    // minimum token sanity
    const tokens = t.split(/\s+/);
    if (tokens.length < 3)
        return null;
    return t;
}
export function brandShort(name) {
    if (!name)
        return "";
    const parts = String(name).trim().split(/\s+/);
    if (parts.length === 1)
        return parts[0];
    const p0 = parts[0].toLowerCase();
    if (["the", "a", "an"].includes(p0) && parts[1])
        return parts[1];
    return parts[0];
}
