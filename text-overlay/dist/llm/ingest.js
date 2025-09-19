import { BundlesZ } from "./contract.js";
import { enforceNoNumbersInRoles } from "../policy.js";
import { cleanHeadline, collapseSpaces } from "../textQuality.js";
import { dedupeKeepOrder } from './dedup.js';
const BAD_END_RE = /\b(a|an|the|your|our|their|to|of|for|with|in|on|at|by|and|or)\s*$/i;
function endsClean(s, isQuestion) {
    const t = collapseSpaces(s);
    if (isQuestion)
        return /\?\s*$/.test(t) && !BAD_END_RE.test(t.replace(/\?+$/, ""));
    return !/[,:;]$/.test(t) && !BAD_END_RE.test(t);
}
const STOP = new Set([
    "a", "an", "the", "your", "our", "their", "to", "of", "for", "with", "in", "on", "at", "by", "and", "or", "so", "you", "can", "it", "is", "are", "be", "this", "that", "here", "how", "what"
]);
function normWord(w) {
    let t = w.toLowerCase().replace(/[^a-z\-]/g, " ");
    // split hyphens: on-brand -> on brand
    t = t.replace(/-/g, " ");
    return t.split(/\s+/).filter(Boolean).map(stemOne);
}
function stemOne(w) {
    // very light stemmer
    if (w.endsWith("ing") && w.length > 5)
        w = w.slice(0, -3);
    else if (w.endsWith("ed") && w.length > 4)
        w = w.slice(0, -2);
    else if (w.endsWith("es") && w.length > 4)
        w = w.slice(0, -2);
    else if (w.endsWith("s") && w.length > 3)
        w = w.slice(0, -1);
    else if (w.endsWith("ly") && w.length > 4)
        w = w.slice(0, -2);
    // domain synonyms → canonical roots
    const MAP = {
        "onbrand": "brand", "brand": "brand",
        "advert": "ad", "ads": "ad", "ad": "ad", "creative": "ad", "creativ": "ad",
        "rewrite": "rewrite", "approval": "rewrite", "thrash": "rewrite", "edit": "rewrite",
        "layout": "layout",
        "ship": "ship", "publish": "ship", "launch": "ship",
        "guardrail": "guardrail", "check": "guardrail", "rule": "guardrail", "policy": "guardrail",
        "template": "template", "component": "template",
        "automate": "automate", "automation": "automate", "auto": "automate",
        "fit": "fit", "fitting": "fit",
        "consistent": "consistent", "consisten": "consistent", "clean": "clean", "polish": "clean",
        "brandguardrail": "guardrail"
    };
    return MAP[w] || w;
}
function tokenSet(s) {
    const tokens = s.split(/\s+/).flatMap(normWord).filter(t => t.length > 2 && !STOP.has(t));
    return new Set(tokens);
}
function jaccard(a, b) {
    const inter = [...a].filter(x => b.has(x)).length;
    const uni = new Set([...a, ...b]).size;
    return uni ? inter / uni : 0;
}
function answerShapeBonus(headline, body) {
    const isQ = /^(what|how)\b/i.test(headline.trim());
    if (!isQ)
        return 0;
    const t = body.toLowerCase();
    if (/^(use|let|here('|’)s how|here is how)\b/.test(t))
        return 1.0;
    if (/so you can\b/.test(t))
        return 0.8;
    if (/\bguardrail|template|automate|fit\b/.test(t))
        return 0.5;
    return 0;
}
export function softCoherenceScore(roles) {
    const h = String(roles?.headline || "");
    const body = String(roles?.body || "");
    if (!h || !body)
        return 0.0;
    const A = tokenSet(h);
    const B = tokenSet(body);
    const lex = jaccard(A, B); // 0..1
    const pat = answerShapeBonus(h, body); // 0..1
    return Math.max(0, Math.min(1, 0.6 * lex + 0.4 * pat));
}
export function checkCTAWhitelist(roles, enriched) {
    const errs = [];
    for (const s of enriched.specs) {
        if (s.semantics.kind !== "cta")
            continue;
        const v = roles[s.role];
        if (!v)
            continue;
        const arr = Array.isArray(v) ? v : [v];
        const wl = (s.semantics.ctaWhitelist || []).map(x => x.toLowerCase());
        for (const c of arr)
            if (wl.length && !wl.includes(String(c).toLowerCase()))
                errs.push(`cta "${c}" not in whitelist for ${s.role}`);
    }
    return errs;
}
export function validateAndClean(bundlesRaw, _schema, enriched) {
    const out = { ok: false, errors: [], warnings: [], scores: {} };
    let arr;
    try {
        arr = BundlesZ.parse(bundlesRaw);
    }
    catch (e) {
        out.errors.push("Invalid JSON: " + e.message);
        return out;
    }
    const cleaned = [];
    for (const b of arr) {
        const roles = {};
        const orig = {};
        for (const spec of enriched.specs) {
            const v = b.roles[spec.role];
            if (v != null)
                orig[spec.role] = Array.isArray(v) ? v.slice() : String(v);
            // Normalize into an array when role has multiple areas
            if (spec.count > 1) {
                let arrVals = [];
                if (Array.isArray(v))
                    arrVals = v.map(x => String(x));
                else if (v != null)
                    arrVals = [String(v)];
                // Dedupe while preserving order
                arrVals = dedupeKeepOrder(arrVals);
                // Trim extras
                if (arrVals.length > spec.count)
                    arrVals = arrVals.slice(0, spec.count);
                // Warn if insufficient unique items; do NOT backfill here
                if (arrVals.length < spec.count) {
                    out.warnings.push({ bundleId: b.id, role: spec.role, reason: 'insufficient-unique-items', have: arrVals.length, need: spec.count });
                }
                roles[spec.role] = arrVals;
            }
            else {
                // Single-area role
                if (v == null)
                    continue;
                if (Array.isArray(v)) {
                    // Preserve multiple options if provided by the LLM
                    const arr = v.map(x => String(x)).filter(Boolean);
                    // If exactly one, unwrap to string; if more than one, keep as array for downstream preselection
                    roles[spec.role] = arr.length === 1 ? arr[0] : arr;
                }
                else {
                    roles[spec.role] = String(v);
                }
            }
        }
        const noNums = enforceNoNumbersInRoles(roles);
        if (noNums["headline"] && typeof noNums["headline"] === "string") {
            const kind = /^(what|how)\b/i.test(String(noNums["headline"])) ? "QUESTION" : "STATEMENT";
            const cl = cleanHeadline(String(noNums["headline"]), kind);
            if (cl)
                noNums["headline"] = cl;
        }
        const vios = [];
        for (const k of Object.keys(noNums)) {
            const vv = noNums[k];
            const arrv = Array.isArray(vv) ? vv : [vv];
            for (const s of arrv) {
                const q = /^(what|how)\b/i.test(String(s));
                if (!endsClean(String(s), q))
                    vios.push(`${k}:ending`);
                const before = orig[k];
                const beforeStr = Array.isArray(before) ? before.join(' ') : String(before || '');
                if (/[0-9$€£%]/.test(beforeStr))
                    vios.push(`${k}:numeric`);
            }
        }
        // Meme roles: coerce arrays to a single one-liner; strip newlines and collapse spaces
        for (const key of Object.keys(noNums)) {
            if (!key.startsWith('meme.'))
                continue;
            const val = noNums[key];
            let one = '';
            if (Array.isArray(val))
                one = val.join(' ');
            else
                one = String(val || '');
            one = one.replace(/\r?\n+/g, ' ').replace(/\s+/g, ' ').trim();
            noNums[key] = one;
        }
        // Reviews & Insights hardening
        for (const key of Object.keys(noNums)) {
            if (!/^(review\.|insight\.)/.test(key))
                continue;
            const val = noNums[key];
            let s = Array.isArray(val) ? val.join(' ') : String(val || '');
            // Single line and collapse
            s = s.replace(/\r?\n+/g, ' ').replace(/\s+/g, ' ').trim();
            if (key === 'review.attribution') {
                if (!/^—\s/.test(s))
                    s = `— ${s.replace(/^[-–—]\s?/, '')}`;
                if (s.length > 40) {
                    const parts = s.split(' ');
                    const kept = [];
                    for (const w of parts) {
                        if ((kept.join(' ').length ? kept.join(' ').length + 1 : 0) + w.length <= 40)
                            kept.push(w);
                        else
                            break;
                    }
                    s = kept.join(' ').replace(/[\s,.;:!]+$/, '');
                }
            }
            noNums[key] = s;
        }
        const coh = softCoherenceScore(noNums);
        const ctaErrs = checkCTAWhitelist(noNums, enriched);
        if (ctaErrs.length)
            out.errors.push(`bundle ${b.id} CTA errors: ${ctaErrs.join("; ")}`);
        if (vios.length)
            out.warnings.push(`bundle ${b.id} hygiene: ${vios.join(", ")}`);
        // Meme hardening
        const memeKeys = Object.keys(noNums).filter(k => k.startsWith('meme.'));
        for (const mk of memeKeys) {
            let t = String(noNums[mk] || '').replace(/\r?\n+/g, ' ');
            // Strip emojis and hashtags
            t = t.replace(/[#][A-Za-z0-9_]+/g, '').replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '');
            // Collapse whitespace
            t = t.replace(/\s+/g, ' ').trim();
            if (mk === 'meme.negative') {
                const SOL = /(\bfix\b|\bsolve\b|\bsolution\b|\bwe\b|\bour\b|\btry\b|\buse\b)/i;
                const m = t.match(SOL);
                if (m) {
                    const cut = t.toLowerCase().indexOf(m[1].toLowerCase());
                    if (cut > 0) {
                        t = t.slice(0, cut).trim().replace(/[\s,.;:!]+$/, '');
                        out.warnings.push(`bundle ${b.id} meme.negative: stripped solution clause`);
                    }
                }
            }
            else if (mk === 'meme.oneliner') {
                // Ensure 5–12 words; if longer, trim middle with ellipsis
                const words = t.split(/\s+/).filter(Boolean);
                if (words.length > 12) {
                    const head = words.slice(0, 6).join(' ');
                    const tail = words.slice(-5).join(' ');
                    t = `${head} … ${tail}`;
                    out.warnings.push(`bundle ${b.id} meme.oneliner: trimmed to 5–12 words`);
                }
            }
            // If it looks like a question (starts with what/how) ensure it ends with '?'
            if (/^(what|how)\b/i.test(t) && !/\?\s*$/.test(t))
                t = t.replace(/[\s,.;:!]+$/, '') + '?';
            noNums[mk] = t;
        }
        cleaned.push({ ...b, roles: noNums });
        out.scores[b.id] = { coherence: coh, ctaOk: ctaErrs.length === 0 };
    }
    if (!cleaned.length) {
        out.errors.push("No usable bundles.");
        return out;
    }
    out.ok = out.errors.length === 0;
    out.bundles = cleaned;
    return out;
}

// Enforce uniqueness for multi-area roles across any roles object according to schema/specs.
// - Dedupe via normalizeForEquality/dedupeKeepOrder
// - Trim extras to spec.count
// - If under-supplied after dedupe:
//   * For bullets/benefits/features, fill with '•' to spec.count
//   * Otherwise, leave short (ranker will penalize insufficient unique items)
export function enforceMultiAreaUniqueness(roles, enriched) {
    const out = { ...roles };
    try {
        for (const spec of enriched.specs || []) {
            if (!spec || !spec.role)
                continue;
            if ((spec.count || 1) <= 1)
                continue;
            const roleName = spec.role;
            let val = out[roleName];
            if (val == null)
                continue;
            let arr = Array.isArray(val) ? val.map(s => String(s)) : [String(val)];
            arr = dedupeKeepOrder(arr);
            if (arr.length > spec.count)
                arr = arr.slice(0, spec.count);
            if (arr.length < spec.count) {
                if (/bullet|benefit|feature/i.test(roleName)) {
                    while (arr.length < spec.count)
                        arr.push('•');
                }
            }
            out[roleName] = arr;
        }
    }
    catch { }
    return out;
}
