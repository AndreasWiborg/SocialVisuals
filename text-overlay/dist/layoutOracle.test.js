import { describe, it, expect, vi } from 'vitest';
// Mock canvas to avoid native dependency in this suite
vi.mock('canvas', () => {
    function createCanvas(_w, _h) {
        const ctx = {
            font: '16px Mock',
            measureText(s) {
                const m = /^(\d+)px/.exec(ctx.font);
                const size = m ? parseInt(m[1], 10) : 16;
                const perChar = size * 0.6;
                return { width: s.length * perChar };
            }
        };
        return { getContext: () => ctx };
    }
    return { createCanvas };
});
import { fitText } from './layoutOracle';
function baseArea() {
    return {
        id: 'A',
        shape: { type: 'rect', x: 0, y: 0, w: 936, h: 460 },
        role: 'headline',
        align: 'center',
        constraints: {
            maxLines: { min: 2, max: 3 },
            minFont: 32,
            lineHeight: { type: 'relative', value: 1.08 },
            fontSizing: { mode: 'auto', optical: { targetCapHeightPx: 100 }, capHeightRatio: 0.70 }
        }
    };
}
describe('Layout Oracle', () => {
    it('fits normal sentence', async () => {
        const area = baseArea();
        const text = 'A quick brown fox jumps over the lazy dog';
        const report = await fitText(text, area, 'Arial');
        expect(report.fits).toBe(true);
        expect(report.font_px).toBeGreaterThan(60);
        expect(report.lines).toBeLessThanOrEqual(3);
    });
    it('fails on extremely long text', async () => {
        const area = baseArea();
        const phrase = 'This is a very long sentence intended to exceed three lines of text when rendered at the minimum font size ';
        const text = phrase.repeat(30);
        const report = await fitText(text, area, 'Arial');
        expect(report.fits).toBe(false);
        expect(report.reasons?.join(' ') || '').toContain('exceeds maxLines');
    });
    it('single-line area obeys width', async () => {
        const area = baseArea();
        area.constraints.maxLines = 1; // allow exactly one line
        area.shape.w = 300; // narrow width
        const short = 'Short title';
        const ok = await fitText(short, area, 'Arial');
        expect(ok.fits).toBe(true);
        expect(ok.lines).toBe(1);
        const long = 'This headline is definitely too long for a single narrow line without wrapping';
        const bad = await fitText(long, area, 'Arial');
        expect(bad.fits).toBe(false);
    });
    it('micro negative tracking can unlock a larger font in width-limited cases', async () => {
        const area = baseArea();
        area.constraints.maxLines = 1;
        // Width calibrated to make next font size require slight negative tracking
        area.shape.w = 643; // see mock measurement math in canvas mock
        area.constraints.minFont = 16; // allow fitting below the default 32
        const text = 'MMMMMMMM'; // 8 wide glyphs to control width precisely
        const noTrack = await fitText(text, area, 'Arial', undefined, { allowHyphenation: false, trackingRange: { min: 0, max: 0, step: 1 } });
        const withTrack = await fitText(text, area, 'Arial', undefined, { allowHyphenation: false, trackingRange: { min: -0.15, max: 0.1, step: 0.05 } });
        expect(withTrack.fits).toBe(true);
        // Expect tracking to be negative (tightening) and small magnitude
        expect(withTrack.used_tracking).toBeLessThan(0);
        // Expect improvement: higher font with tracking vs baseline without tracking
        expect((withTrack.font_px || 0)).toBeGreaterThan((noTrack.font_px || 0));
        // Should surface width-limited reason
        expect((withTrack.reasons || []).join(' ')).toContain('width-limited');
    });
});
