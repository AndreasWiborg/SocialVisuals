import { z } from 'zod';
export const SocialPackZ = z.object({
    twitter: z.object({
        caption: z.string().max(220),
        hashtags: z.array(z.string()).default([])
    }),
    instagram: z.object({
        caption: z.string().max(220),
        hashtags: z.array(z.string()).default([])
    }),
    linkedin: z.object({
        caption: z.string().max(220)
    }),
    altText: z.string().max(220)
});
// Small reusable prompt builder for tests and the API
export function buildSocialPrompt(bundle, ctx) {
    const locale = (ctx?.locale || 'en-US');
    const input = {
        bundle,
        ctx: {
            product: ctx?.product,
            audience: ctx?.audience,
            tone: ctx?.tone,
            brandVoice: ctx?.brandVoice,
            locale
        }
    };
    // The model must return JSON only in the required shape.
    return `You are a social media copywriter. Return JSON ONLY for a social pack.\n\nINPUT (JSON):\n${JSON.stringify(input, null, 2)}\n\nCONSTRAINTS (STRICT):\n- No numbers (no digits, dates, percents, prices, or number words).\n- Captions must be \u2264 220 characters.\n- Locale-aware: ${locale}.\n- Keep brand voice and tone from input.\n- Twitter and Instagram add short relevant hashtags (lowercase).\n- Provide concise descriptive alt text for the image.\n\nRETURN JSON ONLY IN THIS SHAPE:\n{\n  "twitter": {"caption": "...", "hashtags": ["#..."]},\n  "instagram": {"caption": "...", "hashtags": ["#..."]},\n  "linkedin": {"caption": "..."},\n  "altText": "..."\n}`;
}
// Additional validation helpers
const noDigitRe = /[0-9]/;
export function validateSocialPack(pack) {
    const parsed = SocialPackZ.safeParse(pack);
    if (!parsed.success) {
        return { ok: false, errors: parsed.error.issues.map(i => i.message) };
    }
    const errs = [];
    const { twitter, instagram, linkedin, altText } = parsed.data;
    if (noDigitRe.test(twitter.caption))
        errs.push('twitter.caption must not contain numbers');
    if (noDigitRe.test(instagram.caption))
        errs.push('instagram.caption must not contain numbers');
    if (noDigitRe.test(linkedin.caption))
        errs.push('linkedin.caption must not contain numbers');
    if (noDigitRe.test(altText))
        errs.push('altText must not contain numbers');
    for (const tag of twitter.hashtags || [])
        if (noDigitRe.test(tag))
            errs.push('twitter.hashtags must not contain numbers');
    for (const tag of instagram.hashtags || [])
        if (noDigitRe.test(tag))
            errs.push('instagram.hashtags must not contain numbers');
    if (twitter.caption.length > 220)
        errs.push('twitter.caption too long');
    if (instagram.caption.length > 220)
        errs.push('instagram.caption too long');
    if (linkedin.caption.length > 220)
        errs.push('linkedin.caption too long');
    if (altText.length > 220)
        errs.push('altText too long');
    if (errs.length)
        return { ok: false, errors: errs };
    return { ok: true, pack: parsed.data };
}
