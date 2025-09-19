export function rolesPromptSpec(schema) {
    const lines = [];
    for (const s of schema.specs) {
        const roleName = s.role.toUpperCase();
        const countStr = s.count === 1 ? '1 item' : `up to ${s.count} items`;
        const graphemes = `${s.graphemeBudget} graphemes`;
        const linesInfo = s.singleLine ? 'single-line' : `maxLines up to ${s.maxLines}`;
        const upper = s.uppercaseRecommended ? ', UPPERCASE' : '';
        lines.push(`- ${roleName} (${countStr}, ≤${graphemes}, ${linesInfo}${upper})`);
    }
    return lines.join('\n');
}
export const BUNDLE_PROMPT_TEMPLATE = `You are a performance copywriter. Create 12–16 JSON-only BUNDLES for an image ad.

INPUT CONTEXT (JSON):
{{CTX}}

ROLES & BUDGETS (STRICT):
{{ROLES_SPEC}}

HARD CONSTRAINTS:
- Output JSON array "bundles": [{id, angle, theme_id, roles:{ ...exactly the keys listed above... }}]
- Respect grapheme caps per role; for roles with count>1 (e.g., bullets), provide an ARRAY with up to that many items.
- Reading grade ≤ 8. Locale-aware spelling.
- Include mustInclude; avoid mustAvoid. No emojis/hashtags.
 - Ensure diversity across structures (question, promise, problem→solution, how-to, proof, pattern-break). No numbers.

RETURN: JSON only, no markdown or commentary.`;
export function buildBundlePrompt(ctx, schema) {
    const ctxJson = JSON.stringify(ctx, null, 2);
    const spec = rolesPromptSpec(schema);
    return BUNDLE_PROMPT_TEMPLATE.replace('{{CTX}}', ctxJson).replace('{{ROLES_SPEC}}', spec);
}
export async function generateBundles(ctx, schema, n = 14) {
    const angles = ['QUESTION', 'PROOF', 'PROMISE', 'HOW_TO'];
    const samples = {};
    for (const s of schema.specs) {
        if (s.role === 'headline')
            samples[s.role] = 'What if ads wrote themselves?';
        else if (s.role === 'cta')
            samples[s.role] = 'START FREE';
        else if (s.role === 'bullets')
            samples[s.role] = ['Point one', 'Point two'].slice(0, s.count);
        else
            samples[s.role] = `Sample ${s.role}`;
    }
    const base = [];
    for (let i = 0; i < Math.min(n, 4); i++) {
        const roles = {};
        for (const s of schema.specs) {
            const v = samples[s.role];
            // Ensure arrays obey count limit
            if (Array.isArray(v))
                roles[s.role] = v.slice(0, s.count);
            else
                roles[s.role] = v;
        }
        base.push({ id: `b${i + 1}`, angle: angles[i % angles.length], theme_id: 'default', roles });
    }
    return base;
}
export { buildLLMPrompt } from './llm/promptBuilder.js';
