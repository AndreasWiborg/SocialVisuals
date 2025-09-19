import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
// Mock canvas similar to render.test to keep API tests deterministic
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
        const state = { width, height, pixels: new Uint8ClampedArray(width * height * 4), fillStyle: '#000', font: '16px Mock' };
        const ctx = {
            get font() { return state.font; }, set font(v) { state.font = v; },
            set fillStyle(v) { state.fillStyle = v; }, get fillStyle() { return state.fillStyle; },
            textBaseline: 'top',
            measureText(s) { const m = /^(\d+)px/.exec(state.font); const size = m ? parseInt(m[1], 10) : 16; return { width: s.length * size * 0.6 }; },
            fillRect(x, y, w, h) {
                const [r, g, b, a] = parseHexColor(state.fillStyle);
                for (let yy = y; yy < y + h; yy++)
                    for (let xx = x; xx < x + w; xx++) {
                        const idx = (yy * state.width + xx) * 4;
                        state.pixels[idx] = r;
                        state.pixels[idx + 1] = g;
                        state.pixels[idx + 2] = b;
                        state.pixels[idx + 3] = a;
                    }
            },
            getImageData(x, y, w, h) { const data = new Uint8ClampedArray(w * h * 4); for (let yy = 0; yy < h; yy++)
                for (let xx = 0; xx < w; xx++) {
                    const s = ((y + yy) * state.width + (x + xx)) * 4;
                    const d = (yy * w + xx) * 4;
                    data[d] = state.pixels[s];
                    data[d + 1] = state.pixels[s + 1];
                    data[d + 2] = state.pixels[s + 2];
                    data[d + 3] = state.pixels[s + 3];
                } return { data }; },
            drawImage(img) { const [r, g, b, a] = parseHexColor(img._color || '#000'); for (let yy = 0; yy < state.height; yy++)
                for (let xx = 0; xx < state.width; xx++) {
                    const idx = (yy * state.width + xx) * 4;
                    state.pixels[idx] = r;
                    state.pixels[idx + 1] = g;
                    state.pixels[idx + 2] = b;
                    state.pixels[idx + 3] = a;
                } },
            fillText() { }
        };
        return { getContext: () => ctx, toBuffer: () => Buffer.from(JSON.stringify({ w: width, h: height, color: state.fillStyle })) };
    }
    async function loadImage(p) { const fs = require('fs'); const meta = JSON.parse(fs.readFileSync(p, 'utf-8')); return { width: meta.w, height: meta.h, _color: meta.color }; }
    return { createCanvas, loadImage };
});
import { readFileSync, writeFileSync } from 'fs';
import { createCanvas } from 'canvas';
let baseURL = '';
let server;
let apiAvailable = true;
describe('API basic', () => {
    beforeAll(async () => {
        try {
            // Dynamically import to avoid failing when fastify is not installed in CI
            const mod = await import('./api');
            const { createServer } = mod;
            server = createServer();
            await server.listen({ port: 0, host: '127.0.0.1' });
            const addr = server.server.address();
            baseURL = `http://${addr.address}:${addr.port}`;
        }
        catch (e) {
            apiAvailable = false;
        }
    });
    afterAll(async () => {
        if (server)
            await server.close();
    });
    it('health and version', async () => {
        if (!apiAvailable)
            return;
        const h = await fetch(`${baseURL}/health`).then(r => r.json());
        expect(h.ok).toBe(true);
        const v = await fetch(`${baseURL}/version`).then(r => r.json());
        expect(typeof v.version).toBe('string');
    });
    it('roles derive', async () => {
        if (!apiAvailable)
            return;
        const tpl = JSON.parse(readFileSync('templates/portrait-promo-v2.json', 'utf-8'));
        const res = await fetch(`${baseURL}/roles/derive`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ template: tpl }) });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(Array.isArray(json.schema.specs)).toBe(true);
        expect(json.schema.specs.length).toBeGreaterThan(0);
    });
    it('pipeline run end-to-end (path bg)', async () => {
        if (!apiAvailable)
            return;
        // Create a simple background file compatible with our canvas mock
        const c = createCanvas(1080, 1350);
        const g = c.getContext('2d');
        g.fillStyle = '#555555';
        g.fillRect(0, 0, 1080, 1350);
        const bgPath = 'bg-gray-mock.json';
        writeFileSync(bgPath, c.toBuffer());
        const tpl = JSON.parse(readFileSync('templates/portrait-promo-v2.json', 'utf-8'));
        const payload = {
            template: tpl,
            bg: { kind: 'path', value: bgPath },
            ctx: { product: { name: 'AdCreator+' }, audience: 'SMBs', tone: 'clear', brandVoice: 'simple', locale: 'en-US' },
            n: 8, k: 3, brandColors: ['#0057FF', '#34C759']
        };
        const res = await fetch(`${baseURL}/pipeline/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(typeof json.outPath).toBe('string');
        expect(Array.isArray(json.topK)).toBe(true);
        expect(json.topK.length).toBeGreaterThan(0);
        expect(json.meta && typeof json.meta.scrimType === 'string').toBe(true);
    });
});
