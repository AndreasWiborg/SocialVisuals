const BASE = {
    headline: { kind: "headline", purpose: "Hook with one clear idea.", musts: ["Complete thought or clean question", "No numbers", "If question, end with ?"] },
    subhead: { kind: "subhead", purpose: "Bridge from headline to body; add one clarifying detail.", musts: ["Support headline, don’t repeat it"] },
    body: { kind: "body", purpose: "Answer/expand headline with one mechanism or benefit.", musts: ["Follow headline logic", "No numbers"] },
    bullets: { kind: "bullets", purpose: "List concise features/benefits.", musts: ["One short phrase each", "Parallel grammar", "No numbers"] },
    cta: { kind: "cta", purpose: "Next action that matches the offer/experience.", musts: ["Verb-first", "≤24 graphemes", "No numbers"] },
    legal: { kind: "legal", purpose: "Mandatory legal/disclaimer; short and neutral." },
    badge: { kind: "badge", purpose: "Tiny label; neutral." },
    "meme.negative": { kind: "meme.negative", purpose: "Relatable pain; do not include the solution; single line; 5–11 words; no numbers/emojis/hashtags.", musts: ["One line", "5–11 words"], forbidden: ["Numbers", "Emojis", "Hashtags"] },
    "meme.positive": { kind: "meme.positive", purpose: "Solution/answer to the pain; single line; 4–10 words; no numbers/emojis/hashtags.", musts: ["One line", "4–10 words"], forbidden: ["Numbers", "Emojis", "Hashtags"] },
    "meme.oneliner": { kind: "meme.oneliner", purpose: "Pain + twist/solution in one sentence; single line; 5–12 words; no numbers/emojis/hashtags.", musts: ["One line", "5–12 words"], forbidden: ["Numbers", "Emojis", "Hashtags"] },
    "review.quote": { kind: "review.quote", purpose: "Testimonial line(s)", musts: ["1–2 lines", "≤ 90 graphemes", "No numbers/emojis/price"], forbidden: ["Numbers", "Emojis", "$", "%"] },
    "review.attribution": { kind: "review.attribution", purpose: "Attribution: — Name, Title/Company", musts: ["Single line", "≤ 40 graphemes", "No numerals"], forbidden: ["Numbers", "Emojis", "Hashtags"] },
    "insight.fact": { kind: "insight.fact", purpose: "Neutral industry fact", musts: ["No numbers", "≤ 110 graphemes"], forbidden: ["Numbers", "Emojis", "Hashtags"] },
    "insight.takeaway": { kind: "insight.takeaway", purpose: "Actionable implication", musts: ["≤ 90 graphemes", "No numbers"], forbidden: ["Numbers", "Emojis", "Hashtags"] },
    tagline: { kind: "tagline", purpose: "Short brand line; timeless." },
    logoText: { kind: "logoText", purpose: "Brand/product name only." }
};
function norm(s) { return String(s || "").toLowerCase(); }
function inferKind(area) {
    const r = norm(area.role);
    const id = norm(area.id);
    if (r.includes("cta"))
        return "cta";
    if (r.includes("headline") || r === "h1" || id.includes("headline"))
        return "headline";
    if (r.includes("sub") || id.includes("sub"))
        return "subhead";
    if (r.includes("bullet") || id.includes("bullet"))
        return "bullets";
    if (r.includes("legal") || id.includes("legal"))
        return "legal";
    if (r.includes("badge"))
        return "badge";
    if (r.includes("logo"))
        return "logoText";
    if ((r + id).includes("meme") && (r + id).includes("negative"))
        return "meme.negative";
    if ((r + id).includes("meme") && (r + id).includes("positive"))
        return "meme.positive";
    if (r.includes("tagline") || id.includes("tagline"))
        return "tagline";
    return "body";
}
export function enrichSchema(template, schema, ctx) {
    // Score CTA whitelist by product type
    const ptype = norm(ctx?.product?.type);
    const ctaFor = (kind) => {
        if (kind !== "cta")
            return [];
        if (ptype === "app")
            return ["Download app", "Get the app", "Install now", "Open in store", "Get it now"];
        if (ptype === "saas")
            return ["Start free", "Try it now", "Get started", "See how it works", "Start creating"];
        if (ptype === "content")
            return ["Learn more", "Read more", "See details", "Discover more"];
        if (ptype === "ecom")
            return ["Shop now", "View collection", "See details", "Add to cart"];
        if (ptype === "restaurant")
            return ["Book a table", "View menu", "Reserve now", "See today’s special", "Order now"];
        if (ptype === "hospitality" || ptype === "hotel")
            return ["Book now", "Check availability", "View rooms", "Plan your stay"];
        return ["Learn more", "Get started", "Try it now"];
    };
    const specs = schema.specs.map(s => {
        const area = template.areas.find(a => a.role === s.role || a.id === s.role) || template.areas.find(a => a.role === s.role);
        const kind = area ? inferKind(area) : "body";
        const base = { ...BASE[kind] };
        if (kind === "cta")
            base.ctaWhitelist = ctaFor(kind);
        return { ...s, kind, semantics: base };
    });
    // Choose scoring role: prefer headline, else the largest area by w*h
    const scoring = specs.find(s => s.role === "headline")
        || specs.reduce((m, s) => ((s.widthPx * s.heightPx) > (m.widthPx * m.heightPx) ? s : m), specs[0]);
    return { specs, scoringRole: scoring.role };
}
