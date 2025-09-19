import { describe, it, expect, beforeEach } from 'vitest';
import { selectTop, baseScore } from './selector';
import { trigramSet, saveNovelty } from './novelty';
import fs from 'fs';
import path from 'path';
function makeCand(id, angle, text, font_px, penalties = 0, used_hyphenation = false) {
    return {
        id,
        bundleId: 'b1',
        angle,
        text,
        fit: { font_px, lines: 2, penalties, used_hyphenation }
    };
}
describe('selector', () => {
    const cacheDir = path.resolve(process.cwd(), '.cache', 'novelty');
    beforeEach(() => {
        // clean novelty cache for tests
        try {
            fs.rmSync(cacheDir, { recursive: true, force: true });
        }
        catch { }
    });
    it('MMR + baseScore favors diverse higher-font candidates', async () => {
        const dups = [
            makeCand('d1', 'QUESTION', 'What if ads wrote themselves?', 40),
            makeCand('d2', 'QUESTION', 'What if ads wrote themself?', 41),
            makeCand('d3', 'QUESTION', 'What if ads wrote themselves', 39),
            makeCand('d4', 'QUESTION', 'What if ads write themselves?', 42)
        ];
        const distinct = [
            makeCand('u1', 'STATEMENT', 'Turn ideas into on-brand creatives', 64),
            makeCand('u2', 'BENEFIT', 'Fewer edits, faster launches', 62),
            makeCand('u3', 'IMPERATIVE', 'Ship campaigns in minutes', 63),
            makeCand('u4', 'VALUE', 'High-quality ads without heavy lifts', 65)
        ];
        const pool = [...dups, ...distinct];
        const out = await selectTop(pool, { k: 4, lambda: 0.75 });
        const ids = out.map(o => o.id);
        // Expect majority to be from distinct set due to higher baseScore and diversity
        const distinctCount = ids.filter(id => id.startsWith('u')).length;
        expect(distinctCount).toBeGreaterThanOrEqual(3);
    });
    it('novelty penalizes previously used content', async () => {
        const key = { brandId: 'brandX', templateId: 'tplY' };
        const priorText = 'What if ads wrote themselves?';
        await saveNovelty(key, trigramSet(priorText));
        const cands = [
            makeCand('a', 'QUESTION', priorText, 70), // strong but should be penalized
            makeCand('b', 'STATEMENT', 'Turn ideas into on-brand creatives', 60),
            makeCand('c', 'BENEFIT', 'Fewer edits, faster launches', 61)
        ];
        const out = await selectTop(cands, { k: 2, key });
        const ids = out.map(o => o.id);
        // Expect at least one non-duplicate to be preferred
        expect(ids.includes('a')).toBe(false);
    });
    it('penalizes incomplete/questionable headlines', () => {
        const good = makeCand('g', 'QUESTION', 'What if ads wrote themselves?', 48);
        const bad = makeCand('b', 'QUESTION', 'What if Acme wrote your', 48);
        expect(baseScore(good)).toBeGreaterThan(baseScore(bad));
    });
    it('enforces angle quotas (maxPct)', async () => {
        const cands = [
            makeCand('q1', 'QUESTION', 'Q1?', 60),
            makeCand('q2', 'QUESTION', 'Q2?', 59),
            makeCand('q3', 'QUESTION', 'Q3?', 58),
            makeCand('s1', 'STATEMENT', 'S1', 61),
            makeCand('b1', 'BENEFIT', 'B1', 62)
        ];
        const out = await selectTop(cands, { k: 3, quotas: { maxPct: { QUESTION: 0.34 } } });
        const qs = out.filter(o => o.angle === 'QUESTION').length;
        expect(qs).toBeLessThanOrEqual(1);
    });
});
