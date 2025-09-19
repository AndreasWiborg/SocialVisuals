import { detectScript, hyphenationLocaleFromBCP47 } from "../lang.js";
function firstTruthy(...xs) { return xs.find(Boolean) || ""; }
function classifyType(p) {
    if (p.hasAppBadges)
        return "app";
    if (p.hasCart)
        return "ecom";
    if (p.hasPricing)
        return "saas";
    return "content";
}
function deriveName(p) {
    const title = p.title || "";
    const ogSite = p.ogSiteName || "";
    const fromTitle = title.split(" | ")[0].split(" – ")[0].split(" — ")[0].trim();
    const name = firstTruthy(ogSite, fromTitle).trim();
    return name || "Brand";
}
function deriveBenefit(p) {
    const cand = firstTruthy(p.heroText, p.description, p.ogDesc);
    if (!cand)
        return undefined;
    const clean = cand.replace(/\s+/g, " ").replace(/[.!?]\s*$/, "");
    return clean.length > 120 ? clean.slice(0, 120).trim() : clean;
}
function deriveLocale(p) {
    const langAttr = (p.lang || "").trim();
    if (langAttr)
        return langAttr;
    const script = detectScript((p.title || "") + " " + (p.heroText || ""));
    if (script === "CJK")
        return "ja-JP";
    if (script === "Cyrillic")
        return "ru-RU";
    if (script === "Arabic")
        return "ar-SA";
    if (script === "Hebrew")
        return "he-IL";
    return "en-US";
}
export function buildCtxFromParsed(p) {
    const type = classifyType(p);
    const name = deriveName(p);
    const benefit = deriveBenefit(p);
    const topical = (p.heroText || p.headings[0] || "").toLowerCase();
    const topic = topical.match(/\b(brand|layout|template|design|creative|ads?|ship|publish|guardrails?)\b/i)?.[0];
    const mustInclude = [name].concat(topic ? [topic] : []).filter(Boolean);
    const mustAvoid = [];
    const locale = hyphenationLocaleFromBCP47(deriveLocale(p));
    return {
        product: { name, benefit, type, offer: undefined },
        audience: "General",
        tone: "clear",
        brandVoice: "simple",
        mustInclude,
        mustAvoid,
        locale
    };
}
