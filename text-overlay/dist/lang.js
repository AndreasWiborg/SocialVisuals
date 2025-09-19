export function detectScript(s) {
    let hasLatin = false;
    for (const ch of s) {
        const code = ch.codePointAt(0);
        // CJK ranges: Unified Ideographs, Compatibility Ideographs, Hiragana, Katakana,
        // Katakana Phonetic Extensions, CJK Symbols & Punctuation, Fullwidth/Halfwidth, Hangul
        if ((code >= 0x3400 && code <= 0x9FFF) || // CJK Unified Ideographs
            (code >= 0xF900 && code <= 0xFAFF) || // CJK Compatibility Ideographs
            (code >= 0x3040 && code <= 0x30FF) || // Hiragana + Katakana
            (code >= 0x31F0 && code <= 0x31FF) || // Katakana Phonetic Extensions
            (code >= 0x3000 && code <= 0x303F) || // CJK Symbols & Punctuation
            (code >= 0xFF00 && code <= 0xFFEF) || // Fullwidth/Halfwidth Forms
            (code >= 0xAC00 && code <= 0xD7AF) // Hangul Syllables
        ) {
            return "CJK";
        }
        if (code >= 0x0400 && code <= 0x04FF)
            return "Cyrillic";
        if (code >= 0x0600 && code <= 0x06FF)
            return "Arabic";
        if (code >= 0x0590 && code <= 0x05FF)
            return "Hebrew";
        if ((code >= 0x41 && code <= 0x5A) || (code >= 0x61 && code <= 0x7A))
            hasLatin = true;
    }
    return hasLatin ? "Latin" : "Other";
}
export function hyphenationLocaleFromBCP47(locale) {
    if (!locale)
        return 'en-us';
    const lc = locale.toLowerCase();
    if (lc.startsWith('en-gb'))
        return 'en-gb';
    if (lc.startsWith('en'))
        return 'en-us';
    if (lc.startsWith('de'))
        return 'de';
    if (lc.startsWith('fr'))
        return 'fr';
    if (lc.startsWith('es'))
        return 'es';
    if (lc.startsWith('pt'))
        return 'pt';
    if (lc.startsWith('nb') || lc.startsWith('no'))
        return 'nb-no';
    return 'en-us';
}
