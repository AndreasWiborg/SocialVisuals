import { createCanvas } from 'canvas';
import { balancedWrap } from '../wrap.js';
function maxLinesValue(m) {
    return typeof m === 'number' ? m : m.max;
}
export async function fitGroupUniformFont(areas, texts, fontFamily, locale) {
    if (!areas.length)
        return { fontPx: 0, reports: [] };
    const n = Math.min(areas.length, texts.length);
    const A = areas.slice(0, n);
    const T = texts.slice(0, n).map(s => String(s || ''));
    // Bounds: global lo = max(minFont); global hi = min(per-area upper bound)
    const lo0 = Math.max(...A.map(a => a.constraints.minFont));
    const hi0 = Math.min(...A.map(a => {
        const H = a.shape.h;
        const Lmax = maxLinesValue(a.constraints.maxLines);
        const LH = a.constraints.lineHeight.value || 1.1;
        const C = a.constraints.fontSizing?.capHeightRatio ?? 0.70;
        const targetCap = a.constraints.fontSizing?.optical?.targetCapHeightPx ?? Infinity;
        const byHeight = Math.floor(H / Math.max(1, (Lmax * LH)));
        const byOptics = Number.isFinite(targetCap) ? Math.floor(targetCap / Math.max(1e-6, C)) : Number.POSITIVE_INFINITY;
        return Math.max(a.constraints.minFont, Math.min(byHeight, byOptics));
    }));
    const W = Math.max(...A.map(a => a.shape.w));
    const Htmp = Math.max(...A.map(a => a.shape.h));
    const canvas = createCanvas(Math.max(1, W), Math.max(1, Math.ceil(Htmp * 1.5)));
    const ctx = canvas.getContext('2d');
    function withinWidthStrict(lines, maxW, tracking) {
        for (const ln of lines) {
            const w = ctx.measureText(ln).width;
            const eff = w * (1 + tracking / 20);
            if (eff > maxW + 0.5)
                return false;
        }
        return true;
    }
    function findTrackingToFit(lines, maxW) {
        if (withinWidthStrict(lines, maxW, 0))
            return 0;
        for (let t = -0.05; t >= -0.20 - 1e-9; t -= 0.05) {
            if (withinWidthStrict(lines, maxW, t))
                return t;
        }
        return null;
    }
    let lo = Math.floor(lo0);
    let hi = Math.floor(hi0);
    let best = -1;
    let bestLines = [];
    let bestTrack = [];
    while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        ctx.font = `${mid}px ${fontFamily}`;
        let allFit = true;
        const linesPer = [];
        const tracksPer = [];
        for (let i = 0; i < A.length; i++) {
            const a = A[i];
            const text = T[i];
            const Lmax = maxLinesValue(a.constraints.maxLines);
            const LH = a.constraints.lineHeight.value || 1.1;
            const maxW = a.shape.w; // inset not modeled in types; honor if present at render time
            const wrap = balancedWrap(ctx, text, maxW, Lmax, { hyphenate: a.role !== 'cta', locale });
            if (!wrap.fits) {
                allFit = false;
                break;
            }
            // width tightening via tracking if needed
            const t = findTrackingToFit(wrap.lines, maxW);
            if (t === null) {
                allFit = false;
                break;
            }
            const totalH = (wrap.lines.length) * (mid * LH);
            if (totalH > a.shape.h + 0.1) {
                allFit = false;
                break;
            }
            linesPer.push(wrap.lines);
            tracksPer.push(t);
        }
        if (allFit) {
            best = mid;
            bestLines = linesPer;
            bestTrack = tracksPer;
            lo = mid + 1; // try larger, keep uniform
        }
        else {
            hi = mid - 1;
        }
    }
    if (best < 0) {
        return { fontPx: 0, reports: A.map(() => ({ fits: false })) };
    }
    // Build reports at the chosen uniform size
    const reports = A.map((a, i) => ({
        fits: true,
        font_px: best,
        lines: bestLines[i]?.length || 0,
        used_tracking: bestTrack[i] || 0,
        used_hyphenation: (bestLines[i] || []).some(l => l.includes('\u00AD')),
        lineBreaks: bestLines[i] || []
    }));
    return { fontPx: best, reports };
}
/**
 * Group areas that should be fitted together as parallel bullets.
 * - Primary: role === 'bullets' with count ≥ 2 and maxLines === 1
 * - Legacy: body areas whose ids start with BENEFIT_/FEATURE_/BULLET_ (treated as a group)
 */
export function groupAreasForBullets(tpl) {
    const groups = [];
    const byRoleBullets = tpl.areas.filter(a => a.role === 'bullets');
    if (byRoleBullets.length >= 2) {
        const oneLine = byRoleBullets.every(a => maxLinesValue(a.constraints.maxLines) === 1);
        if (oneLine)
            groups.push(byRoleBullets.slice());
    }
    const legacy = tpl.areas.filter(a => /^(BENEFIT|FEATURE|BULLET)_/i.test(a.id || ''));
    if (legacy.length >= 2)
        groups.push(legacy.slice());
    return groups;
}
