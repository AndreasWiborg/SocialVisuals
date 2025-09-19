import { describe, it, expect } from 'vitest';
import { compressToBudget } from './compress';
describe('compressToBudget', () => {
    it('keeps mustInclude tokens and respects target length', async () => {
        const text = 'Acme really really launches products that are very good';
        const res = await compressToBudget(text, { targetGraphemes: 30, mustInclude: ['Acme'] });
        expect(res.text.toLowerCase()).toContain('acme');
        expect(res.text.length).toBeLessThanOrEqual(30);
        expect(res.ok).toBe(true);
    });
    it('removes filler and replaces phrases', async () => {
        const text = 'We really just want to, in order to ship as well as launch';
        const res = await compressToBudget(text, { targetGraphemes: 50 });
        const lower = res.text.toLowerCase();
        expect(lower).not.toContain('really');
        expect(lower).not.toContain('just');
        expect(lower).not.toContain('in order to');
        expect(lower).not.toContain('as well as');
        expect(res.text.length).toBeLessThanOrEqual(50);
    });
});
