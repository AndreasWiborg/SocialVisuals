import { describe, it, expect } from 'vitest';
import { detectScript, hyphenationLocaleFromBCP47 } from './lang';
describe('lang utils', () => {
    it('detectScript identifies major scripts', () => {
        expect(detectScript('こんにちは')).toBe('CJK');
        expect(detectScript('漢字カタカナ')).toBe('CJK');
        expect(detectScript('Привет')).toBe('Cyrillic');
        expect(detectScript('مرحبا')).toBe('Arabic');
        expect(detectScript('שלום')).toBe('Hebrew');
        expect(detectScript('Hello')).toBe('Latin');
    });
    it('hyphenationLocaleFromBCP47 maps locales', () => {
        expect(hyphenationLocaleFromBCP47('en')).toBe('en-us');
        expect(hyphenationLocaleFromBCP47('en-GB')).toBe('en-gb');
        expect(hyphenationLocaleFromBCP47('de-DE')).toBe('de');
        expect(hyphenationLocaleFromBCP47('fr-FR')).toBe('fr');
        expect(hyphenationLocaleFromBCP47('es-ES')).toBe('es');
    });
});
