import { z } from 'zod';
import { buildHeadlineOnlyPrompt, buildBodiesForHeadlinePrompt } from './promptBuilder.js';
import { getProvider } from './providers/index.js';
import { cleanHeadline, collapseSpaces } from '../textQuality.js';
import { dedupeKeepOrder } from './dedup.js';
const Stage1Z = z.object({ id: z.string(), angle: z.enum(['QUESTION', 'PROMISE', 'HOW_TO', 'PROOF', 'PATTERN_BREAK']), headline: z.string() });
const Stage1ArrZ = z.array(Stage1Z);
export async function generateHeadlines(ctx, enriched, n, angleQuotas) {
    const provider = getProvider();
    const prompt = buildHeadlineOnlyPrompt(ctx, enriched, n, angleQuotas);
    const out = await provider.generate({ prompt, n });
    let arr = [];
    try {
        arr = JSON.parse(out.text || '[]');
    }
    catch {
        arr = [];
    }
    if (Array.isArray(arr) && arr.bundles)
        arr = arr.bundles;
    const parsed = Stage1ArrZ.safeParse(arr);
    if (!parsed.success)
        return { headlines: [], prompt };
    // Clean trailing stopwords and ensure sentence/Q end
    const cleaned = [];
    for (const h of parsed.data) {
        const kind = /^what|how\b/i.test(h.headline.trim()) ? 'QUESTION' : 'STATEMENT';
        const cl = cleanHeadline(h.headline, kind === 'QUESTION' ? 'QUESTION' : 'STATEMENT');
        if (!cl)
            continue;
        cleaned.push({ id: h.id, angle: h.angle, headline: cl });
    }
    // Enforce quotas in selection order
    const quotas = { QUESTION: 0, PROMISE: 0, HOW_TO: 0, PROOF: 0, PATTERN_BREAK: 0 };
    const needDefault = (n >= 10) ? { QUESTION: 2, PROMISE: 2, HOW_TO: 2, PROOF: 2, PATTERN_BREAK: 2 } : {};
    const need = { ...needDefault, ...(angleQuotas || {}) };
    const buckets = {
        QUESTION: [], PROMISE: [], HOW_TO: [], PROOF: [], PATTERN_BREAK: []
    };
    for (const h of cleaned)
        buckets[h.angle]?.push(h);
    const selected = [];
    // First pass: fill quotas
    Object.keys(buckets).forEach(angle => {
        const want = Math.max(0, need[angle] || 0);
        if (!want)
            return;
        const take = buckets[angle].slice(0, want);
        selected.push(...take);
        quotas[angle] += take.length;
    });
    // Second pass: top up to n with remaining
    if (selected.length < n) {
        const rest = cleaned.filter(h => !selected.find(s => s.id === h.id));
        selected.push(...rest.slice(0, Math.max(0, n - selected.length)));
    }
    return { headlines: selected.slice(0, n), prompt };
}
export async function generateBodiesForHeadline(ctx, enriched, headline, wantCounts, ctaWhitelist) {
    const provider = getProvider();
    const prompt = buildBodiesForHeadlinePrompt(ctx, enriched, headline, wantCounts, ctaWhitelist);
    const out = await provider.generate({ prompt, n: Object.values(wantCounts).reduce((a, b) => a + Math.max(1, b), 0) });
    let obj;
    try {
        obj = JSON.parse(out.text || '{}');
    }
    catch {
        obj = {};
    }
    // Expect roles object
    const roles = {};
    for (const spec of enriched.specs) {
        if (spec.role === 'headline')
            continue;
        const want = Math.max(0, wantCounts[spec.role] || 0);
        const v = obj?.roles?.[spec.role];
        if (want <= 1) {
            const s = Array.isArray(v) ? String(v[0] || '') : String(v || '');
            roles[spec.role] = collapseSpaces(s);
        }
        else {
            let arr = [];
            if (Array.isArray(v))
                arr = v.map((x) => collapseSpaces(String(x))).filter(Boolean);
            else if (v != null)
                arr = [collapseSpaces(String(v))];
            // Ensure exact count, backfill by repeating the last entry
            arr = dedupeKeepOrder(arr);
            if (arr.length > want)
                arr = arr.slice(0, want);
            roles[spec.role] = arr;
        }
    }
    // Post-process: enforce uniqueness per multi-area role, and fill gaps via targeted follow-up
    const missing = [];
    for (const spec of enriched.specs) {
        if (spec.role === 'headline')
            continue;
        const want = Math.max(0, wantCounts[spec.role] || 0);
        if (want <= 1)
            continue;
        let arr = Array.isArray(roles[spec.role]) ? roles[spec.role] : [];
        arr = dedupeKeepOrder(arr);
        roles[spec.role] = arr;
        if (arr.length < want) {
            const bulletLike = /bullet|benefit/i.test(spec.role) || spec.semantics.kind === 'bullets';
            missing.push({ role: spec.role, need: want - arr.length, haveList: arr.slice(), bulletLike });
        }
    }
    if (missing.length) {
        const provider2 = getProvider();
        for (const m of missing) {
            // Targeted prompt per role
            const head = enriched.specs.find(s => s.role === 'headline');
            const s = enriched.specs.find(x => x.role === m.role);
            const budget = s.graphemeBudget;
            const maxLines = s.maxLines;
            const distinctList = m.haveList.length ? `\nDISTINCT FROM (do not repeat): ${JSON.stringify(m.haveList)}` : '';
            const roleHint = s.semantics.kind === 'bullets' ? 'bullet items' : `${m.role}`;
            const promptMissing = `You are a precise copywriter.\nReturn JSON ONLY: { "items": ["..."] }\n\nHEADLINE:\n${headline}\nROLE: ${m.role} (${roleHint})\nCOUNT: ${m.need}\nBUDGET: ≤ ${budget} graphemes; maxLines ${maxLines}.\nRULES:\n- DISTINCT items; 3+ words; end cleanly; no numbers/emojis/hashtags.${distinctList}\n- If headline is a question, answer it directly; avoid generic openings (Explore/Learn/Discover/Check out).\n\nCONTEXT:\n${JSON.stringify(ctx)}\n\nReturn JSON only.`;
            try {
                const outM = await provider2.generate({ prompt: promptMissing, n: m.need });
                let parsed = {};
                try {
                    parsed = JSON.parse(outM.text || '{}');
                }
                catch {
                    parsed = {};
                }
                let items = Array.isArray(parsed?.items) ? parsed.items.map((x) => collapseSpaces(String(x))) : [];
                items = dedupeKeepOrder(items);
                let existing = Array.isArray(roles[m.role]) ? roles[m.role] : [];
                for (const it of items)
                    if (existing.length < (wantCounts[m.role] || 0))
                        existing.push(it);
                existing = dedupeKeepOrder(existing);
                roles[m.role] = existing;
            }
            catch { }
        }
        // Final fill for bullet-like only
        for (const m of missing) {
            const want = wantCounts[m.role] || 0;
            let existing = Array.isArray(roles[m.role]) ? roles[m.role] : [];
            if (existing.length < want) {
                if (m.bulletLike) {
                    while (existing.length < want)
                        existing.push('•');
                    roles[m.role] = existing;
                }
            }
        }
    }
    return { roles, prompt };
}
export function mergeToBundles(headline, roles, theme_id = 'default') {
    const b = {
        id: headline.id,
        angle: headline.angle,
        theme_id,
        roles: { headline: headline.headline, ...roles }
    };
    return [b];
}
