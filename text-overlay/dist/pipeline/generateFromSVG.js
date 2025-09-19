import path from 'path';
import { promises as fs } from 'fs';
import sharp from 'sharp';
import { deriveRoleSchema } from '../roles.js';
import { enrichSchema } from '../roleSemantics.js';
import { buildLLMPrompt } from '../llm/promptBuilder.js';
import { validateAndClean } from '../llm/ingest.js';
import { fitBundleAllRoles, pickTopBundleByAggregate } from '../rankerBundle.js';
import { renderBundle } from './renderBundle.js';
import { appendItem } from '../runs/recorder.js';
import { getProvider } from '../llm/providers/index.js';
import { generateBundlesLocal } from '../generateLocal.js';
async function processSVGTemplate(opts) {
    // Read SVG file
    let svgContent = await fs.readFile(opts.svgPath, 'utf-8');
    // Replace color placeholders
    if (opts.brandColors) {
        for (const [placeholder, color] of Object.entries(opts.brandColors)) {
            const regex = new RegExp(placeholder, 'g');
            svgContent = svgContent.replace(regex, color);
        }
    }
    // Replace image placeholders with base64 encoded images
    if (opts.logo) {
        const logoData = await fs.readFile(opts.logo);
        const logoBase64 = `data:image/${path.extname(opts.logo).slice(1)};base64,${logoData.toString('base64')}`;
        svgContent = svgContent.replace(/PLACE_LOGO_HERE/g, logoBase64);
    }
    if (opts.productImage) {
        const productData = await fs.readFile(opts.productImage);
        const productBase64 = `data:image/${path.extname(opts.productImage).slice(1)};base64,${productData.toString('base64')}`;
        svgContent = svgContent.replace(/PLACE_PRODUCT_IMAGE_HERE/g, productBase64);
    }
    // Replace any custom placeholders
    if (opts.placeholderMappings) {
        for (const [placeholder, value] of Object.entries(opts.placeholderMappings)) {
            svgContent = svgContent.replace(new RegExp(placeholder, 'g'), value);
        }
    }
    // Convert file:/// references to base64
    // More robust pattern that captures file URLs until quotes
    const fileRefPattern = /file:\/\/\/[^"']+/g;
    const fileRefs = svgContent.match(fileRefPattern) || [];
    for (const fileRef of fileRefs) {
        try {
            let filePath = fileRef.replace('file:///', '/');
            // Handle different encoding scenarios
            if (filePath.includes('%20')) {
                // URL encoded
                filePath = decodeURIComponent(filePath);
            }
            else if (!filePath.includes(' ') && filePath.includes('Mood')) {
                // Space might have been truncated - reconstruct the path
                // This is specific to the "Mood Tracking App" directory
                const parts = filePath.split('/');
                for (let i = 0; i < parts.length; i++) {
                    if (parts[i] === 'Mood' && i + 1 < parts.length && parts[i + 1] !== 'Tracking') {
                        parts[i] = 'Mood Tracking App';
                        // Remove the next two parts that would be 'Tracking' and 'App'
                        parts.splice(i + 1, 2);
                        break;
                    }
                }
                filePath = parts.join('/');
            }
            const fileData = await fs.readFile(filePath);
            const ext = path.extname(filePath).slice(1);
            const base64Data = `data:image/${ext};base64,${fileData.toString('base64')}`;
            svgContent = svgContent.replace(fileRef, base64Data);
        }
        catch (e) {
            // Try without processing if direct read fails
            try {
                const simplePath = fileRef.replace('file:///', '/');
                const fileData = await fs.readFile(simplePath);
                const ext = path.extname(simplePath).slice(1);
                const base64Data = `data:image/${ext};base64,${fileData.toString('base64')}`;
                svgContent = svgContent.replace(fileRef, base64Data);
            }
            catch (e2) {
                console.warn(`Failed to process file reference: ${fileRef}`);
                // Continue processing - non-critical images will be skipped
            }
        }
    }
    // Convert SVG to PNG using Sharp
    const pngBuffer = await sharp(Buffer.from(svgContent))
        .png()
        .toBuffer();
    // Save temporary PNG file
    const tempPath = path.join(process.cwd(), `temp-svg-${Date.now()}.png`);
    await fs.writeFile(tempPath, pngBuffer);
    return { pngBuffer, pngPath: tempPath };
}
export async function generateFromSVG(opts) {
    const { tpl, ctx, svgPath } = opts;
    const n = opts.n ?? 16;
    const font = opts.fontFamily || tpl.fonts?.headline?.family || 'Arial';
    // Process SVG to generate base PNG
    const { pngPath } = await processSVGTemplate({
        svgPath,
        brandColors: opts.brandColors,
        logo: opts.logo,
        productImage: opts.productImage,
        placeholderMappings: opts.placeholderMappings,
    });
    try {
        const schema = deriveRoleSchema(tpl);
        const enriched = enrichSchema(tpl, schema, ctx);
        let bundles;
        let vres;
        let prompt;
        if (opts.useLocal) {
            // Use local generation
            const wl = (enriched.specs.find((s) => s.kind === 'cta')?.semantics?.ctaWhitelist || []);
            bundles = await generateBundlesLocal(ctx, schema, n, { ctaWhitelist: wl });
            vres = validateAndClean(bundles, schema, enriched);
        }
        else {
            // Use LLM generation
            prompt = buildLLMPrompt(ctx, enriched, n);
            const provider = getProvider();
            const out = await provider.generate({ prompt, n });
            let rawBundles = [];
            try {
                rawBundles = JSON.parse(out.text || '[]');
            }
            catch {
                rawBundles = [];
            }
            if (rawBundles && rawBundles.bundles)
                rawBundles = rawBundles.bundles;
            vres = validateAndClean(rawBundles, schema, enriched);
            bundles = vres.bundles || [];
        }
        if (!vres.ok) {
            // Clean up temp file
            try {
                await fs.unlink(pngPath);
            }
            catch { }
            return { ok: false, errors: vres.errors, warnings: vres.warnings, prompt };
        }
        // Fit all roles per bundle and pick top via aggregate policy
        const fitResults = [];
        for (const b of bundles) {
            fitResults.push(await fitBundleAllRoles(tpl, b, font, ctx?.locale));
        }
        const best = pickTopBundleByAggregate(fitResults, vres.scores);
        const winnerId = best?.bundleId || bundles[0]?.id;
        const winner = bundles.find(b => b.id === winnerId) || bundles[0];
        const outPath = opts.outDir
            ? path.join(opts.outDir, opts.outFileName || `out_svg_${tpl.templateId}_${Date.now()}.png`)
            : `./out_svg_${tpl.templateId}_${Date.now()}.png`;
        // Apply text overlay to the processed PNG
        const meta = await renderBundle(tpl, winner, pngPath, outPath, font, opts.textColors, ctx?.locale);
        // Clean up temp file
        try {
            await fs.unlink(pngPath);
        }
        catch { }
        if (opts.outDir) {
            try {
                const ctxSummary = { product: ctx?.product, audience: ctx?.audience, tone: ctx?.tone, brandVoice: ctx?.brandVoice, locale: ctx?.locale, brandId: ctx?.brandId };
                await appendItem(opts.outDir, {
                    templateId: tpl.templateId,
                    bgPath: svgPath, // Use bgPath instead of svgPath for compatibility
                    outPath,
                    chosenBundleId: winner.id,
                    angle: winner.angle,
                    meta,
                    ctxSummary,
                    rolesUsed: best?.texts || winner?.roles || {},
                    perRoleFit: best?.fits || {},
                    brandId: ctx?.brandId
                });
            }
            catch { }
        }
        const policy = { coherence: vres.scores?.[winnerId]?.coherence ?? 0, ctaOk: !!(vres.scores?.[winnerId]?.ctaOk ?? true) };
        const rolesUsed = best?.texts || {};
        const perRoleFit = best?.fits || {};
        return {
            ok: true,
            outPath,
            url: `/file?p=${encodeURIComponent(outPath)}`,
            meta,
            prompt,
            warnings: vres.warnings ?? [],
            winnerId: winner.id,
            policy,
            rolesUsed,
            perRoleFit
        };
    }
    catch (error) {
        // Clean up temp file on error
        try {
            await fs.unlink(pngPath);
        }
        catch { }
        throw error;
    }
}
