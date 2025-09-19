import { RolePayloadZ } from './rolePayload.js';
// minimal synonym map for legacy keys → roles
const SYNONYMS = {
    h1: 'headline', headline: 'headline', title: 'headline',
    h2: 'subhead', subhead: 'subhead',
    body: 'body', copy: 'body', description: 'body', paragraph: 'body',
    bullets: 'bullets', bullet: 'bullets', points: 'bullets',
    cta: 'cta', button: 'cta', action: 'cta',
    legal: 'legal', disclaimer: 'legal',
    'meme.negative': 'meme.negative'
};
function norm(s) { return s.toLowerCase().replace(/[\s\-]/g, '').replace(/_/g, ''); }
export async function canonicalToRolePayload(tpl, schema, canonical) {
    var _a;
    const roles = {};
    const byRole = {};
    const byKey = canonical.texts || {};
    // 1) prefer exact area.id → text
    for (const area of tpl.areas) {
        const k1 = area.id;
        const k2 = norm(area.id);
        const val = byKey[k1] ?? byKey[k2];
        if (val && String(val).trim()) {
            (byRole[_a = area.role] || (byRole[_a] = [])).push(String(val).trim());
        }
    }
    // 2) role synonyms as fallback, but only if that role isn’t already populated
    for (const [k, v] of Object.entries(byKey)) {
        const r = SYNONYMS[norm(k)];
        if (!r)
            continue;
        if ((byRole[r]?.length ?? 0) === 0 && v && String(v).trim()) {
            (byRole[r] || (byRole[r] = [])).push(String(v).trim());
        }
    }
    // 3) cap arrays to spec.count; strings for single roles
    const map = Object.fromEntries(schema.specs.map(s => [s.role, s.count]));
    for (const [role, arr] of Object.entries(byRole)) {
        const max = map[role] ?? 1;
        const kept = arr.slice(0, max);
        roles[role] = (max === 1) ? (kept[0] ?? '') : kept;
    }
    const brandColors = [
        canonical.colors?.brand_primary,
        canonical.colors?.brand_secondary,
        canonical.colors?.accent_1,
        canonical.colors?.accent_2
    ].filter(Boolean);
    const payload = {
        templateId: tpl.templateId,
        roles,
        brandColors
    };
    // runtime validation (soft)
    RolePayloadZ.parse(payload);
    return payload;
}
