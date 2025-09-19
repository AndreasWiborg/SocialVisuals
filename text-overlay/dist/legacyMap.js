export function normalizeRole(id, contentTypeId) {
    const cid = String(contentTypeId || "").toUpperCase();
    const lid = String(id || "").toLowerCase();
    if (cid === "HEADLINE_MAIN" || cid === "HEADLINE_QUESTION")
        return "headline";
    if (cid === "CTA_PRIMARY")
        return "cta";
    if (lid === "headline" || lid.startsWith("title"))
        return "headline";
    if (lid.startsWith("body") || lid.startsWith("value_statement"))
        return "body";
    if (/^benefit\d+/i.test(id) || /^step\d+/i.test(id))
        return "bullet";
    if (lid === "cta" || lid === "cta_info" || lid.startsWith("contact"))
        return "contact";
    return "body";
}
export function mapAlign(a) {
    const s = String(a || "left").toLowerCase();
    if (s === "center")
        return "center";
    if (s === "right")
        return "right";
    return "left";
}
export function mapVAlign(a) {
    const s = String(a || "middle").toLowerCase();
    if (s === "top")
        return "top";
    if (s === "bottom")
        return "bottom";
    return "center";
}
