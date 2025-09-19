function clone(x) { return JSON.parse(JSON.stringify(x)); }
function isTextArea(a) {
    // Treat any area with role (string) as text; all template areas here are text boxes
    return !!a && typeof a.role === 'string';
}
export function normalizeTemplateRoles(tpl) {
    const t = clone(tpl);
    const id = String(t.templateId || '').toLowerCase();
    const isMeme2 = id.startsWith('meme2');
    const isMeme3 = id.startsWith('meme3');
    // Snapshot of "text areas" before we mutate roles
    const textAreas = t.areas.filter(isTextArea);
    for (const a of t.areas) {
        if (typeof a.role !== 'string')
            continue;
        if (a.role === 'body') {
            const aid = String(a.id || '').toLowerCase();
            if (/meme[_-]?neg/.test(aid))
                a.role = 'meme.negative';
            else if (/meme[_-]?pos/.test(aid))
                a.role = 'meme.positive';
            else if (/meme.*one(line|liner)/.test(aid))
                a.role = 'meme.oneliner';
        }
    }
    // Meme families by templateId hints
    if (isMeme2) {
        const count = textAreas.length;
        if (count === 1) {
            const a = t.areas.find(isTextArea);
            if (a)
                a.role = 'meme.oneliner';
        }
    }
    if (isMeme3) {
        // If there are two text areas and ids include negative/positive, set accordingly
        const two = textAreas.length === 2;
        if (two) {
            for (const a of t.areas) {
                const aid = String(a.id || '').toLowerCase();
                if (/negative/.test(aid))
                    a.role = 'meme.negative';
                if (/positive/.test(aid))
                    a.role = 'meme.positive';
            }
        }
    }
    return t;
}
