import Hypher from 'hypher';
import english from 'hyphenation.en-us';
import { detectScript, hyphenationLocaleFromBCP47 } from './lang.js';
let HYPHER = null;
let HYPHER_WARNED = false;
function getHypher(locale) {
    // Only english dictionary is guaranteed; for others, we attempt dynamic import elsewhere or fall back.
    if (!HYPHER) {
        HYPHER = new Hypher(english);
    }
    return HYPHER;
}
const TOLERANCE = 0.5; // px
function width(ctx, s) {
    return ctx.measureText(s).width;
}
function collapseSpaces(s) {
    return s.trim().replace(/\s+/g, ' ');
}
function fitsWithin(ctx, s, maxWidth) {
    return width(ctx, s) <= maxWidth + TOLERANCE;
}
function naiveHyphenate(word) {
    if (word.length < 8)
        return word;
    const vowels = /[aeiouyäöüAEIOUYÄÖÜ]/;
    // Prefer an early split to help narrow widths
    for (let i = Math.min(8, word.length - 3); i >= 6; i--) {
        if (vowels.test(word[i - 1]))
            return word.slice(0, i) + '\u00AD' + word.slice(i);
    }
    // fallback near 8th char
    const idx = Math.min(8, Math.floor(word.length / 2));
    return word.slice(0, idx) + '\u00AD' + word.slice(idx);
}
function hyphenateWord(word, locale) {
    const code = hyphenationLocaleFromBCP47(locale || 'en-us');
    const h = getHypher(code);
    const parts = h.hyphenate(word);
    if (!parts || parts.length <= 1) {
        if (code && /^(de|fr|es)/i.test(code)) {
            if (!HYPHER_WARNED) {
                // eslint-disable-next-line no-console
                console.warn('[wrap] hyphenation dictionary not found for locale', code, '— using naive fallback');
                HYPHER_WARNED = true;
            }
            return [naiveHyphenate(word)];
        }
        return [word];
    }
    return [parts.join('\u00AD')];
}
function tryPlaceWord(ctx, current, word, maxWidth) {
    const candidate = current ? current + ' ' + word : word;
    if (fitsWithin(ctx, candidate, maxWidth)) {
        return { placed: true, line: candidate };
    }
    return { placed: false, line: current };
}
function splitHyphenatedToFit(ctx, current, word, maxWidth) {
    // word may already contain soft hyphens between syllables
    const syllables = word.split('\u00AD');
    if (syllables.length <= 1)
        return null;
    let bestPrefix = null;
    let bestIndex = -1;
    for (let i = 1; i < syllables.length; i++) {
        const prefix = syllables.slice(0, i).join('\u00AD');
        const candidate = (current ? current + ' ' : '') + prefix + '\u00AD';
        if (fitsWithin(ctx, candidate, maxWidth)) {
            bestPrefix = candidate;
            bestIndex = i;
        }
        else {
            // since width increases with i, further i won't fit if this doesn't
            break;
        }
    }
    if (bestPrefix == null)
        return null;
    const remainder = syllables.slice(bestIndex).join('\u00AD');
    return { prefixLine: bestPrefix, remainder };
}
export function balancedWrap(ctx, text, maxWidth, maxLines, opts = {}) {
    const normalized = collapseSpaces(text);
    if (!normalized)
        return { fits: true, lines: [] };
    // CJK path: character-based wrapping, no hyphenation
    const script = detectScript(normalized);
    if (script === 'CJK') {
        const chars = Array.from(normalized.replace(/\s+/g, ''));
        const lines = [];
        let current = '';
        for (let i = 0; i < chars.length; i++) {
            const cand = current + chars[i];
            if (fitsWithin(ctx, cand, maxWidth))
                current = cand;
            else {
                if (!current)
                    return { fits: false, lines: [] };
                if (lines.length + 1 > maxLines)
                    return { fits: false, lines: [] };
                lines.push(current);
                current = chars[i];
                if (!fitsWithin(ctx, current, maxWidth))
                    return { fits: false, lines: [] };
            }
        }
        if (current) {
            if (lines.length + 1 > maxLines)
                return { fits: false, lines: [] };
            lines.push(current);
        }
        // Balance by moving one char
        for (let pass = 0; pass < 3; pass++) {
            let moved = false;
            for (let i = 0; i < lines.length - 1; i++) {
                const prev = lines[i];
                const next = lines[i + 1];
                if (prev.length <= 1)
                    continue;
                const prevCand = prev.slice(0, -1);
                const nextCand = prev.slice(-1) + next;
                const wPrev = width(ctx, prev);
                const wPrevCand = width(ctx, prevCand);
                if (wPrev - wPrevCand >= 20 && fitsWithin(ctx, prevCand, maxWidth) && fitsWithin(ctx, nextCand, maxWidth)) {
                    lines[i] = prevCand;
                    lines[i + 1] = nextCand;
                    moved = true;
                }
            }
            if (!moved)
                break;
        }
        for (const ln of lines)
            if (!fitsWithin(ctx, ln, maxWidth))
                return { fits: false, lines: [] };
        if (lines.length > maxLines)
            return { fits: false, lines: [] };
        return { fits: true, lines };
    }
    const words = normalized.split(' ');
    const lines = [];
    let current = '';
    for (let wi = 0; wi < words.length; wi++) {
        let word = words[wi];
        // Greedy try
        const placed = tryPlaceWord(ctx, current, word, maxWidth);
        if (placed.placed) {
            current = placed.line;
            continue;
        }
        // Need a new line. If current is empty, the word itself doesn't fit.
        if (current === '') {
            // Try hyphenation if enabled
            if (opts.hyphenate) {
                // Prepare soft-hyphenated representation
                if (!word.includes('\u00AD')) {
                    const hyph = hyphenateWord(word, opts.locale);
                    word = hyph[0];
                }
                // Attempt to split at a hyphenation point
                const split = splitHyphenatedToFit(ctx, '', word, maxWidth);
                if (!split)
                    return { fits: false, lines: [] };
                // push the prefix line
                if (lines.length + 1 > maxLines)
                    return { fits: false, lines: [] };
                lines.push(split.prefixLine);
                // The remainder becomes the current word to place next; stay on same wi by decrementing
                current = '';
                words.splice(wi + 1, 0, split.remainder);
                continue;
            }
            // Cannot hyphenate; fails
            return { fits: false, lines: [] };
        }
        // Non-empty current, so push current as a line and retry this word on new line
        if (lines.length + 1 > maxLines)
            return { fits: false, lines: [] };
        lines.push(current);
        current = '';
        wi--; // retry placing the same word on the next line
    }
    if (current) {
        if (lines.length + 1 > maxLines)
            return { fits: false, lines: [] };
        lines.push(current);
    }
    // Ensure all lines fit
    for (const ln of lines) {
        if (!fitsWithin(ctx, ln, maxWidth))
            return { fits: false, lines: [] };
    }
    // Balancing: up to 3 passes
    for (let pass = 0; pass < 3; pass++) {
        let movedAny = false;
        for (let i = 0; i < lines.length - 1; i++) {
            const prev = lines[i];
            const next = lines[i + 1];
            const prevTokens = prev.split(' ').filter(Boolean);
            if (prevTokens.length <= 1)
                continue; // avoid emptying a line
            const trailing = prevTokens[prevTokens.length - 1];
            const candidatePrev = prevTokens.slice(0, -1).join(' ');
            const candidateNext = next ? `${trailing} ${next}` : trailing;
            const wPrev = width(ctx, prev);
            const wCandidatePrev = width(ctx, candidatePrev);
            if (wPrev - wCandidatePrev >= 20 &&
                fitsWithin(ctx, candidatePrev, maxWidth) &&
                fitsWithin(ctx, candidateNext, maxWidth)) {
                lines[i] = candidatePrev;
                lines[i + 1] = candidateNext;
                movedAny = true;
            }
        }
        if (!movedAny)
            break;
    }
    // Final guarantee
    for (const ln of lines) {
        if (!fitsWithin(ctx, ln, maxWidth))
            return { fits: false, lines: [] };
    }
    if (lines.length > maxLines)
        return { fits: false, lines: [] };
    return { fits: true, lines };
}
