import path from 'path';
import { promises as fs } from 'fs';
import sharp from 'sharp';
import https from 'https';
import http from 'http';
import { PlaceholderResolver, replacePlaceholdersInSVG } from '../services/placeholder-resolver.js';
function decodeFileUrlOrPath(val) {
    if (!val)
        return null;
    if (val.startsWith('data:'))
        return val; // already data URI
    if (val.startsWith('/file?p=')) {
        const q = val.substring('/file?p='.length);
        try {
            return decodeURIComponent(q);
        }
        catch {
            return q;
        }
    }
    if (val.startsWith('file:///')) {
        try {
            return decodeURIComponent(val.replace('file:///', '/'));
        }
        catch {
            return val.replace('file:///', '/');
        }
    }
    return val;
}
async function fileToDataUri(absPath) {
    const ext = (path.extname(absPath).slice(1) || 'png').toLowerCase();
    const buf = await fs.readFile(absPath);
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
        : ext === 'png' ? 'image/png'
            : ext === 'webp' ? 'image/webp'
                : ext === 'gif' ? 'image/gif'
                    : `image/${ext}`;
    return `data:${mime};base64,${buf.toString('base64')}`;
}
export async function composeFromSVG(opts) {
    let svg = await fs.readFile(opts.svgPath, 'utf-8');
    // Apply placeholder resolution (colors and image token replacement)
    const resolver = new PlaceholderResolver(opts.mapping);
    svg = replacePlaceholdersInSVG(svg, resolver);
    try {
        console.log(`[compose] Template: ${opts.svgPath}`);
    }
    catch { }
    // Smart-zoom config (products only)
    const SMART_ZOOM_PRODUCTS = (process.env.SMART_ZOOM_PRODUCTS ?? '1') !== '0';
    const AR_TOL = parseFloat(process.env.SMART_ZOOM_AR_TOLERANCE ?? '0.05');
    const MAX_UPSCALE = parseFloat(process.env.SMART_ZOOM_MAX_UPSCALE ?? '2.2');
    const PAD_INSET = parseFloat(process.env.SMART_ZOOM_PADDING ?? '0.07');
    const BLUR_RADIUS = parseFloat(process.env.SMART_ZOOM_BLUR ?? '24');
    const DARKEN = parseFloat(process.env.SMART_ZOOM_DARKEN ?? '0.12');
    // Strict mode: only touch PLACE_* and COLOR_* tokens, never static assets
    // Convert any file references or upload URLs to data URIs
    // Handles href or xlink:href with optional whitespace and either quote style
    const hrefRegex = /(xlink:href|href)\s*=\s*(["'])(.*?)\2/gi;
    // Simple per-call cache for remote asset inlining
    const remoteCache = new Map();
    // Pre-inline mapping-provided http(s) URLs wherever they appear in the SVG text
    try {
        const imgs = resolver?.mapping?.images || {};
        const urls = [];
        if (imgs.logo)
            urls.push(imgs.logo);
        for (const u of (imgs.products || []))
            if (u)
                urls.push(u);
        for (const u of (imgs.screenshots || []))
            if (u)
                urls.push(u);
        for (const u of (imgs.backgrounds || []))
            if (u)
                urls.push(u);
        const uniq = Array.from(new Set(urls.filter(u => /^https?:\/\//i.test(String(u)))));
        for (const u of uniq) {
            try {
                const { buffer: buf, contentType } = await fetchBuffer(u);
                let ct = (contentType || '').toLowerCase();
                if (!ct || !/^image\//.test(ct)) {
                    const ext = (u.split('?')[0].split('#')[0].split('.').pop() || '').toLowerCase();
                    if (ext === 'jpg' || ext === 'jpeg')
                        ct = 'image/jpeg';
                    else if (ext === 'webp')
                        ct = 'image/webp';
                    else if (ext === 'gif')
                        ct = 'image/gif';
                    else
                        ct = 'image/png';
                }
                const dataUri = `data:${ct};base64,${buf.toString('base64')}`;
                const replaced = svg.split(u).join(dataUri);
                if (replaced !== svg) {
                    svg = replaced;
                    try {
                        console.log(`[compose] pre-inlined mapping URL ${u} -> data URI (${ct}, ${buf.length}b)`);
                    }
                    catch { }
                }
            }
            catch (e) {
                try {
                    console.warn('[compose] pre-inline failed', u, String(e?.message || e));
                }
                catch { }
            }
        }
    }
    catch { }

    async function fetchBuffer(url) {
        return new Promise((resolve, reject) => {
            try {
                const mod = url.startsWith('https') ? https : http;
                const req = mod.get(url, { timeout: 12000 }, (res) => {
                    if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                        // Follow simple redirects
                        fetchBuffer(res.headers.location).then(resolve, reject);
                        res.resume();
                        return;
                    }
                    if (res.statusCode !== 200) {
                        reject(new Error(`HTTP ${res.statusCode}`));
                        res.resume();
                        return;
                    }
                    const chunks = [];
                    res.on('data', (d) => chunks.push(d));
                    res.on('end', () => {
                        const buf = Buffer.concat(chunks);
                        const ct = String(res.headers['content-type'] || '').toLowerCase();
                        resolve({ buffer: buf, contentType: ct });
                    });
                });
                req.on('error', reject);
                req.on('timeout', () => { try { req.destroy(new Error('timeout')) } catch {} });
            }
            catch (e) {
                reject(e);
            }
        });
    }
    const seen = [];
    // Prepare product list for detection
    const productList = ((opts?.mapping?.images?.products) || []).filter(Boolean).map((u) => decodeFileUrlOrPath(u));
    const productSrcSet = new Set(productList);
    function getImageBoxAt(svgStr, matchIndex) {
        try {
            const upto = svgStr.slice(0, matchIndex);
            const tagStart = upto.lastIndexOf('<image');
            if (tagStart === -1)
                return null;
            const tagEnd = svgStr.indexOf('>', matchIndex);
            if (tagEnd === -1)
                return null;
            const tag = svgStr.slice(tagStart, tagEnd + 1);
            const w = parseFloat((tag.match(/\bwidth\s*=\s*['\"](\d+(?:\.\d+)?)['\"]/i)?.[1]) || '0');
            const h = parseFloat((tag.match(/\bheight\s*=\s*['\"](\d+(?:\.\d+)?)['\"]/i)?.[1]) || '0');
            return (w > 0 && h > 0) ? { width: w, height: h } : null;
        }
        catch {
            return null;
        }
    }
    async function smartProductDataURI(absPath, boxW, boxH) {
        try {
            const meta = await sharp(absPath).metadata();
            const iw = meta.width ?? 0;
            const ih = meta.height ?? 0;
            if (!iw || !ih)
                return await fileToDataUri(absPath);
            const arImg = iw / ih;
            const arBox = boxW / boxH;
            const arDelta = Math.abs(arImg / arBox - 1);
            if (arDelta <= AR_TOL) {
                return await fileToDataUri(absPath);
            }
            const TW = Math.max(200, Math.min(2000, Math.round(boxW)));
            const TH = Math.max(200, Math.min(2000, Math.round(boxH)));
            const coverScale = Math.max(TW / iw, TH / ih);
            if (coverScale <= MAX_UPSCALE) {
                const buf = await sharp(absPath)
                    .resize(TW, TH, { fit: 'cover', position: 'attention' })
                    .png({ compressionLevel: 6 })
                    .toBuffer();
                return `data:image/png;base64,${buf.toString('base64')}`;
            }
            const pad = Math.max(0, Math.min(0.2, PAD_INSET));
            const innerW = Math.max(1, Math.round(TW * (1 - pad)));
            const innerH = Math.max(1, Math.round(TH * (1 - pad)));
            const bg = await sharp(absPath)
                .resize(TW, TH, { fit: 'cover', position: 'attention' })
                .blur(BLUR_RADIUS)
                .modulate({ brightness: 1 - (isNaN(DARKEN) ? 0.12 : DARKEN), saturation: 0.94 })
                .png({ compressionLevel: 6 })
                .toBuffer();
            const fg = await sharp(absPath)
                .resize(innerW, innerH, { fit: 'contain', withoutEnlargement: false, background: { r: 0, g: 0, b: 0, alpha: 0 } })
                .png({ compressionLevel: 6 })
                .toBuffer();
            const composited = await sharp({ create: { width: TW, height: TH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
                .composite([
                { input: bg, gravity: 'center' },
                { input: fg, gravity: 'center' }
            ])
                .png({ compressionLevel: 6 })
                .toBuffer();
            return `data:image/png;base64,${composited.toString('base64')}`;
        }
        catch {
            return await fileToDataUri(absPath);
        }
    }
    svg = await replaceAsync(svg, hrefRegex, async (_m, attr, q, url, idx) => {
        const decoded = decodeFileUrlOrPath(url);
        if (!decoded)
            return _m;
        if (decoded.startsWith('data:'))
            return _m; // already inlined
        // Inline remote http(s) images by downloading and converting to data URI
        if (/^https?:\/\//i.test(decoded)) {
            try {
                if (remoteCache.has(decoded)) {
                    const cached = remoteCache.get(decoded);
                    return `${attr}=${q}${cached}${q}`;
                }
                const { buffer: buf, contentType } = await fetchBuffer(decoded);
                // Try to use content-type header; fallback to extension/png
                let ct = (contentType || '').toLowerCase();
                if (!ct || !/^image\//.test(ct)) {
                    // heuristic from URL extension
                    const ext = (decoded.split('?')[0].split('#')[0].split('.').pop() || '').toLowerCase();
                    if (ext === 'jpg' || ext === 'jpeg') ct = 'image/jpeg';
                    else if (ext === 'webp') ct = 'image/webp';
                    else if (ext === 'gif') ct = 'image/gif';
                    else ct = 'image/png';
                }
                const dataUri = `data:${ct};base64,${buf.toString('base64')}`;
                remoteCache.set(decoded, dataUri);
                try { console.log(`[compose] inline ${attr} ${decoded} -> (remote ${ct}, ${buf.length}b)`); } catch {}
                return `${attr}=${q}${dataUri}${q}`;
            }
            catch {
                return _m; // leave untouched on error
            }
        }
        try {
            let dataUri;
            const isProduct = SMART_ZOOM_PRODUCTS && productSrcSet.has(decodeFileUrlOrPath(url));
            if (isProduct) {
                const box = getImageBoxAt(svg, idx);
                if (box) {
                    dataUri = await smartProductDataURI(decoded, box.width, box.height);
                }
            }
            if (!dataUri) {
                dataUri = await fileToDataUri(decoded);
            }
            seen.push(decoded);
            try {
                console.log(`[compose] inline ${attr} ${url} -> file://${decoded}`);
            }
            catch { }
            return `${attr}=${q}${dataUri}${q}`;
        }
        catch {
            return _m; // leave untouched
        }
    });
    // Note: avoid replacing arbitrary bare URLs, as some appear in XML namespaces
    // Also inline any bare /file?p=... occurrences outside of href attrs
    const fileRouteRegex = /(\/file\?p=)([^"'\s)<>]+)/g;
    svg = await replaceAsync(svg, fileRouteRegex, async (_m, prefix, enc) => {
        try {
            const decoded = decodeURIComponent(enc);
            const dataUri = await fileToDataUri(decoded);
            return dataUri;
        }
        catch {
            return _m; // leave as-is if inline fails
        }
    });
    // Normalize any non-standard data URI mime labels (e.g., image/jpg -> image/jpeg)
    try {
        svg = svg.replace(/data:image\/jpg;/gi, 'data:image/jpeg;');
    }
    catch { }
    // Keep template-provided preserveAspectRatio to avoid unintended zooming
    // Also search for raw placeholders that now contain paths (not in href attr)
    const uploadPathRegex = /(uploads\/[A-Za-z0-9_\-\/\.]+)/g;
    svg = await replaceAsync(svg, uploadPathRegex, async (m, p1) => {
        try {
            return await fileToDataUri(p1);
        }
        catch {
            return m;
        }
    });
    // Render to PNG
    try {
        const dbgDir = path.resolve('runs', 'compose-debug');
        try {
            await fs.mkdir(dbgDir, { recursive: true });
        }
        catch { }
        const dbgName = path.basename(opts.svgPath).replace(/\.svg$/i, '') + '.processed.svg';
        const dbgPath = path.join(dbgDir, dbgName);
        await fs.writeFile(dbgPath, svg, 'utf-8');
        try {
            console.log(`[compose] wrote debug SVG: ${dbgPath}`);
        }
        catch { }
    }
    catch { }
    const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 6 }).toBuffer();
    await fs.writeFile(opts.outPngPath, png);
    return { outPath: opts.outPngPath };
}
async function replaceAsync(str, regex, asyncFn) {
    const promises = [];
    const parts = [];
    let lastIndex = 0;
    for (const match of str.matchAll(regex)) {
        const index = match.index ?? 0;
        parts.push(str.slice(lastIndex, index));
        promises.push(asyncFn(...match, index));
        lastIndex = index + match[0].length;
    }
    parts.push(str.slice(lastIndex));
    const resolved = await Promise.all(promises);
    let out = '';
    for (let i = 0; i < resolved.length; i++)
        out += parts[i] + resolved[i];
    out += parts[parts.length - 1];
    return out;
}
