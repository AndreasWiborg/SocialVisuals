import { describe, it, expect, vi } from 'vitest';
// Mock canvas for this suite to avoid native bindings
vi.mock('canvas', () => {
    function parseHexColor(hex) {
        let h = hex.replace('#', '');
        if (h.length === 3)
            h = h.split('').map(c => c + c).join('');
        const r = parseInt(h.slice(0, 2), 16);
        const g = parseInt(h.slice(2, 4), 16);
        const b = parseInt(h.slice(4, 6), 16);
        return [r, g, b, 255];
    }
    function createCanvas(width, height) {
        const state = {
            width,
            height,
            pixels: new Uint8ClampedArray(width * height * 4),
            fillStyle: '#000000',
            font: '16px Mock'
        };
        const ctx = {
            get font() { return state.font; },
            set font(v) { state.font = v; },
            set fillStyle(v) { state.fillStyle = v; },
            get fillStyle() { return state.fillStyle; },
            textBaseline: 'top',
            measureText(s) {
                const m = /^(\d+)px/.exec(state.font);
                const size = m ? parseInt(m[1], 10) : 16;
                return { width: s.length * size * 0.6 };
            },
            fillRect(x, y, w, h) {
                const [r, g, b, a] = parseHexColor(state.fillStyle);
                for (let yy = y; yy < y + h; yy++) {
                    for (let xx = x; xx < x + w; xx++) {
                        const idx = (yy * state.width + xx) * 4;
                        state.pixels[idx] = r;
                        state.pixels[idx + 1] = g;
                        state.pixels[idx + 2] = b;
                        state.pixels[idx + 3] = a;
                    }
                }
            },
            getImageData(x, y, w, h) {
                // Return a view subset; for simplicity compute a new array with uniform sampling
                const data = new Uint8ClampedArray(w * h * 4);
                for (let yy = 0; yy < h; yy++) {
                    for (let xx = 0; xx < w; xx++) {
                        const srcIdx = ((y + yy) * state.width + (x + xx)) * 4;
                        const dstIdx = (yy * w + xx) * 4;
                        data[dstIdx] = state.pixels[srcIdx];
                        data[dstIdx + 1] = state.pixels[srcIdx + 1];
                        data[dstIdx + 2] = state.pixels[srcIdx + 2];
                        data[dstIdx + 3] = state.pixels[srcIdx + 3];
                    }
                }
                return { data };
            },
            drawImage(img, x, y) {
                // Fill entire canvas with image's color
                const [r, g, b, a] = parseHexColor(img._color || '#000000');
                for (let yy = 0; yy < state.height; yy++) {
                    for (let xx = 0; xx < state.width; xx++) {
                        const idx = (yy * state.width + xx) * 4;
                        state.pixels[idx] = r;
                        state.pixels[idx + 1] = g;
                        state.pixels[idx + 2] = b;
                        state.pixels[idx + 3] = a;
                    }
                }
            },
            fillText(_s, _x, _y) {
                // no-op, not validated here
            }
        };
        return {
            getContext: () => ctx,
            toBuffer: () => Buffer.from(JSON.stringify({ w: width, h: height, color: state.fillStyle }))
        };
    }
    async function loadImage(p) {
        const buf = require('fs').readFileSync(p);
        const meta = JSON.parse(buf.toString());
        return { width: meta.w, height: meta.h, _color: meta.color };
    }
    return { createCanvas, loadImage };
});
import { createCanvas } from 'canvas';
import { renderText } from './render';
import fs from 'fs';
import path from 'path';
function tmpFile(name) {
    const dir = fs.mkdtempSync(path.join(process.cwd(), 'tmp-render-'));
    return path.join(dir, name);
}
function makeBg(color, w = 400, h = 300) {
    const c = createCanvas(w, h);
    const g = c.getContext('2d');
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    const p = tmpFile('bg.png');
    fs.writeFileSync(p, c.toBuffer('image/png'));
    return p;
}
function area() {
    return {
        id: 'A',
        shape: { type: 'rect', x: 20, y: 20, w: 360, h: 120 },
        role: 'headline',
        align: 'center',
        vAlign: 'center',
        constraints: {
            maxLines: { min: 2, max: 3 },
            minFont: 24,
            lineHeight: { type: 'relative', value: 1.08 },
            fontSizing: { mode: 'auto', optical: { targetCapHeightPx: 80 }, capHeightRatio: 0.70 }
        }
    };
}
describe('renderText', () => {
    it('renders white text on black background', async () => {
        const bg = makeBg('#000000');
        const out = tmpFile('out.png');
        const a = area();
        const report = { fits: true, font_px: 40, lineBreaks: ['Hello world', 'From renderer'] };
        const meta = await renderText(bg, out, a, report.lineBreaks.join(' '), 'Arial', report);
        expect(fs.existsSync(out)).toBe(true);
        expect(meta.usedColor.toUpperCase() === '#FFFFFF' || meta.contrastRatio > 4.5).toBe(true);
        expect(meta.appliedScrim).toBe(false);
        expect(meta.scrimType).toBe('none');
    });
    it('applies adaptive gradient scrim on mid-gray background and improves contrast', async () => {
        const bg = makeBg('#AAAAAA');
        const out = tmpFile('out.png');
        const a = area();
        const report = { fits: true, font_px: 40, lineBreaks: ['Hello world', 'From renderer'] };
        const meta = await renderText(bg, out, a, report.lineBreaks.join(' '), 'Arial', report);
        expect(fs.existsSync(out)).toBe(true);
        expect(meta.scrimType).toBe('gradient');
        expect(meta.appliedScrim).toBe(true);
        expect(meta.contrastRatio).toBeGreaterThanOrEqual(3);
    });
    it('refuses when fits=false', async () => {
        const bg = makeBg('#FFFFFF');
        const out = tmpFile('out.png');
        const a = area();
        const report = { fits: false };
        await expect(renderText(bg, out, a, 'Hello world', 'Arial', report)).rejects.toThrow(/fits=false/);
    });
    it('applies stroke when contrast remains low after scrim (heuristic)', async () => {
        const bg = makeBg('#AAAAAA');
        const out = tmpFile('out.png');
        const a = area();
        const report = { fits: true, font_px: 40, lineBreaks: ['Hello world'] };
        const meta = await renderText(bg, out, a, report.lineBreaks.join(' '), 'Arial', report, undefined, { stroke: {} });
        expect(fs.existsSync(out)).toBe(true);
        expect(meta.scrimType).toBe('gradient');
        expect(meta.strokeApplied).toBe(true);
        expect(meta.contrastRatio).toBeGreaterThanOrEqual(3);
    });
});
