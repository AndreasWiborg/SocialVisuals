import { promises as fs } from 'fs';
import path from 'path';
export function trigramSet(s) {
    const norm = s.toLowerCase().trim().replace(/\s+/g, ' ');
    const grams = new Set();
    if (norm.length < 3) {
        if (norm)
            grams.add(norm);
        return grams;
    }
    for (let i = 0; i <= norm.length - 3; i++) {
        grams.add(norm.slice(i, i + 3));
    }
    return grams;
}
export function noveltyPenalty(text, recent) {
    const grams = trigramSet(text);
    if (grams.size === 0 || recent.size === 0)
        return 0;
    let overlap = 0;
    for (const g of grams)
        if (recent.has(g))
            overlap++;
    const ratio = overlap / grams.size;
    if (ratio <= 0)
        return 0;
    return 0.2 * ratio;
}
function storePath(key) {
    const dir = path.resolve(process.cwd(), '.cache', 'novelty');
    const file = `${key.brandId}__${key.templateId}.json`;
    return path.join(dir, file);
}
async function ensureDir(p) {
    const dir = path.dirname(p);
    await fs.mkdir(dir, { recursive: true });
}
export async function loadNovelty(key) {
    const p = storePath(key);
    try {
        const data = await fs.readFile(p, 'utf-8');
        const arr = JSON.parse(data);
        return new Set(arr);
    }
    catch {
        return new Set();
    }
}
export async function saveNovelty(key, grams) {
    const p = storePath(key);
    await ensureDir(p);
    const arr = Array.from(grams);
    await fs.writeFile(p, JSON.stringify(arr, null, 2), 'utf-8');
}
