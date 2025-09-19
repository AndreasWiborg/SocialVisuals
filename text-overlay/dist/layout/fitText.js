import { createCanvas } from 'canvas';
import { balancedWrap } from '../wrap.js';
import { maxLinesValue } from '../types.js';
export async function fitText(text, area, fontFamily, canvasWidth, opts = {}) {
    const H = area.shape.h;
    const Lmax = maxLinesValue(area.constraints.maxLines);
    const defaultLH = area.constraints.lineHeight.value || 1.1;
    const C = area.constraints.fontSizing?.capHeightRatio ?? 0.70; // capHeight/em
    const targetCap = area.constraints.fontSizing?.optical?.targetCapHeightPx ?? Infinity;
    // Determine the LH used to compute height-derived upper bound
    const scanLHsOpt = (opts.lineHeightScan && opts.lineHeightScan.length) ? opts.lineHeightScan.slice().sort((a, b) => a - b) : null;
    const singleLineMinLH = Math.max(0.94, defaultLH - 0.08);
    const lhForUpper = (Lmax === 1)
        ? Math.min(singleLineMinLH, (scanLHsOpt ? scanLHsOpt[0] : defaultLH))
        : ((scanLHsOpt ? scanLHsOpt[0] : defaultLH) || defaultLH);
    const maxByHeight = Math.floor(H / Math.max(1, (Lmax * lhForUpper)));
    const maxByOpticsBase = Number.isFinite(targetCap) ? Math.floor(targetCap / C) : Number.POSITIVE_INFINITY;
    const softMul = (typeof opts.softOpticalCapMultiplier === 'number' && opts.softOpticalCapMultiplier > 1) ? opts.softOpticalCapMultiplier : 1.0;
    const maxByOptics = Math.floor(maxByOpticsBase * softMul);
    const upperBound = Math.max(area.constraints.minFont, Math.min(maxByHeight, maxByOptics));
    if (!Number.isFinite(upperBound) || upperBound <= 0) {
        return { fits: false, reasons: ["invalid upperBound"], suggested_fixes: [] };
    }
    // 2) measurement context
    const w = Math.max(area.shape.w, canvasWidth || area.shape.w);
    const tmp = createCanvas(w, Math.ceil(H * 1.2));
    const ctx = tmp.getContext('2d');
    const allowHyph = opts.allowHyphenation ?? (area.role !== 'cta');
    const scanLHs = (opts.lineHeightScan && opts.lineHeightScan.length ? opts.lineHeightScan : [defaultLH]);
    const trackCfg = opts.trackingRange ?? { min: -0.15, max: 0.10, step: 0.05 };
    function withinWidthStrict(lines, tracking) {
        for (const ln of lines) {
            const w = ctx.measureText(ln).width;
            const eff = w * (1 + tracking / 20);
            if (eff > area.shape.w + 0.5)
                return false;
        }
        return true;
    }
    function findTrackingToFit(lines) {
        if (withinWidthStrict(lines, 0))
            return 0;
        if (trackCfg.min < 0) {
            for (let t = -Math.abs(trackCfg.step); t >= trackCfg.min - 1e-9; t -= Math.abs(trackCfg.step)) {
                if (withinWidthStrict(lines, t))
                    return t;
            }
        }
        return null;
    }
    let globalBestFont = -1;
    let globalBestLines = [];
    let globalBestTracking = 0;
    let globalBestLH = defaultLH;
    let globalBestWasWidthLimited = false;
    let globalBestWasHeightLimited = false;
    const fontWeight = (opts.fontWeight && String(opts.fontWeight).trim()) || '';
    for (const LH of scanLHs) {
        let lo = area.constraints.minFont;
        let hi = upperBound;
        let best = -1;
        let bestLines = [];
        let bestTracking = 0;
        while (lo <= hi) {
            const mid = Math.floor((lo + hi) / 2);
            ctx.font = `${fontWeight ? fontWeight + ' ' : ''}${mid}px ${fontFamily}`;
            let wrapped = balancedWrap(ctx, text, area.shape.w, Lmax, { hyphenate: allowHyph, locale: opts.locale });
            let lines = wrapped.lines;
            let trackingUsed = 0;
            if (!wrapped.fits) {
                const singleWord = text.trim().split(/\s+/).length === 1;
                if (singleWord && Lmax >= 1) {
                    lines = [text.trim()];
                    const t = findTrackingToFit(lines);
                    if (t !== null) {
                        trackingUsed = t;
                        wrapped = { fits: true, lines };
                    }
                }
            }
            const linesH = (lines.length) * (mid * LH);
            let feasible = false;
            let widthLimitedAtThisMid = false;
            let heightLimitedAtThisMid = false;
            if (wrapped.fits && linesH <= H + 0.1) {
                const t = findTrackingToFit(lines);
                if (t !== null) {
                    trackingUsed = t;
                    feasible = true;
                    for (const ln of lines) {
                        const mw = ctx.measureText(ln).width;
                        const eff = mw * (1 + trackingUsed / 20);
                        if (eff >= area.shape.w - 0.5) {
                            widthLimitedAtThisMid = true;
                            break;
                        }
                    }
                    if (linesH >= H - 0.5)
                        heightLimitedAtThisMid = true;
                }
            }
            if (feasible) {
                best = mid;
                bestLines = lines;
                bestTracking = trackingUsed;
                lo = mid + 1;
            }
            else {
                hi = mid - 1;
            }
        }
        if (best > 0) {
            const tie = best === globalBestFont;
            const better = best > globalBestFont ||
                (tie && Math.abs(bestTracking) < Math.abs(globalBestTracking)) ||
                (tie && Math.abs(bestTracking) === Math.abs(globalBestTracking) && bestLines.length < globalBestLines.length);
            if (better) {
                globalBestFont = best;
                globalBestLines = bestLines;
                globalBestTracking = bestTracking;
                globalBestLH = LH;
                ctx.font = `${fontWeight ? fontWeight + ' ' : ''}${best}px ${fontFamily}`;
                let widthLimited = false;
                for (const ln of bestLines) {
                    const mw = ctx.measureText(ln).width;
                    const eff = mw * (1 + globalBestTracking / 20);
                    if (eff >= area.shape.w - 0.5) {
                        widthLimited = true;
                        break;
                    }
                }
                const heightLimited = (bestLines.length * (best * globalBestLH)) >= H - 0.5;
                globalBestWasWidthLimited = widthLimited || (globalBestTracking !== 0);
                globalBestWasHeightLimited = heightLimited;
            }
        }
    }
    if (globalBestFont < 0) {
        return {
            fits: false,
            reasons: ["exceeds maxLines at minFont"],
            suggested_fixes: [{ type: "compress", target_graphemes: -Math.ceil(text.length * 0.15) }]
        };
    }
    const usedHyphenation = globalBestLines.some(l => l.includes("\\u00AD")) || globalBestLines.some(l => l.includes("\u00AD"));
    const reasons = [];
    if (globalBestWasWidthLimited)
        reasons.push('width-limited');
    if (globalBestWasHeightLimited)
        reasons.push('height-limited');
    return {
        fits: true,
        font_px: globalBestFont,
        lines: globalBestLines.length,
        used_tracking: globalBestTracking,
        used_hyphenation: usedHyphenation,
        reasons,
        lineBreaks: globalBestLines
    };
}
