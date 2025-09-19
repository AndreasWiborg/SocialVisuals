import { fitText } from "../layout/fitText.js";
import { loadProfile } from "../config/profiles.js";
import { fitGroupUniformFont, groupAreasForBullets } from "../layout/groupFit.js";
import { renderText } from "../render.js";
function areasForRole(tpl, role) {
    const ids = (tpl.priority || []).filter(id => (tpl.areas.find(a => a.id === id)?.role) === role);
    const rest = tpl.areas.filter(a => a.role === role && !ids.includes(a.id)).map(a => a.id);
    const orderedIds = [...ids, ...rest];
    return orderedIds.map(id => tpl.areas.find(a => a.id === id)).filter(Boolean);
}
function isSingleAreaBullets(tpl, role) {
    return role === 'bullets' && tpl.areas.filter(a => a.role === 'bullets').length === 1;
}
export async function renderBundle(tpl, bundle, bgPath, outPath, fontFallback, brandColors, locale, preferFontOverride) {
    const profile = loadProfile();
    const fontFor = (area) => {
        if (preferFontOverride && fontFallback)
            return fontFallback;
        return tpl.fonts?.[area.role]?.family || tpl.fonts?.body?.family || fontFallback || 'Arial';
    };
    // 1) Headline (must fit)
    const hAreas = areasForRole(tpl, "headline");
    const hArea = hAreas[0] || tpl.areas[0];
    const headline = String(bundle.roles["headline"] || "");
    const baseLH = hArea.constraints.lineHeight.value || 1.1;
    const lhScanSingle = [baseLH, Math.max(profile.singleLine?.minLH ?? 0.94, +(baseLH - 0.06).toFixed(2))];
    // Optional headline transforms from profile (uppercase, weight)
    const headProfile = profile?.fonts || {};
    const headlineText = headProfile.headlineUppercase ? String(headline || '').toUpperCase() : String(headline || '');
    const hrep = await fitText(headlineText, hArea, fontFor(hArea), tpl.pixelSize?.w, {
        locale,
        lineHeightScan: lhScanSingle,
        softOpticalCapMultiplier: profile.singleLine?.softOpticalCapMultiplierHeadline ?? 1.20,
        trackingRange: { min: profile.fonts?.maxNegTracking ?? -0.25, max: profile.fonts?.minTracking ?? 0.10, step: 0.05 },
        fontWeight: (headProfile.headlineWeight || 'normal')
    });
    if (!hrep.fits)
        throw new Error("headline does not fit");
    // 2) Collect all non-headline text renders (bodies + bullets)
    const items = [];
    // 2a) Bullets role handling
    const bulletsAreas = areasForRole(tpl, 'bullets');
    const bulletsVal = Array.isArray(bundle.roles['bullets']) ? bundle.roles['bullets'] : (bundle.roles['bullets'] ? [String(bundle.roles['bullets'])] : []);
    if (bulletsAreas.length) {
        if (isSingleAreaBullets(tpl, 'bullets') && bulletsVal.length > 1) {
            const area = bulletsAreas[0];
            const Lmax = (typeof area.constraints.maxLines === 'number') ? area.constraints.maxLines : area.constraints.maxLines.max;
            const joined = bulletsVal.map(x => `• ${x}`).join('\n');
            const rep = await fitText(joined, area, fontFor(area), tpl.pixelSize?.w, { locale });
            if (!rep.fits) {
                const { w, h } = area.shape;
                const maxLines = Lmax;
                throw new Error(`role bullets: cannot stack ${bulletsVal.length} items in single area id=${area.id} (maxLines=${maxLines}, w=${w}, h=${h})`);
            }
            items.push({ areaId: area.id, rep, text: joined });
        }
        else if (bulletsAreas.length >= 2 && bulletsVal.length) {
            // Parallel bullets: group fit
            const groups = groupAreasForBullets(tpl).filter(g => g[0].role === 'bullets');
            const groupFont = tpl.fonts?.bullets?.family || tpl.fonts?.body?.family || fontFallback;
            for (const g of groups) {
                const texts = g.map((_, i) => String(bulletsVal[i] || bulletsVal[bulletsVal.length - 1] || ''));
                const gf = await fitGroupUniformFont(g, texts, groupFont, locale);
                if (!gf.fontPx || gf.reports.some(r => !r.fits)) {
                    throw new Error(`role bullets: cannot fit ${texts.length} items across ${g.length} areas`);
                }
                g.forEach((a, j) => items.push({ areaId: a.id, rep: gf.reports[j], text: texts[j] }));
            }
            // Any leftover 'bullets' area beyond grouped set, fit individually
            for (let i = 0; i < bulletsAreas.length; i++) {
                const a = bulletsAreas[i];
                if (items.find(x => x.areaId === a.id))
                    continue;
                const t = String(bulletsVal[i] || bulletsVal[0] || '');
                const rep = await fitText(t, a, fontFor(a), tpl.pixelSize?.w, { locale });
                if (!rep.fits)
                    throw new Error(`bullets item #${i + 1} does not fit`);
                items.push({ areaId: a.id, rep, text: t });
            }
        }
        else if (bulletsVal.length) {
            // Single bullet text
            const a = bulletsAreas[0];
            const t = String(bulletsVal[0]);
            const rep = await fitText(t, a, fontFor(a), tpl.pixelSize?.w, { locale });
            if (!rep.fits)
                throw new Error(`bullets does not fit`);
            items.push({ areaId: a.id, rep, text: t });
        }
    }
    // 2b) Bodies (legacy benefits/features + other bodies)
    const bAreas = areasForRole(tpl, "body");
    const bodies = Array.isArray(bundle.roles["body"]) ? bundle.roles["body"] : (bundle.roles["body"] ? [String(bundle.roles["body"])] : []);
    if (bAreas.length && bodies.length) {
        const groups = groupAreasForBullets(tpl).filter(g => g[0].role !== 'bullets');
        // Legacy bullet groups (BENEFIT_/FEATURE_/BULLET_)
        for (const g of groups) {
            const idxs = g.map(a => bAreas.findIndex(x => x.id === a.id)).filter(i => i >= 0);
            if (idxs.length >= 2) {
                const as = idxs.map(i => bAreas[i]);
                const ts = idxs.map(i => bodies[i]).filter(Boolean);
                if (ts.length) {
                    const groupFont = tpl.fonts?.body?.family || fontFallback;
                    const gf = await fitGroupUniformFont(as, ts, groupFont, locale);
                    if (!gf.fontPx || gf.reports.some(r => !r.fits)) {
                        throw new Error(`role bullets: cannot fit ${ts.length} items across ${as.length} areas`);
                    }
                    as.forEach((a, j) => items.push({ areaId: a.id, rep: gf.reports[j], text: ts[j] }));
                }
            }
        }
        // Remaining non-bullet bodies individually
        for (let i = 0; i < Math.min(bAreas.length, bodies.length); i++) {
            const area = bAreas[i];
            if (items.find(x => x.areaId === area.id))
                continue; // already filled by group-fit
            const isSub = /HEADLINE[_-]?SUB/i.test(String(area.id || ''));
            const up = isSub ? !!profile?.fonts?.subheadlineUppercase : !!profile?.fonts?.bodyUppercase;
            const wt = isSub ? (profile?.fonts?.subheadlineWeight || 'normal') : (profile?.fonts?.bodyWeight || 'normal');
            const text = up ? String(bodies[i]).toUpperCase() : bodies[i];
            const singleLine = (typeof area.constraints.maxLines === 'number' ? area.constraints.maxLines : area.constraints.maxLines.max) === 1;
            const rep = await fitText(text, area, fontFor(area), tpl.pixelSize?.w, singleLine ? {
                locale,
                lineHeightScan: [(area.constraints.lineHeight.value || 1.1), Math.max(profile.singleLine?.minLH ?? 0.94, +(area.constraints.lineHeight.value || 1.1) - 0.06)],
                softOpticalCapMultiplier: profile.singleLine?.softOpticalCapMultiplierBody ?? 1.10,
                trackingRange: { min: profile.fonts?.maxNegTracking ?? -0.25, max: profile.fonts?.minTracking ?? 0.10, step: 0.05 },
                fontWeight: wt
            } : { locale, fontWeight: wt });
            if (!rep.fits) {
                // Fallback: skip this body item rather than failing the whole render
                // Optional future: if this area looks like a CTA slot, we could try render as CTA
                try { console.warn(`renderBundle: skipping non-fitting body #${i + 1} in area ${area.id}`); } catch {}
                continue;
            }
            items.push({ areaId: area.id, rep, text });
        }
    }
    // 2c) Meme roles
    const memeRoles = ['meme.negative', 'meme.positive', 'meme.oneliner'];
    for (const mr of memeRoles) {
        const aList = areasForRole(tpl, mr);
        if (!aList.length)
            continue;
        const raw = bundle.roles[mr];
        if (raw == null)
            continue;
        const texts = Array.isArray(raw) ? raw : [String(raw)];
        for (let i = 0; i < aList.length; i++) {
            const a = aList[i];
            const t = String(texts[i] ?? texts[0] ?? '');
            const rep = await fitText(t, a, fontFor(a), tpl.pixelSize?.w, { locale });
            if (!rep.fits)
                throw new Error(`${mr} does not fit`);
            items.push({ areaId: a.id, rep, text: t });
        }
    }
    // 3) CTA (first only)
    const cAreas = areasForRole(tpl, "cta");
    const cta = String(bundle.roles["cta"] || "");
    let cFit = null;
    if (cta && cAreas.length) {
        const area = cAreas[0];
        const upC = !!profile?.fonts?.ctaUppercase;
        const wtC = (profile?.fonts?.ctaWeight || 'normal');
        const cText = upC ? String(cta).toUpperCase() : String(cta);
        const rep = await fitText(cText, area, fontFallback, tpl.pixelSize?.w, { locale, fontWeight: wtC });
        if (!rep.fits)
            throw new Error("cta does not fit");
        cFit = { areaId: area.id, rep, text: cText };
    }
    // 4) Compose sequentially
    let current = bgPath;
    const font = fontFallback;
    const brand = brandColors;
    // headline
    const hMeta = await renderText(current, outPath, hArea, headlineText, fontFor(hArea), hrep, brand, { fontWeight: (headProfile.headlineWeight || 'normal'), color: (headProfile.headlineColor || undefined) });
    current = outPath;
    // sort items by template area order, then render
    items.sort((a, b) => tpl.areas.findIndex(x => x.id === a.areaId) - tpl.areas.findIndex(x => x.id === b.areaId));
    for (const bf of items) {
        const area = tpl.areas.find(a => a.id === bf.areaId);
        const isSub = /HEADLINE[_-]?SUB/i.test(String(area?.id || ''));
        const wt = isSub ? (profile?.fonts?.subheadlineWeight || 'normal') : (profile?.fonts?.bodyWeight || 'normal');
        const col = isSub ? (profile?.fonts?.subheadlineColor || undefined) : (profile?.fonts?.bodyColor || undefined);
        await renderText(current, outPath, area, bf.text, fontFor(area), bf.rep, brand, { fontWeight: wt, color: col });
        current = outPath;
    }
    // cta
    if (cFit) {
        const area = tpl.areas.find(a => a.id === cFit.areaId);
        await renderText(current, outPath, area, cFit.text, fontFor(area), cFit.rep, brand, { fontWeight: (profile?.fonts?.ctaWeight || 'normal'), color: (profile?.fonts?.ctaColor || undefined) });
        current = outPath;
    }
    const bodiesCount = items.filter(it => (tpl.areas.find(a => a.id === it.areaId)?.role) === 'body').length;
    return { outPath: current, headlineMeta: hMeta, bodies: bodiesCount, cta: !!cFit };
}
