import { describe, it, expect } from 'vitest';
import { relLuminance, contrastRatio, hexToRgb, pickTextColor } from './wcag';
describe('WCAG utilities', () => {
    it('white/black contrast is ~21:1', () => {
        const Lw = relLuminance(255, 255, 255);
        const Lb = relLuminance(0, 0, 0);
        const ratio = contrastRatio(Lw, Lb);
        expect(ratio).toBeCloseTo(21, 5);
    });
    it('picks white for dark backgrounds and black for light backgrounds', () => {
        const dark = pickTextColor(0.05);
        expect(dark.color.toUpperCase()).toBe('#FFFFFF');
        const light = pickTextColor(0.9);
        expect(light.color.toUpperCase()).toBe('#000000');
    });
    it('parses hex colors', () => {
        expect(hexToRgb('#0a0a0a')).toEqual([10, 10, 10]);
        expect(hexToRgb('#fff')).toEqual([255, 255, 255]);
    });
});
