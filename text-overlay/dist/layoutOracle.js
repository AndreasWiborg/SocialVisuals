import { createCanvas } from "canvas";
import { balancedWrap } from "./wrap.js";
import { maxLinesValue } from "./types.js";
export async function fitText(text, area, fontFamily, canvasWidth, opts = {}) {
    // 1) derive the binary-search upper bound (no magic maxFont)
    const H = area.shape.h;
    const Lmax = maxLinesValue(area.constraints.maxLines);
    const defaultLH = area.constraints.lineHeight.value || 1.1;
    const C = area.constraints.fontSizing?.capHeightRatio ?? 0.70; // capHeight/em
    const targetCap = area.constraints.fontSizing?.optical?.targetCapHeightPx ?? Infinity;
    // If caller provides a scan of line-heights, base the height-derived upper bound
    // on the smallest LH in the scan so we don't prematurely cap the search space.
    const scanLHsOpt = opts.lineHeightScan?.values && opts.lineHeightScan.values.length
        ? opts.lineHeightScan.values.slice().sort((a, b) => a - b)
        : null;
    const lhForUpper = (scanLHsOpt ? scanLHsOpt[0] : defaultLH) || defaultLH;
    const maxByHeight = Math.floor(H / (Lmax * lhForUpper));
    const maxByOptics = Number.isFinite(targetCap) ? Math.floor(targetCap / C) : Number.POSITIVE_INFINITY;
    const upperBound = Math.max(area.constraints.minFont, Math.min(maxByHeight, maxByOptics));
    if (!Number.isFinite(upperBound) || upperBound <= 0) {
        return { fits: false, reasons: ["invalid upperBound"], suggested_fixes: [] };
    }
    // 2) measurement context
    const w = Math.max(area.shape.w, canvasWidth || area.shape.w);
    const tmp = createCanvas(w, Math.ceil(H * 1.2));
    const ctx = tmp.getContext("2d");
    const allowHyph = opts.allowHyphenation ?? (area.role !== "cta");
    const scanLHs = opts.lineHeightScan?.values ?? [defaultLH];
    const trackCfg = opts.trackingRange ?? { min: -0.15, max: 0.10, step: 0.05 };
    function withinWidthStrict(lines, tracking) {
        for (const ln of lines) {
            const w = ctx.measureText(ln).width;
            const eff = w * (1 + tracking / 20);
            if (eff > area.shape.w + 0.5)
                return false; // tolerance
        }
        return true;
    }
    function findTrackingToFit(lines) {
        // Try zero first
        if (withinWidthStrict(lines, 0))
            return 0;
        // Try negative tracking down to min
        if (trackCfg.min < 0) {
            for (let t = -Math.abs(trackCfg.step); t >= trackCfg.min - 1e-9; t -= Math.abs(trackCfg.step)) {
                if (withinWidthStrict(lines, t))
                    return t;
            }
        }
        // (Positive tracking increases width; generally not helpful)
        return null;
    }
    let globalBestFont = -1;
    let globalBestLines = [];
    let globalBestTracking = 0;
    let globalBestLH = defaultLH;
    let globalBestWasWidthLimited = false;
    let globalBestWasHeightLimited = false;
    for (const LH of scanLHs) {
        let lo = area.constraints.minFont;
        let hi = upperBound;
        let best = -1;
        let bestLines = [];
        let bestTracking = 0;
        while (lo <= hi) {
            const mid = Math.floor((lo + hi) / 2);
            ctx.font = `${mid}px ${fontFamily}`;
            let wrapped = balancedWrap(ctx, text, area.shape.w, Lmax, { hyphenate: allowHyph, locale: opts.locale });
            let lines = wrapped.lines;
            let trackingUsed = 0;
            // If wrap failed, check if single-word can be salvaged by micro negative tracking
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
                    // Determine limiting factors at this candidate
                    // Width-limited if any line is very close to width or if non-zero tracking was needed
                    for (const ln of lines) {
                        const mw = ctx.measureText(ln).width;
                        const eff = mw * (1 + trackingUsed / 20);
                        if (eff >= area.shape.w - 0.5) {
                            widthLimitedAtThisMid = true;
                            break;
                        }
                    }
                    // Height-limited if total line box height is near area height
                    if (linesH >= H - 0.5)
                        heightLimitedAtThisMid = true;
                }
            }
            if (feasible) {
                best = mid;
                bestLines = lines;
                bestTracking = trackingUsed;
                // Record limiting states for this best-so-far at this LH
                // If either is true, we keep them for potential global comparison below
                var bestWidthLimited = widthLimitedAtThisMid;
                var bestHeightLimited = heightLimitedAtThisMid;
                lo = mid + 1; // try bigger
            }
            else {
                hi = mid - 1; // shrink
            }
        }
        if (best > 0) {
            // Compare to global best: prefer larger font, then smaller |tracking|, then fewer lines
            const tie = best === globalBestFont;
            const better = best > globalBestFont ||
                (tie && Math.abs(bestTracking) < Math.abs(globalBestTracking)) ||
                (tie && Math.abs(bestTracking) === Math.abs(globalBestTracking) && bestLines.length < globalBestLines.length);
            if (better) {
                globalBestFont = best;
                globalBestLines = bestLines;
                globalBestTracking = bestTracking;
                globalBestLH = LH;
                // Re-evaluate limiting factors at the selected best to ensure correctness
                ctx.font = `${best}px ${fontFamily}`;
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
        reasons.push("width-limited");
    if (globalBestWasHeightLimited)
        reasons.push("height-limited");
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
