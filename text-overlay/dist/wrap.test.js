import { describe, it, expect, vi } from 'vitest';
// Mock canvas to avoid native bindings
vi.mock('canvas', () => {
    function createCanvas(width, height) {
        const state = { width, height, font: '32px Mock' };
        return {
            getContext: () => ({
                get font() { return state.font; },
                set font(v) { state.font = v; },
                measureText(s) {
                    const m = /^(\d+)px/.exec(state.font);
                    const size = m ? parseInt(m[1], 10) : 32;
                    const clean = s.replace(/\u00AD/g, ''); // soft hyphen not counted
                    return { width: clean.length * size * 0.6 };
                }
            })
        };
    }
    return { createCanvas };
});
import { createCanvas } from 'canvas';
import { balancedWrap } from './wrap';
function ctx(font = '32px Arial') {
    const c = createCanvas(400, 200);
    const g = c.getContext('2d');
    g.font = font;
    return g;
}
describe('balancedWrap', () => {
    it('wraps two lines without exceeding width', () => {
        const g = ctx();
        const text = 'This is a simple wrapping test for two lines';
        const words = text.split(' ');
        // Find a split that guarantees two lines for the given width
        let maxWidth = 0;
        for (let k = 1; k < words.length; k++) {
            const left = words.slice(0, k).join(' ');
            const right = words.slice(k).join(' ');
            const wLeft = g.measureText(left).width;
            const wLeftPlus = g.measureText(words.slice(0, k + 1).join(' ')).width;
            const wRight = g.measureText(right).width;
            if (wRight <= wLeft + 1) {
                maxWidth = Math.min(wLeft + 1, wLeftPlus - 1);
                break;
            }
        }
        expect(maxWidth).toBeGreaterThan(0);
        const out = balancedWrap(g, text, maxWidth, 2, { hyphenate: false });
        expect(out.fits).toBe(true);
        expect(out.lines.length).toBe(2);
        for (const line of out.lines) {
            expect(g.measureText(line).width).toBeLessThanOrEqual(maxWidth + 0.5);
        }
    });
    it("balances last two lines so the last line isn't a single short word", () => {
        const g = ctx();
        const text = 'Balancing should avoid a stubby tail line';
        // Choose a width that produces 2-3 lines under the mock metric
        const total = g.measureText(text).width;
        const maxWidth = Math.floor(total / 2.1);
        const out = balancedWrap(g, text, maxWidth, 3, { hyphenate: false });
        expect(out.fits).toBe(true);
        expect(out.lines.length).toBeGreaterThanOrEqual(2);
        const last = out.lines[out.lines.length - 1];
        // last line should have more than one token where possible
        expect(last.split(' ').filter(Boolean).length).toBeGreaterThan(1);
        for (const line of out.lines) {
            expect(g.measureText(line).width).toBeLessThanOrEqual(maxWidth + 0.5);
        }
    });
    it('hyphenates a single long word when enabled', () => {
        const g = ctx();
        const text = 'extraordinary';
        const maxWidth = g.measureText('extraor').width - 5; // narrow enough to force hyphenation
        const out = balancedWrap(g, text, maxWidth, 3, { hyphenate: true });
        expect(out.fits).toBe(true);
        expect(out.lines.length).toBeGreaterThanOrEqual(1);
        // Expect a soft hyphen in at least one line segment
        expect(out.lines.join('\n')).toContain('\u00AD');
        for (const line of out.lines) {
            expect(g.measureText(line).width).toBeLessThanOrEqual(maxWidth + 0.5);
        }
    });
    // removed rebalancer-specific slack assertion test since rebalancer was reverted
    it('wraps CJK by characters without hyphenation', () => {
        const g = ctx();
        const text = 'こんにちは世界こんにちは世界';
        const total = g.measureText(text).width;
        const maxWidth = Math.floor(total / 3.2);
        const out = balancedWrap(g, text, maxWidth, 5, { hyphenate: true });
        expect(out.fits).toBe(true);
        expect(out.lines.length).toBeGreaterThan(1);
        expect(out.lines.join('')).toBe(text.replace(/\s+/g, ''));
        // No soft hyphens in CJK
        expect(out.lines.join('\n')).not.toContain('\u00AD');
    });
    it('uses locale-aware hyphenation fallback for German', () => {
        const g = ctx();
        const text = 'Freundschaftsbeziehungen';
        const maxWidth = g.measureText('Freundschaft').width - 5;
        const out = balancedWrap(g, text, maxWidth, 3, { hyphenate: true, locale: 'de-DE' });
        expect(out.fits).toBe(true);
        expect(out.lines.join('\n')).toContain('\u00AD');
    });
    it('fails when maxLines would be exceeded without hyphenation', () => {
        const g = ctx();
        const text = 'supercalifragilisticexpialidocious';
        const maxWidth = g.measureText('supercalifrag').width - 20; // too narrow for whole word
        const out = balancedWrap(g, text, maxWidth, 1, { hyphenate: false });
        expect(out.fits).toBe(false);
    });
});
