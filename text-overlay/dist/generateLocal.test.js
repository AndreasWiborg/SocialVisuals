import { describe, it, expect, vi } from 'vitest';
import { deriveRoleSchema } from './roles.js';
import { generateBundlesLocal } from './generateLocal.js';
import { endsWithStopword } from './textQuality.js';
function tinyTemplate() {
    return {
        templateId: 'T1',
        pixelSize: { w: 1080, h: 1350 },
        fonts: { headline: { family: 'Arial' }, body: { family: 'Arial' }, cta: { family: 'Arial' }, bullet: { family: 'Arial' } },
        areas: [
            { id: 'h1', role: 'headline', align: 'center', shape: { type: 'rect', x: 60, y: 80, w: 960, h: 300 }, constraints: { maxLines: { min: 2, max: 3 }, minFont: 32, lineHeight: { type: 'relative', value: 1.08 }, fontSizing: { mode: 'auto', capHeightRatio: 0.70 } } },
            { id: 'b1', role: 'body', align: 'left', shape: { type: 'rect', x: 60, y: 420, w: 960, h: 240 }, constraints: { maxLines: 3, minFont: 24, lineHeight: { type: 'relative', value: 1.1 }, fontSizing: { mode: 'auto', capHeightRatio: 0.70 } } },
            { id: 'c1', role: 'cta', align: 'center', shape: { type: 'rect', x: 60, y: 680, w: 400, h: 100 }, constraints: { maxLines: 1, minFont: 28, lineHeight: { type: 'relative', value: 1.0 }, fontSizing: { mode: 'auto', capHeightRatio: 0.70 } } },
            // bullets role with count=3
            { id: 'u1', role: 'bullet', align: 'left', shape: { type: 'rect', x: 60, y: 800, w: 960, h: 80 }, constraints: { maxLines: 1, minFont: 22, lineHeight: { type: 'relative', value: 1.0 }, fontSizing: { mode: 'auto', capHeightRatio: 0.70 } } },
            { id: 'u2', role: 'bullet', align: 'left', shape: { type: 'rect', x: 60, y: 900, w: 960, h: 80 }, constraints: { maxLines: 1, minFont: 22, lineHeight: { type: 'relative', value: 1.0 }, fontSizing: { mode: 'auto', capHeightRatio: 0.70 } } },
            { id: 'u3', role: 'bullet', align: 'left', shape: { type: 'rect', x: 60, y: 1000, w: 960, h: 80 }, constraints: { maxLines: 1, minFont: 22, lineHeight: { type: 'relative', value: 1.0 }, fontSizing: { mode: 'auto', capHeightRatio: 0.70 } } }
        ],
        priority: ['headline', 'body', 'cta']
    };
}
const ctx = { product: { name: 'Acme' }, audience: 'SMBs', tone: 'clear', brandVoice: 'simple', locale: 'en-US' };
describe('generateBundlesLocal', () => {
    it('produces n bundles with required roles', async () => {
        const schema = deriveRoleSchema(tinyTemplate());
        const out = await generateBundlesLocal(ctx, schema, 12);
        expect(out.length).toBe(12);
        for (const b of out) {
            const roles = b.roles;
            for (const s of schema.specs) {
                const v = roles[s.role];
                if (s.count === 1) {
                    expect(typeof v).toBe('string');
                }
                else {
                    expect(Array.isArray(v)).toBe(true);
                    expect(v.length).toBeLessThanOrEqual(s.count);
                }
            }
        }
    });
    it('respects budgets and no-numbers', async () => {
        // Force deterministic picks
        vi.spyOn(Math, 'random').mockReturnValue(0.1234);
        const schema = deriveRoleSchema(tinyTemplate());
        const out = await generateBundlesLocal(ctx, schema, 6);
        for (const b of out) {
            for (const s of schema.specs) {
                const cap = Math.max(1, s.graphemeBudget || 40);
                const v = b.roles[s.role];
                const arr = Array.isArray(v) ? v : [v];
                for (const item of arr) {
                    expect(typeof item).toBe('string');
                    expect(item.length).toBeLessThanOrEqual(Math.ceil(1.6 * cap));
                    expect(/[0-9$€£%]/.test(item)).toBe(false);
                }
            }
        }
    });
    it('ensures angle variety across bundles', async () => {
        const schema = deriveRoleSchema(tinyTemplate());
        const out = await generateBundlesLocal(ctx, schema, 12);
        const angles = new Set(out.map(b => b.angle));
        expect(angles.size).toBeGreaterThanOrEqual(4);
    });
    it('headlines end cleanly', async () => {
        const schema = deriveRoleSchema(tinyTemplate());
        const out = await generateBundlesLocal(ctx, schema, 12);
        const hls = out.map(b => String(b.roles['headline'] || ''));
        for (let i = 0; i < out.length; i++) {
            const angle = out[i].angle;
            const h = hls[i];
            expect(endsWithStopword(h)).toBe(false);
            if (angle === 'QUESTION')
                expect(h.trim().endsWith('?')).toBe(true);
        }
    });
    it('length variety exists', async () => {
        const schema = deriveRoleSchema(tinyTemplate());
        const out = await generateBundlesLocal(ctx, schema, 12);
        const lens = out.map(b => String(b.roles['headline'] || '').length);
        const min = Math.min(...lens);
        const max = Math.max(...lens);
        expect(max - min).toBeGreaterThanOrEqual(6);
    });
});
