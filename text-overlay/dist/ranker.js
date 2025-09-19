import { fitText } from "./layoutOracle.js";
export const RANK_WEIGHTS = {
    smallCutoff: 0.75,
    smallPenalty: -0.4,
    sweetMin: 0.90,
    sweetBonus: +0.2,
    linesBonus: +0.1,
    badTail: -0.5,
};
function computeUpperBoundFontPx(area, tpl) {
    const H = area.shape.h;
    const Lmax = typeof area.constraints.maxLines === 'number' ? area.constraints.maxLines : area.constraints.maxLines.max;
    const LH = area.constraints.lineHeight?.value || 1.1;
    const role = area.role;
    const tplRatio = (tpl?.fonts?.[role]?.capHeightRatio);
    const C = (typeof tplRatio === 'number' ? tplRatio : (area.constraints.fontSizing?.capHeightRatio)) ?? 0.70;
    const targetCap = area.constraints.fontSizing?.optical?.targetCapHeightPx ?? Infinity;
    const byHeight = Math.floor(H / Math.max(1, (Lmax * LH)));
    const byOptics = Number.isFinite(targetCap) ? Math.floor(targetCap / Math.max(1e-6, C)) : Number.POSITIVE_INFINITY;
    return Math.max(area.constraints.minFont || 0, Math.min(byHeight, byOptics));
}
export async function buildCandidatesForHeadline(bundles, template, _schema, fontFamily, locale) {
    const area = template.areas.find(a => a.role === "headline") || template.areas[0];
    const out = [];
    for (const b of bundles) {
        const h = (b.roles || {}).headline;
        if (!h || typeof h !== "string")
            continue;
        const rep = await fitText(h, area, fontFamily, template.pixelSize?.w, { locale });
        if (!rep.fits)
            continue;
        const widthLimited = (rep.reasons || []).some((r) => String(r).includes("width"));
        const ub = computeUpperBoundFontPx(area, template);
        out.push({
            id: `${b.id}::h`,
            bundleId: b.id,
            angle: b.angle,
            text: h,
            len: h.length,
            fitFont: rep.font_px || 0,
            upperBound: ub || 1,
            lines: rep.lines || (rep.lineBreaks?.length || 1),
            widthLimited,
            bonus: 0
        });
    }
    return out;
}
export function selectTopK(cands, k, bundleScores) {
    if (!cands.length)
        return [];
    const base = (c) => (c.fitFont / 100) + (c.widthLimited ? -0.02 : 0);
    const picked = [];
    const seenAngles = new Set();
    const seenStarts = new Set();
    const seenBins = new Map();
    const bin = (L) => L < 24 ? "tight" : L > 36 ? "expansive" : "standard";
    let pool = [...cands];
    while (picked.length < k && pool.length) {
        let best;
        let bestScore = -1e9;
        for (const c of pool) {
            const coh = bundleScores?.[c.bundleId]?.coherence ?? 0;
            const ctaOk = bundleScores?.[c.bundleId]?.ctaOk ?? true;
            // hard floor: if coherence is extremely low, downrank hard (or skip entirely)
            if (coh < 0.10)
                continue;
            const angPenalty = seenAngles.has(c.angle) ? -0.08 : 0;
            const b = bin(c.len);
            const binPenalty = (seenBins.get(b) || 0) > 0 ? -0.06 : 0;
            const dupStart = c.text.toLowerCase().split(/\s+/).slice(0, 3).join(" ");
            const dupPenalty = seenStarts.has(dupStart) ? -0.07 : 0;
            const policy = (ctaOk ? 0 : -0.2) + (0.08 * coh);
            const denom = c.upperBound || 1;
            const ratio = denom > 0 ? (c.fitFont / denom) : 0;
            let ratioAdj = 0;
            if (ratio < RANK_WEIGHTS.smallCutoff)
                ratioAdj += RANK_WEIGHTS.smallPenalty;
            if (ratio >= RANK_WEIGHTS.sweetMin && ratio <= 1.0)
                ratioAdj += RANK_WEIGHTS.sweetBonus;
            const linesAdj = (c.lines === 2 || c.lines === 3) ? RANK_WEIGHTS.linesBonus : 0;
            const cleaned = c.text.trim().replace(/[?.!…]+$/, '');
            const last = cleaned.split(/\s+/).pop()?.toLowerCase() || '';
            const badTailList = new Set(["and", "or", "with", "for", "to", "of", "in", "on", "at", "by", "from", "every", "each", "without", "while", "when"]);
            const tailAdj = badTailList.has(last) ? RANK_WEIGHTS.badTail : 0;
            const score = base(c) + angPenalty + binPenalty + dupPenalty + policy + ratioAdj + linesAdj + tailAdj + c.bonus;
            if (score > bestScore) {
                best = c;
                bestScore = score;
            }
        }
        if (!best)
            break;
        picked.push(best);
        seenAngles.add(best.angle);
        seenStarts.add(best.text.toLowerCase().split(/\s+/).slice(0, 3).join(" "));
        const b = bin(best.len);
        seenBins.set(b, (seenBins.get(b) || 0) + 1);
        pool = pool.filter(x => x.id !== best.id);
    }
    return picked;
}
