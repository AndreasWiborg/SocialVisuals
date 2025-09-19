import { createCanvas } from 'canvas';
import { promises as fs } from 'fs';
export async function estimateCapHeightRatio(fontFamily) {
    const W = 300;
    const H = 200;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.textBaseline = 'top';
    ctx.font = `100px ${fontFamily}`;
    ctx.clearRect(0, 0, W, H);
    ctx.fillText('H', 20, 20);
    const img = ctx.getImageData(0, 0, W, H);
    let top = -1;
    let bottom = -1;
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const idx = (y * W + x) * 4 + 3; // alpha channel
            if (img.data[idx] !== 0) {
                top = y;
                break;
            }
        }
        if (top !== -1)
            break;
    }
    for (let y = H - 1; y >= 0; y--) {
        for (let x = 0; x < W; x++) {
            const idx = (y * W + x) * 4 + 3;
            if (img.data[idx] !== 0) {
                bottom = y;
                break;
            }
        }
        if (bottom !== -1)
            break;
    }
    let ratio = 0.7; // fallback default if nothing detected
    if (top !== -1 && bottom !== -1 && bottom >= top) {
        const pixels = bottom - top + 1;
        ratio = pixels / 100;
    }
    // sanity clamp
    ratio = Math.min(0.9, Math.max(0.5, ratio));
    return ratio;
}
export async function writeCapHeightForTemplate(templatePath) {
    const raw = await fs.readFile(templatePath, 'utf-8');
    const tpl = JSON.parse(raw);
    if (!tpl.fonts)
        return;
    const roles = Object.keys(tpl.fonts);
    for (const role of roles) {
        const f = tpl.fonts[role];
        if (!f)
            continue;
        if (typeof f.capHeightRatio === 'number')
            continue;
        const fam = f.family;
        if (!fam)
            continue;
        try {
            const r = await estimateCapHeightRatio(fam);
            f.capHeightRatio = r;
        }
        catch (e) {
            // leave unset on failure
        }
    }
    await fs.writeFile(templatePath, JSON.stringify(tpl, null, 2), 'utf-8');
}
