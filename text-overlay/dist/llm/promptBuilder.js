export function buildHeadlineOnlyPrompt(ctx, enriched, n = 14, angleQuotas) {
    const head = enriched.specs.find(s => s.role === 'headline');
    const budget = head ? head.graphemeBudget : 90;
    const maxLines = head ? head.maxLines : 2;
    const quotas = angleQuotas ? `\nANGLE QUOTAS (approx): ${JSON.stringify(angleQuotas)}` : '';
    const enr = ctx?.enriched || {};
    const research = (enr && (enr.benefits || enr.painPoints || enr.keywords)) ? `\nRESEARCH:\n- benefits: ${JSON.stringify(enr.benefits || [])}\n- painPoints: ${JSON.stringify(enr.painPoints || [])}\n- differentiators: ${JSON.stringify(enr.differentiators || [])}\n- audienceSegments: ${JSON.stringify(enr.audienceSegments || [])}\n- keywords: ${JSON.stringify(enr.keywords || [])}` : '';
    return (`You are a senior performance copywriter.
Return JSON ONLY: an array of headlines: [ { "id":"h1", "angle":"QUESTION|PROMISE|HOW_TO|PROOF|PATTERN_BREAK", "headline":"..." } ]

CONTEXT:
${JSON.stringify(ctx)}
${research}

STYLE (STRICT):
- Headlines only. Do not include bodies, bullets, or cta.
- ≤ ${budget} graphemes; maxLines ${maxLines}; Complete thought or clean question; No numbers.
- If question, end with "?". Avoid clichés. Keep mustInclude verbatim: ${JSON.stringify(ctx.mustInclude || [])}. Avoid: ${JSON.stringify(ctx.mustAvoid || [])}.
- Mix angles for variety.${quotas}

COUNT: ${n}
Return JSON ONLY.`);
}
export function buildBodiesForHeadlinePrompt(ctx, enriched, headline, wantCounts, ctaWhitelist) {
    const roleLines = enriched.specs
        .filter(s => s.role !== 'headline')
        .map(s => {
        const count = Math.max(1, wantCounts[s.role] || 0);
        const base = `- ${s.role} [${s.semantics.kind}]: ≤ ${s.graphemeBudget} graphemes, maxLines ${s.maxLines}, count ${count}`;
        const ctas = (s.semantics.kind === "cta" && ctaWhitelist?.length)
            ? `\n    CTA ALLOWED (pick one, verb-first): ${ctaWhitelist.join(" | ")}`
            : '';
        const extras = (s.semantics.kind === 'body')
            ? `\n    Bodies must be DISTINCT, 3+ words, end cleanly, and contain no numbers/emojis/hashtags.\n    If HEADLINE is a question, BODY must directly answer it. Never just "Explore/Learn/Discover <Brand>".`
            : '';
        return base + ctas + extras;
    }).join('\n');
    const enr = ctx?.enriched || {};
    const research = (enr && (enr.benefits || enr.painPoints || enr.keywords)) ? `\nRESEARCH:\n- benefits: ${JSON.stringify(enr.benefits || [])}\n- painPoints: ${JSON.stringify(enr.painPoints || [])}\n- differentiators: ${JSON.stringify(enr.differentiators || [])}\n- audienceSegments: ${JSON.stringify(enr.audienceSegments || [])}\n- keywords: ${JSON.stringify(enr.keywords || [])}` : '';
    return (`You are a senior performance copywriter.
Return JSON ONLY: { "roles": { "<role>": ["..."], "cta": "..." } }

HEADLINE:
${headline}

CONTEXT:
${JSON.stringify(ctx)}
${research}

STYLE & POLICY (STRICT):
- No numbers (digits, dates, percents, prices). Grade ≤ 8. Avoid clichés.
- Use the HEADLINE exactly as provided; do not change it.
- Keep mustInclude tokens verbatim: ${JSON.stringify(ctx.mustInclude || [])}. Avoid: ${JSON.stringify(ctx.mustAvoid || [])}.

ROLE SEMANTICS & BUDGETS (STRICT):
${roleLines}

OUTPUT JSON:
{ "roles": { "body": ["..."], "cta": "..." } }
Return JSON ONLY.`);
}
export function buildLLMPrompt(ctx, enriched, n = 14, opts) {
    const roleLines = enriched.specs.map(s => {
        const base = `- ${s.role} [${s.semantics.kind}]: ≤ ${s.graphemeBudget} graphemes, maxLines ${s.maxLines}, count ${s.count}`;
        const musts = s.semantics.musts?.length ? `\n    must: ${s.semantics.musts.join("; ")}` : "";
        const shoulds = s.semantics.shoulds?.length ? `\n    should: ${s.semantics.shoulds.join("; ")}` : "";
        const forb = s.semantics.forbidden?.length ? `\n    forbid: ${s.semantics.forbidden.join("; ")}` : "";
        const ctas = (s.semantics.kind === "cta" && s.semantics.ctaWhitelist?.length)
            ? `\n    CTA ALLOWED (pick one, verb-first): ${s.semantics.ctaWhitelist.join(" | ")}`
            : "";
        const bodyMin = Math.max(3, opts?.bodyMinWords || 0);
        const variants = (s.role === 'body')
            ? `\n    RETURN MULTIPLE FINISHED SENTENCES for body as an array ordered [short, medium, long].\n    - short: concise, ends cleanly;\n    - medium: one full sentence;\n    - long: two short clauses max.\n    All must be number-free.\n    - Each body must be at least ${bodyMin} words.`
            : '';
        return base + musts + shoulds + forb + ctas + variants;
    }).join("\n");
    const hasMeme = enriched.specs.some(s => String(s.semantics.kind || '').startsWith('meme'));
    const hasReviewInsight = enriched.specs.some(s => /^(review\.|insight\.)/.test(String(s.semantics.kind || '')));
    const memeRules = hasMeme ? `\nMEME RULES:\n- meme.negative: Relatable pain; do not include the solution; single line; 5–11 words; no numbers/emojis/hashtags.\n- meme.positive: Solution/answer to the pain; single line; 4–10 words; no numbers/emojis/hashtags.\n- meme.oneliner: Pain + twist/solution in one sentence; single line; 5–12 words; no numbers/emojis/hashtags.` : '';
    const reviewInsightRules = hasReviewInsight ? `\nREVIEWS & INSIGHTS RULES:\n- review.quote: Testimonial line(s); 1–2 lines; ≤ 90 graphemes; no numbers/emojis/price.\n- review.attribution: "— Name, Title/Company"; single line; ≤ 40 graphemes; no numerals.\n- insight.fact: Neutral industry fact; no numbers; ≤ 110 graphemes.\n- insight.takeaway: Actionable implication; ≤ 90 graphemes; no numbers.` : '';
    const enr = ctx?.enriched || {};
    const research = (enr && (enr.benefits || enr.painPoints || enr.keywords)) ? `\nRESEARCH:\n- benefits: ${JSON.stringify(enr.benefits || [])}\n- painPoints: ${JSON.stringify(enr.painPoints || [])}\n- differentiators: ${JSON.stringify(enr.differentiators || [])}\n- audienceSegments: ${JSON.stringify(enr.audienceSegments || [])}\n- keywords: ${JSON.stringify(enr.keywords || [])}` : '';
    return (`You are a senior performance copywriter.
Return JSON ONLY: an array "bundles". Follow the role semantics and budgets exactly.

CONTEXT:
${JSON.stringify(ctx)}
${research}

STYLE & POLICY (STRICT):
${opts?.lockHeadline ? `- Use EXACT headline (do not change): ${opts.lockHeadline}` : ''}
- Audience & perspective: Write as the brand speaking to its end customer (${ctx.persona || 'customer'}). Never address marketers or teams.
- Avoid B2B phrasing like "grow your business", "unlock your [industry] potential", "your team", "your brand".
- Prefer second person to the customer ("you") or neutral statements about the offer/place. Do NOT say "your restaurant" when the advertiser IS the restaurant.
- No numbers (no digits, dates, percents, prices, "24/7", or number words).
- Complete sentences or clean fragments that end on a meaningful content word. Never end on: a, an, the, your, our, their, to, of, for, with, in, on, at, by, and, or.
- Questions must end with "?". Grade ≤ 8. No emojis/hashtags. Avoid clichés.
- Keep mustInclude tokens verbatim: ${JSON.stringify(ctx.mustInclude || [])}. Avoid: ${JSON.stringify(ctx.mustAvoid || [])}.

ROLE SEMANTICS & BUDGETS:
${roleLines}
${memeRules}
${reviewInsightRules}

COHERENCE (IMPORTANT):
- "${enriched.scoringRole}" sets the theme. If it is a QUESTION, body/subhead must answer it directly.
- "body" must name a mechanism or benefit that logically follows the headline.
- "body" must repeat at least one non-function keyword from the headline (e.g., brand, layout, guardrails, template, ship).
- "cta" must be chosen from the allowed set for CTA roles and match the experience (product.type).
- "meme.negative" is a one-line relatable frustration; mild sarcasm ok; never target groups.

VARIETY:
- Mix angles across: QUESTION, PROMISE, PROBLEM_SOLUTION, HOW_TO, PROOF, PATTERN_BREAK.
- Avoid repeating the same three-word openings across bundles.

OUTPUT JSON:
[ { "id":"b1", "angle":"QUESTION", "theme_id":"self-writing-ads", "roles": { "<role>": "...", "<roleN>": ["...","..."] } } ]

COUNT: ${n}
Return JSON ONLY — no prose, no code fences.`);
}
