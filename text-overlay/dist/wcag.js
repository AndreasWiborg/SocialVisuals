// WCAG contrast utilities
export function srgbToLinear(v) {
    // v in [0,1]
    if (v <= 0.04045)
        return v / 12.92;
    return Math.pow((v + 0.055) / 1.055, 2.4);
}
export function relLuminance(r, g, b) {
    // inputs are sRGB 0..255
    const rs = r / 255;
    const gs = g / 255;
    const bs = b / 255;
    const R = srgbToLinear(rs);
    const G = srgbToLinear(gs);
    const B = srgbToLinear(bs);
    // WCAG 2.1 coefficients
    return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}
export function contrastRatio(L1, L2) {
    const maxL = Math.max(L1, L2);
    const minL = Math.min(L1, L2);
    return (maxL + 0.05) / (minL + 0.05);
}
export function hexToRgb(hex) {
    let h = hex.trim();
    if (h.startsWith('#'))
        h = h.slice(1);
    if (h.length === 3) {
        const r = parseInt(h[0] + h[0], 16);
        const g = parseInt(h[1] + h[1], 16);
        const b = parseInt(h[2] + h[2], 16);
        return [r, g, b];
    }
    if (h.length === 6) {
        const r = parseInt(h.slice(0, 2), 16);
        const g = parseInt(h.slice(2, 4), 16);
        const b = parseInt(h.slice(4, 6), 16);
        return [r, g, b];
    }
    throw new Error(`Invalid hex color: ${hex}`);
}
export function pickTextColor(bgLuma, brandHexes) {
    const candidates = [
        { color: '#000000', luma: 0 },
        { color: '#FFFFFF', luma: 1 }
    ];
    if (brandHexes && brandHexes.length) {
        for (const hex of brandHexes) {
            try {
                const [r, g, b] = hexToRgb(hex);
                candidates.push({ color: `#${hex.replace(/^#/, '').toUpperCase()}`, luma: relLuminance(r, g, b) });
            }
            catch {
                // ignore invalid brand colors
            }
        }
    }
    let best = { color: candidates[0].color, ratio: contrastRatio(bgLuma, candidates[0].luma) };
    for (let i = 1; i < candidates.length; i++) {
        const cr = contrastRatio(bgLuma, candidates[i].luma);
        if (cr > best.ratio) {
            best = { color: candidates[i].color, ratio: cr };
        }
    }
    return best;
}
