export function enforceNoNumbersInRoles(roles) {
    const scrub = (s) => s.replace(/[0-9$€£%]/g, '').replace(/\s+/g, ' ').trim();
    const out = {};
    for (const [k, v] of Object.entries(roles)) {
        if (Array.isArray(v))
            out[k] = v.map(scrub).filter(x => x.length > 0);
        else
            out[k] = scrub(v);
    }
    return out;
}
export function containsNumeric(s) {
    return /[0-9$€£%]/.test(s);
}
