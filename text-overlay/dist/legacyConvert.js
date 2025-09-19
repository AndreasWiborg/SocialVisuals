import { normalizeRole, mapAlign, mapVAlign } from "./legacyMap.js";
function slugify(s) {
    return String(s || "untitled").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function num(v, d = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
}
function computeLineHeight(role, singleLine) {
    if (singleLine)
        return 1.0;
    if (role === "headline")
        return 1.08;
    if (role === "cta")
        return 1.0;
    return 1.12;
}
function computeMinFont(h, maxLines, lh) {
    const byHeight = Math.floor(h / Math.max(1, maxLines * lh));
    return Math.max(18, Math.floor(byHeight * 0.45));
}
function computeOpticalTarget(h, maxLines, lh, legacyMaxFont) {
    const byHeight = Math.floor(h / Math.max(1, maxLines * lh));
    const base = legacyMaxFont ? Math.min(legacyMaxFont, byHeight) : byHeight;
    return Math.floor(base * 0.70);
}
export function convertLegacyJson(old) {
    const w = num(old?.dimensions?.width, 1080);
    const h = num(old?.dimensions?.height, 1080);
    const templateId = slugify(old?.templateName || old?.name || "legacy-template");
    const areas = [];
    const fonts = {};
    const stas = Array.isArray(old?.safeTextAreas) ? old.safeTextAreas : [];
    for (const sta of stas) {
        const id = String(sta?.id || `area-${areas.length + 1}`);
        const role = normalizeRole(id, sta?.contentTypeId);
        const x = num(sta?.x);
        const y = num(sta?.y);
        const aw = num(sta?.width);
        const ah = num(sta?.height);
        const align = mapAlign(sta?.alignment);
        const vAlign = mapVAlign(sta?.verticalAlignment);
        const maxLines = num(sta?.maxLines, (sta?.minLines && sta?.minLines === sta?.maxLines) ? sta?.maxLines : ((role === "cta" || role === "contact") ? 1 : 3));
        const singleLine = maxLines === 1;
        const lh = computeLineHeight(role, singleLine);
        const legacyMaxFont = num(sta?.maxFontSize, undefined);
        const minFont = computeMinFont(ah, maxLines, lh);
        const opticalCap = computeOpticalTarget(ah, maxLines, lh, legacyMaxFont);
        const family = String(sta?.fontFamily || ((role === "cta" || role === "contact") ? "Montserrat" : "Arial"));
        if (!fonts[role])
            fonts[role] = { family, capHeightRatio: 0.70 };
        areas.push({
            id,
            role,
            align,
            vAlign,
            shape: { type: "rect", x, y, w: aw, h: ah },
            constraints: {
                maxLines,
                minFont,
                lineHeight: { type: "relative", value: lh },
                fontSizing: {
                    mode: "auto",
                    optical: { targetCapHeightPx: opticalCap },
                    capHeightRatio: 0.70
                }
            }
        });
    }
    const roleOrder = ["headline", "body", "bullet", "cta", "contact"];
    const priority = areas
        .slice()
        .sort((a, b) => {
        const ai = roleOrder.indexOf(a.role);
        const bi = roleOrder.indexOf(b.role);
        const aidx = ai >= 0 ? ai : 999;
        const bidx = bi >= 0 ? bi : 999;
        return aidx - bidx;
    })
        .map(a => a.id);
    return {
        templateId,
        pixelSize: { w, h },
        fonts,
        areas,
        priority
    };
}
