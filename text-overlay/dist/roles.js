import { maxLinesValue } from "./types.js";
function computeUpperBoundFontPx(area) {
    const H = area.shape.h;
    const Lmax = maxLinesValue(area.constraints.maxLines);
    const LH = area.constraints.lineHeight.value || 1.1;
    const C = area.constraints.fontSizing?.capHeightRatio ?? 0.70;
    const targetCap = area.constraints.fontSizing?.optical?.targetCapHeightPx ?? Infinity;
    const byHeight = Math.floor(H / (Lmax * LH));
    const byOptics = Number.isFinite(targetCap) ? Math.floor(targetCap / C) : Number.POSITIVE_INFINITY;
    return Math.min(byHeight, byOptics);
}
function estimateGraphemes(area, upperBoundFontPx) {
    const Lmax = maxLinesValue(area.constraints.maxLines);
    const avgGlyph = 0.52 * upperBoundFontPx; // average glyph width estimate (Latin)
    const perLine = Math.max(6, Math.floor(area.shape.w / Math.max(1, avgGlyph)));
    return Math.max(12, Math.floor(perLine * Lmax * 0.92));
}
export function deriveRoleSchema(tpl) {
    const groups = new Map();
    for (const a of tpl.areas) {
        const key = a.role;
        const arr = groups.get(key) || [];
        arr.push(a);
        groups.set(key, arr);
    }
    const specs = [];
    for (const [role, areas] of groups.entries()) {
        const count = areas.length;
        const widthPx = Math.max(...areas.map(a => a.shape.w));
        const heightPx = Math.max(...areas.map(a => a.shape.h));
        const maxLines = Math.max(...areas.map(a => maxLinesValue(a.constraints.maxLines)));
        const lineHeight = areas[0]?.constraints?.lineHeight?.value ?? 1.1;
        const upperPerArea = areas.map(a => computeUpperBoundFontPx(a));
        const upperBoundFontPx = Math.max(...upperPerArea);
        const budgets = areas.map(a => estimateGraphemes(a, upperBoundFontPx));
        const graphemeBudget = Math.min(...budgets);
        const singleLine = maxLines === 1;
        const hyphenate = !singleLine && role !== "cta";
        const uppercaseRecommended = singleLine && role === "cta";
        specs.push({
            role,
            count,
            maxLines,
            lineHeight,
            widthPx,
            heightPx,
            upperBoundFontPx,
            graphemeBudget,
            singleLine,
            hyphenate,
            uppercaseRecommended
        });
    }
    specs.sort((a, b) => a.role.localeCompare(b.role));
    return { specs };
}
export function roleBudgets(schema) {
    const out = {};
    for (const s of schema.specs) {
        out[s.role] = { graphemes: s.graphemeBudget, count: s.count, maxLines: s.maxLines };
    }
    return out;
}
