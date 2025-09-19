import { describe, it, expect, vi } from 'vitest';
vi.mock('canvas', () => {
    function createCanvas(w, h) {
        const ctx = {
            fillStyle: '#000',
            textBaseline: 'top',
            font: '100px Mock',
            clearRect() { },
            fillText() { },
            getImageData() {
                // Return blank data so the estimator uses fallback clamp (0.7)
                return { data: new Uint8ClampedArray(w * h * 4) };
            }
        };
        return { getContext: () => ctx };
    }
    return { createCanvas };
});
import { estimateCapHeightRatio } from './fontMetrics';
describe('font metrics', () => {
    it('estimateCapHeightRatio returns sane value for Arial', async () => {
        const r = await estimateCapHeightRatio('Arial');
        expect(r).toBeGreaterThanOrEqual(0.5);
        expect(r).toBeLessThanOrEqual(0.9);
    });
});
