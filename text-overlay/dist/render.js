import { createCanvas, loadImage } from "canvas";
import { relLuminance, pickTextColor, hexToRgb, contrastRatio } from "./wcag.js";
export async function renderText(bgPath, outPath, area, text, fontFamily, report, brandColors, options) {
    if (!report.fits)
        throw new Error("Refuse to render: fits=false");
    if (!report.font_px || !report.lineBreaks)
        throw new Error("FitReport missing font/lines");
    try {
        console.log(`[render] loading bg ${bgPath}`);
    }
    catch { }
    const bg = await loadImage(bgPath);
    const canvas = createCanvas(bg.width, bg.height);
    const ctx = canvas.getContext("2d");
    // Draw background
    ctx.drawImage(bg, 0, 0);
    // Sample background under the area to estimate luminance (average WCAG luminance)
    const sample = ctx.getImageData(area.shape.x, area.shape.y, area.shape.w, area.shape.h);
    let sum = 0;
    for (let i = 0; i < sample.data.length; i += 4) {
        sum += relLuminance(sample.data[i], sample.data[i + 1], sample.data[i + 2]);
    }
    const bgLuma = sum / (sample.data.length / 4);
    // Choose text color and optional scrim
    let pick;
    let chosenColorLuma = null;
    const hasCustomColor = !!options?.color;
    if (hasCustomColor) {
        try {
            const [r, g, b] = hexToRgb(options.color);
            chosenColorLuma = relLuminance(r, g, b);
            pick = { color: `#${options.color.replace(/^#/, '').toUpperCase()}`, ratio: contrastRatio(bgLuma, chosenColorLuma) };
        }
        catch {
            pick = pickTextColor(bgLuma, brandColors);
        }
    }
    else {
        pick = pickTextColor(bgLuma, brandColors);
    }
    let appliedScrim = false;
    let scrimType = "none";
    const maxOpacity = Math.min(1, Math.max(0, options?.scrim?.maxOpacity ?? 0.35));
    const allowScrim = !hasCustomColor || !!(options?.scrim?.allowWithCustomColor);
    // Adaptive scrim: apply gradient only when contrast is low
    if (allowScrim && pick.ratio < 4.5) {
        appliedScrim = true;
        scrimType = "gradient";
        // Vertical gradient from 0 at top to adaptive opacity at bottom
        const deficit = Math.max(0, 4.5 - pick.ratio); // 0 when already good
        const bottomOpacity = Math.min(maxOpacity, Math.min(0.20, deficit * 0.08));
        // Create a pseudo gradient using multiple bands (mock-friendly)
        const bands = 6;
        for (let i = 0; i < bands; i++) {
            const t = (i + 1) / bands;
            const alpha = bottomOpacity * t;
            ctx.fillStyle = `rgba(0,0,0,${alpha.toFixed(3)})`;
            const y = area.shape.y + Math.floor((area.shape.h * i) / bands);
            const h = Math.floor(area.shape.h / bands);
            ctx.fillRect(area.shape.x, y, area.shape.w, h);
        }
        // Heuristic: darken luma to estimate improved contrast
        const boostedLuma = Math.max(0, bgLuma - 0.12);
        if (hasCustomColor && chosenColorLuma != null) {
            // Recompute ratio for the same chosen color against boosted background
            pick = { color: pick.color, ratio: contrastRatio(boostedLuma, chosenColorLuma) };
        }
        else {
            // No custom color: re-pick for best contrast
            pick = pickTextColor(boostedLuma, brandColors);
        }
    }
    // Set text styles
    const fontPx = report.font_px;
    const LH = area.constraints.lineHeight.value || 1.1;
    const lineH = fontPx * LH;
    const weight = (options?.fontWeight && String(options.fontWeight).trim()) || '';
    ctx.font = `${weight ? weight + ' ' : ''}${fontPx}px ${fontFamily}`;
    ctx.fillStyle = pick.color;
    ctx.textBaseline = "top";
    // Vertical alignment
    const totalH = lineH * report.lineBreaks.length;
    let y = area.shape.y;
    if (area.vAlign === "center")
        y = area.shape.y + (area.shape.h - totalH) / 2;
    if (area.vAlign === "bottom")
        y = area.shape.y + (area.shape.h - totalH);
    // Draw lines with horizontal align
    // Optional stroke if still low contrast and not CTA
    let strokeApplied = false;
    let effectiveRatio = pick.ratio;
    if ((effectiveRatio < 4.5 || !!options?.stroke) && area.role !== "cta") {
        strokeApplied = true;
    }
    for (const line of report.lineBreaks) {
        const w = ctx.measureText(line).width;
        let x = area.shape.x;
        if (area.align === "center")
            x = area.shape.x + (area.shape.w - w) / 2;
        if (area.align === "right")
            x = area.shape.x + (area.shape.w - w);
        if (strokeApplied) {
            const autoWidth = Math.max(1, Math.ceil(report.font_px * 0.04));
            ctx.lineWidth = options?.stroke?.widthPx ?? autoWidth;
            const isWhite = pick.color.toUpperCase() === '#FFFFFF';
            ctx.strokeStyle = options?.stroke?.color ?? (isWhite ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)');
            ctx.strokeText?.(line, x, y);
            // Heuristic bump for effective contrast with stroke
            effectiveRatio = Math.max(effectiveRatio, 3.2);
        }
        ctx.fillText(line, x, y);
        y += lineH;
    }
    // Write file
    const fs = await import("fs");
    fs.writeFileSync(outPath, canvas.toBuffer("image/png"));
    return { outPath, usedColor: pick.color, contrastRatio: effectiveRatio, appliedScrim, scrimType, strokeApplied, lineHeightPx: lineH };
}
