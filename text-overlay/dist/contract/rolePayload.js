import { z } from 'zod';
export const RoleTextZ = z.union([z.string(), z.array(z.string().min(1))]);
// The explicit, renderer-facing text input.
export const RolePayloadZ = z.object({
    templateId: z.string(),
    roles: z.record(z.string(), RoleTextZ),
    locale: z.string().optional(),
    brandColors: z.array(z.string().regex(/^#[0-9A-Fa-f]{6}$/)).optional()
});
// Validate RolePayload against a template's role schema:
// - keys must exist in schema
// - array lengths <= count
// - each string length <= graphemeBudget (approx; the fitter still enforces real constraints)
export function validateRolePayload(payload, schema) {
    const errors = [];
    const map = Object.fromEntries(schema.specs.map(s => [s.role, s]));
    const cleanRoles = {};
    for (const [role, val] of Object.entries(payload.roles)) {
        const spec = map[role];
        if (!spec) {
            errors.push(`Unknown role: ${role}`);
            continue;
        }
        if (Array.isArray(val)) {
            if (val.length > spec.count)
                errors.push(`Role ${role} has ${val.length} items, exceeds count=${spec.count}`);
            const arr = val.slice(0, spec.count).map(s => String(s).trim());
            cleanRoles[role] = arr;
            for (const s of arr) {
                if (s.length > (spec.graphemeBudget + 20))
                    errors.push(`Role ${role} item over soft budget (${s.length}>${spec.graphemeBudget})`);
            }
        }
        else {
            const s = String(val).trim();
            cleanRoles[role] = s;
            if (s.length > (spec.graphemeBudget + 20))
                errors.push(`Role ${role} over soft budget (${s.length}>${spec.graphemeBudget})`);
        }
    }
    return { ok: errors.length === 0, errors, clean: { ...payload, roles: cleanRoles } };
}
