import { BundlesZ } from "./bundleSchema.js";
import { deriveRoleSchema } from "./roles.js";
import { enforceNoNumbersInRoles } from "./policy.js";
import { cleanHeadline, brandShort, collapseSpaces } from "./textQuality.js";
const ANGLES = ["QUESTION", "PROBLEM_SOLUTION", "HOW_TO", "PROMISE", "PROOF", "PATTERN_BREAK"];
const uid = (p = "loc") => `${p}-${Math.random().toString(36).slice(2, 8)}`;
const VERBS = ["Ship", "Create", "Design", "Launch", "Scale", "Refine", "Automate", "Test", "Publish", "Build"];
const PAINS = ["rewrites", "approvals", "back-and-forth", "off-brand edits", "layout babysitting", "blank-page starts", "content thrash"];
const GAINS = ["on-brand ads", "polished creatives", "launch-ready work", "consistent output", "faster cycles", "clean layouts", "production-ready assets"];
const MECHS = ["guardrails", "templates", "automations", "workflow", "brand checks", "smart fitting", "components", "blueprints"];
const PROOFS = [
    "Built for tight turnarounds",
    "Trusted by teams that can’t miss deadlines",
    "Chosen by brands with high bars",
    "Made for ship days, not slide decks"
];
const CTAS = ["Start free", "Try it now", "Get started", "See how it works", "Start creating", "Give it a try"];
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
// Tone variants can be extended per brandVoice; keep it simple for now
function toneAdjust(s, _brandVoice, tone) {
    if (tone === 'energetic')
        return s.replace(/\.$/, '!');
    if (tone === 'plain')
        return s.replace(/\.$/, '');
    return s;
}
function pickLengthModes(n) {
    const seq = [];
    const base = ["tight", "standard", "expansive", "standard"];
    for (let i = 0; i < n; i++)
        seq.push(base[i % base.length]);
    return seq;
}
// Headline makers that consider budget and brand
function q1(ctx, cap) {
    const b = brandShort(ctx.product?.name);
    const useBrand = b && (b.length <= 6) && (cap >= 28);
    return useBrand ? `What if ${b} wrote your ads?` : "What if your ads wrote themselves?";
}
function ps1() { const v = pick(VERBS), p = pick(PAINS), g = pick(GAINS), m = pick(MECHS); return `Too many ${p}? ${v} ${g} with ${m}.`; }
function how1() { const v = pick(VERBS).toLowerCase(), g = pick(GAINS), p = pick(PAINS); return `How to ${v} ${g} without ${p}`; }
function prom1() { const v = pick(VERBS), g = pick(GAINS); return `${v} ${g} every time`; }
function proof1() { return pick(PROOFS); }
function pb1() { const p = pick(PAINS), g = pick(GAINS); return `Stop ${p}. Start ${g}.`; }
const ANGLE_MAKERS = {
    QUESTION: q1,
    PROBLEM_SOLUTION: (_c, _cap) => ps1(),
    HOW_TO: (_c, _cap) => how1(),
    PROMISE: (_c, _cap) => prom1(),
    PROOF: (_c, _cap) => proof1(),
    PATTERN_BREAK: (_c, _cap) => pb1()
};
function bodyShort() { return `${pick(VERBS)} with ${pick(MECHS)}.`; }
function bodyStandard() { return `${pick(VERBS)} with ${pick(MECHS)} and ${pick(GAINS)}.`; }
function bodyExpansive() { return `${pick(VERBS)} ${pick(GAINS)} using ${pick(MECHS)} for teams.`; }
function buildCTA() {
    return pick(CTAS);
}
function bullets(max) {
    const pool = Array.from(new Set([...MECHS, ...GAINS]));
    const out = [];
    for (let i = 0; i < max; i++)
        out.push(pick(pool));
    return out.slice(0, max);
}
function neutral(role, ctx) {
    const base = ctx.product.name || 'Your team';
    if (role === 'subhead')
        return `${base} builds creative with less effort.`;
    if (role === 'legal')
        return `Terms apply`;
    return `${base} for ${ctx.audience}`;
}
export function rolesFromSchema(schema) {
    return schema.specs.map(s => s.role);
}
function chooseWithinCap(cands, cap, kind) {
    const filtered = cands.map(collapseSpaces).map(s => cleanHeadline(s, kind) || s).filter(s => s.length > 0);
    const fits = filtered.filter(s => s.length <= cap);
    if (fits.length > 0) {
        // pick the longest that fits for richness
        return fits.sort((a, b) => b.length - a.length)[0];
    }
    // pick the shortest and return as-is (no compression)
    return filtered.sort((a, b) => a.length - b.length)[0];
}
export async function generateBundlesLocal(ctx, schema, n = 14, opts) {
    const bundles = [];
    const modes = pickLengthModes(n);
    const seenTrigrams = new Set();
    for (let i = 0; i < n; i++) {
        // Angle with a small offset to avoid strict cycles
        const baseIdx = i % ANGLES.length;
        const idx = (i % 4 === 0) ? (baseIdx + 3) % ANGLES.length : baseIdx;
        let angle = ANGLES[idx];
        const mode = modes[i];
        // Caps per role based on mode
        const caps = {};
        for (const s of schema.specs) {
            const tight = Math.max(16, Math.round(s.graphemeBudget * 0.80));
            const standard = s.graphemeBudget;
            const expansive = Math.round(s.graphemeBudget * 1.20);
            caps[s.role] = mode === 'tight' ? tight : mode === 'expansive' ? expansive : standard;
        }
        // Base roles prior to budget enforcement
        const draft = {};
        for (const spec of schema.specs) {
            const cap = caps[spec.role];
            let raw = '';
            if (spec.role === 'headline') {
                // prepare variants by length for this angle
                const variants = [];
                const base = ANGLE_MAKERS[angle](ctx, cap);
                variants.push(base);
                // additional short/alt forms per angle
                if (angle === 'QUESTION') {
                    const b = brandShort(ctx.product?.name);
                    variants.push('What if your ads wrote themselves?');
                    if (b)
                        variants.push(`What if ${b} wrote your ads?`);
                }
                else if (angle === 'PROBLEM_SOLUTION') {
                    variants.push(`Too many ${pick(PAINS)}? ${pick(VERBS)} ${pick(GAINS)}.`);
                    variants.push(`${pick(VERBS)} ${pick(GAINS)} with ${pick(MECHS)}.`);
                }
                else if (angle === 'HOW_TO') {
                    variants.push(`How to ${pick(VERBS).toLowerCase()} ${pick(GAINS)}`);
                    variants.push(`How to ${pick(VERBS).toLowerCase()} ${pick(GAINS)} without ${pick(PAINS)}`);
                }
                else if (angle === 'PROMISE') {
                    variants.push(`${pick(VERBS)} ${pick(GAINS)}`);
                    variants.push(`${pick(VERBS)} ${pick(GAINS)} every time`);
                }
                else if (angle === 'PROOF') {
                    variants.push('Built for tight turnarounds');
                    variants.push('Chosen by brands with high bars');
                }
                else if (angle === 'PATTERN_BREAK') {
                    variants.push(`Stop ${pick(PAINS)}. Start ${pick(GAINS)}.`);
                    variants.push(`Stop ${pick(PAINS)}`);
                }
                raw = chooseWithinCap(variants, cap, angle === 'QUESTION' ? 'QUESTION' : 'STATEMENT');
                raw = toneAdjust(raw, ctx.brandVoice, ctx.tone);
            }
            else if (spec.role === 'cta') {
                const wl = (opts?.ctaWhitelist || []).filter(Boolean);
                const ctaPool = wl.length ? wl : Array.from(CTAS);
                raw = pick(ctaPool);
                // safety: if over cap, try the shortest from pool
                if (raw.length > cap) {
                    const shortest = ctaPool.slice().sort((a, b) => a.length - b.length)[0];
                    raw = shortest || raw;
                }
            }
            else if (spec.count > 1) {
                draft[spec.role] = bullets(spec.count);
                continue;
            }
            else if (spec.role === 'subhead') {
                const cands = [`${pick(VERBS)} with ${pick(MECHS)}`, `${pick(VERBS)} ${pick(GAINS)}`];
                raw = chooseWithinCap(cands, cap, 'STATEMENT');
            }
            else if (spec.role === 'body') {
                const cands = [bodyShort(), bodyStandard(), bodyExpansive()];
                raw = chooseWithinCap(cands, cap, 'STATEMENT');
            }
            else {
                const cands = [`${pick(VERBS)} ${pick(GAINS)}.`, `${pick(VERBS)} with ${pick(MECHS)}.`];
                raw = chooseWithinCap(cands, cap, 'STATEMENT');
            }
            draft[spec.role] = collapseSpaces(raw);
        }
        // Enforce hygiene and numbers policy only (no compression)
        let roles = enforceNoNumbersInRoles(draft);
        // Deduplicate by first 3 words of headline
        const hl = String(roles['headline'] || '').toLowerCase();
        const tri = hl.split(/\s+/).slice(0, 3).join(' ');
        if (tri && seenTrigrams.has(tri)) {
            // try next angle once
            const altAngle = ANGLES[(idx + 1) % ANGLES.length];
            if (altAngle !== angle) {
                const cap = caps['headline'];
                let raw = ANGLE_MAKERS[altAngle](ctx, cap);
                raw = toneAdjust(collapseSpaces(raw), ctx.brandVoice, ctx.tone);
                const txt = chooseWithinCap([raw], cap, altAngle === 'QUESTION' ? 'QUESTION' : 'STATEMENT');
                roles['headline'] = txt;
                angle = altAngle;
            }
        }
        const hl2 = String(roles['headline'] || '').toLowerCase();
        const tri2 = hl2.split(/\s+/).slice(0, 3).join(' ');
        if (tri2)
            seenTrigrams.add(tri2);
        roles = enforceNoNumbersInRoles(roles);
        const b = {
            id: uid(),
            angle,
            theme_id: angle.toLowerCase(),
            roles
        };
        bundles.push(b);
    }
    const parsed = BundlesZ.safeParse(bundles);
    if (!parsed.success)
        throw new Error('Local bundle validation failed');
    return bundles.slice(0, n);
}
// Convenience when given a Template instead of RoleSchema
export async function generateBundlesLocalFromTemplate(ctx, tpl, n = 14) {
    const schema = deriveRoleSchema(tpl);
    return generateBundlesLocal(ctx, schema, n);
}
