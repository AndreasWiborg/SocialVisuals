import Fastify from 'fastify';
import cors from '@fastify/cors';
import { z } from 'zod';
import path from 'path';
import { promises as fs } from 'fs';
import fsSync from 'fs';
import os from 'os';
import sharp from 'sharp';
import { registerFont } from 'canvas';
import { deriveRoleSchema } from './roles.js';
import { enrichSchema } from './roleSemantics.js';
import { buildLLMPrompt } from './llm/promptBuilder.js';
import { validateAndClean } from './llm/ingest.js';
import { generateBundles, buildBundlePrompt } from './bundleGen.js';
import { generateBundlesLocal } from './generateLocal.js';
import { fitText } from './layoutOracle.js';
import { selectTop } from './selector.js';
import { renderText } from './render.js';
import { renderBundle } from './pipeline/renderBundle.js';
import { loadProfile } from './config/profiles.js';
import { generateOnComposed } from './pipeline/generateOnComposed.js';
import { generateFromSVG } from './pipeline/generateFromSVG.js';
import { buildSocialPrompt, validateSocialPack } from './socialPrompt.js';
import { appendItem } from './runs/recorder.js';
import crypto from 'crypto';
import https from 'https';
import http from 'http';
import { RolePayloadZ, validateRolePayload } from './contract/rolePayload.js';
import { loadTemplateById, loadTemplateByIdLoose, getTemplateSearchRoots } from './pipeline/templateLookup.js';
import { fitBundleAllRoles, pickTopBundleByAggregate } from './rankerBundle.js';
import { runBatchFromUrl } from './pipeline/batch.js';
import { getProvider } from './llm/providers/index.js';
import { fetchUrl } from './scrape/fetch.js';
import { parseHTML } from './scrape/parse.js';
import { buildCtxFromParsed } from './research/ctxBuilder.js';
import { enrichCtx } from './research/enrichCtx.js';
// Minimal .env loader (no external deps). Supports KEY=VALUE lines; ignores comments.
function loadEnvFile(p) {
    try {
        const raw = fsSync.readFileSync(p, 'utf-8');
        for (const line of raw.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#'))
                continue;
            const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
            if (!m)
                continue;
            const key = m[1];
            let val = m[2];
            // Strip surrounding quotes
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith('\'') && val.endsWith('\'')))
                val = val.slice(1, -1);
            if (process.env[key] == null)
                process.env[key] = val;
        }
    }
    catch { }
}
// Load env from typical locations
loadEnvFile(path.resolve('.env'));
loadEnvFile(path.resolve('.env.local'));
loadEnvFile(path.resolve('..', '.env'));
loadEnvFile(path.resolve('..', '.env.local'));
if (!process.env.LLM_PROVIDER)
    process.env.LLM_PROVIDER = 'openai';
async function getPkgVersion() {
    try {
        const pkgPath = path.resolve(process.cwd(), 'package.json');
        const raw = await fs.readFile(pkgPath, 'utf-8');
        const pkg = JSON.parse(raw);
        return pkg.version || '0.0.0';
    }
    catch {
        return '0.0.0';
    }
}
function upperBoundForArea(area) {
    const H = area.shape.h;
    const Lmax = typeof area.constraints.maxLines === 'number'
        ? area.constraints.maxLines
        : area.constraints.maxLines.max;
    const LH = area.constraints.lineHeight.value || 1.1;
    return Math.floor(H / (Lmax * LH));
}
async function downloadToTemp(url) {
    const res = await fetch(url);
    if (!res.ok)
        throw new Error(`Failed to download: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const tmp = path.join(process.cwd(), `bg-${Date.now()}.bin`);
    await fs.writeFile(tmp, buf);
    return tmp;
}
export async function createServer() {
    // Lightweight .env loader (avoids extra dependency in restricted envs)
    try {
        const envPath = path.resolve(process.cwd(), '.env');
        if (fsSync.existsSync(envPath)) {
            const txt = fsSync.readFileSync(envPath, 'utf-8');
            for (const raw of txt.split(/\r?\n/)) {
                const line = raw.trim();
                if (!line || line.startsWith('#'))
                    continue;
                const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
                if (!m)
                    continue;
                let val = m[2];
                if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                    val = val.slice(1, -1);
                }
                if (process.env[m[1]] === undefined)
                    process.env[m[1]] = val;
            }
        }
    }
    catch { }
    // Tune Sharp concurrency for better throughput (no quality change)
    try {
        const desired = parseInt(process.env.SHARP_CONCURRENCY || '', 10);
        const cores = (os.cpus() || []).length || 4;
        const conc = Number.isFinite(desired) && desired > 0 ? desired : Math.max(2, Math.min(8, cores));
        sharp.concurrency(conc);
    }
    catch { }
    const app = Fastify({ logger: false, bodyLimit: 50 * 1024 * 1024 });
    // Register local fonts (optional)
    try {
        const fontDir = path.resolve('text-overlay', 'fonts');
        const entries = fsSync.existsSync(fontDir) ? fsSync.readdirSync(fontDir) : [];
        const curated = new Set([
            'montserrat', 'poppins', 'playfair display', 'bebas neue', 'oswald', 'raleway', 'inter', 'lato', 'rubik', 'nunito', 'dm sans', 'kanit', 'archivo black', 'barlow', 'exo 2', 'source sans 3', 'pacifico'
        ]);
        for (const name of entries) {
            if (!/\.(ttf|otf)$/i.test(name))
                continue;
            const file = path.join(fontDir, name);
            let family = name.replace(/\.(ttf|otf)$/i, '');
            // Map common file name prefixes to curated family names
            const base = family.toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
            for (const fam of curated) {
                const norm = fam.toLowerCase();
                if (base.startsWith(norm) || base.includes(norm)) {
                    family = fam;
                    break;
                }
            }
            try {
                registerFont(file, { family });
            }
            catch { }
        }
    }
    catch { }
    app.register(cors, {
        origin: (orig, cb) => {
            if (!orig)
                return cb(null, true);
            if (orig.startsWith('http://localhost:3000') || orig.startsWith('http://localhost:3001'))
                return cb(null, true);
            return cb(null, false);
        }
    });

    // Simple image proxy to avoid client-side cross-origin hiccups with signed URLs
    app.get('/image/proxy', async (req, reply) => {
        try {
            const u = String(req.query?.u || '');
            if (!u || !/^https?:\/\//i.test(u))
                return reply.code(400).send({ error: 'u required' });
            // Allow only supabase storage URLs
            if (!/\.supabase\.co\//i.test(u))
                return reply.code(400).send({ error: 'domain not allowed' });
            const forceDownload = String(req.query?.download || '').length > 0;
            const filenameRaw = String(req.query?.filename || '').trim();
            const safeName = filenameRaw && !filenameRaw.includes('/') && !filenameRaw.includes('..') ? filenameRaw : 'download.png';
            const url = new URL(u);
            const lib = url.protocol === 'https:' ? https : http;
            const r = lib.request(url, { method: 'GET' }, (res) => {
                const status = res.statusCode || 500;
                if (status >= 300 && status < 400 && res.headers.location) {
                    reply.redirect(res.headers.location);
                    res.resume();
                    return;
                }
                reply.status(status);
                const ct = res.headers['content-type'] || 'application/octet-stream';
                reply.header('Content-Type', ct);
                if (forceDownload)
                    reply.header('Content-Disposition', `attachment; filename="${safeName}"`);
                if (res.headers['content-length'])
                    reply.header('Content-Length', res.headers['content-length']);
                // Stream body
                res.pipe(reply.raw);
                res.on('end', () => { try { reply.raw.end(); } catch {} });
            });
            r.on('error', (e) => reply.code(502).send({ error: String(e?.message || e) }));
            r.end();
        }
        catch (e) {
            return reply.code(500).send({ error: String(e?.message || e) });
        }
    });

    // Simple endpoint to verify Supabase upload/sign configuration
    app.post('/debug/upload-check', async (req, reply) => {
        try {
            const body = await req.body;
            const userId = String(body?.userId || body?.brandId || 'anon');
            // Create a tiny 1x1 PNG
            const tmpDir = path.resolve('runs', 'debug');
            try { await fs.mkdir(tmpDir, { recursive: true }); } catch {}
            const tmp = path.join(tmpDir, `probe_${Date.now()}.png`);
            const png1x1 = Buffer.from(
                'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=',
                'base64'
            );
            await fs.writeFile(tmp, png1x1);
            const signed = await uploadGeneratedImage(tmp, { brandId: userId }, 'debug');
            return reply.send({ ok: !!signed, storage: signed, note: signed ? 'Upload+sign ok' : 'Upload not configured' });
        } catch (e) {
            return reply.code(500).send({ ok: false, error: String(e?.message || e) });
        }
    });

    // Supabase upload helpers for generated images
    const SUPABASE_BASE = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
    const OUTPUT_BUCKET = process.env.SUPABASE_OUTPUT_BUCKET || 'generated';
    const OUTPUT_PREFIX = process.env.SUPABASE_OUTPUT_PREFIX || 'generated';
    async function supaUploadFile(bucket, objectPath, filePath, contentType = 'image/png') {
        if (!SUPABASE_BASE || !SUPABASE_KEY)
            return null;
        const url = new URL(`${SUPABASE_BASE}/storage/v1/object/${bucket}/${objectPath}?upsert=true`);
        const data = await fs.readFile(filePath);
        return new Promise((resolve, reject) => {
            const req = https.request(url, { method: 'POST', headers: { 'Authorization': `Bearer ${SUPABASE_KEY}`, 'apikey': SUPABASE_KEY, 'Content-Type': contentType, 'Content-Length': data.length } }, (res) => {
                if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                    resolve({ ok: true });
                }
                else {
                    let buf = [];
                    res.on('data', d => buf.push(d));
                    res.on('end', () => reject(new Error(`upload failed ${res.statusCode}: ${Buffer.concat(buf).toString()}`)));
                }
            });
            req.on('error', reject);
            req.write(data);
            req.end();
        });
    }
    async function supaSignUrl(bucket, objectPath, expiresIn = 3600 * 24) {
        if (!SUPABASE_BASE || !SUPABASE_KEY)
            return null;
        const url = new URL(`${SUPABASE_BASE}/storage/v1/object/sign/${bucket}/${objectPath}`);
        const body = Buffer.from(JSON.stringify({ expiresIn }));
        return new Promise((resolve, reject) => {
            const req = https.request(url, { method: 'POST', headers: { 'Authorization': `Bearer ${SUPABASE_KEY}`, 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json', 'Content-Length': body.length } }, (res) => {
                const chunks = [];
                res.on('data', d => chunks.push(d));
                res.on('end', () => {
                    const txt = Buffer.concat(chunks).toString();
                    try {
                        const j = JSON.parse(txt);
                        resolve(j && j.signedURL ? `${SUPABASE_BASE}${j.signedURL}` : null);
                    }
                    catch {
                        resolve(null);
                    }
                });
            });
            req.on('error', reject);
            req.write(body);
            req.end();
        });
    }
    async function uploadGeneratedImage(filePath, ctx, templateId) {
        try {
            if (!fsSync.existsSync(filePath)) return null;
            const brand = String(ctx?.brandId || 'anon');
            const ts = new Date().toISOString().slice(0, 10);
            const base = path.basename(filePath).replace(/\s+/g, '_');
            const hash = crypto.createHash('sha1').update(base + Date.now()).digest('hex').slice(0, 8);
            const obj = `${brand}/${OUTPUT_PREFIX}/${ts}/${templateId || 'tpl'}_${hash}_${base}`;
            await supaUploadFile(OUTPUT_BUCKET, obj, filePath, 'image/png');
            const signed = await supaSignUrl(OUTPUT_BUCKET, obj, parseInt(process.env.SUPABASE_SIGN_EXPIRES || '604800', 10) || 604800);
            return { bucket: OUTPUT_BUCKET, object: obj, signedUrl: signed };
        } catch (e) {
            try { console.warn('[uploadGeneratedImage] failed', String(e?.message || e)); } catch {}
            return null;
        }
    }
    app.get('/health', async () => ({ ok: true }));
    // Debug endpoint to see template search roots
    app.get('/debug/template-roots', async (_req, reply) => {
        try {
            const { getTemplateSearchRoots } = await import('./pipeline/templateLookup.js');
            const roots = getTemplateSearchRoots();
            return reply.send({ roots, cwd: process.cwd() });
        }
        catch (e) {
            return reply.code(500).send({ error: String(e?.message || e) });
        }
    });
    // List templates with role specs summary
    app.get('/templates/list', async (_req, reply) => {
        try {
            const roots = getTemplateSearchRoots();
            const seen = new Set();
            const results = [];
            for (const r of roots) {
                try {
                    const entries = await fs.readdir(r, { withFileTypes: true });
                    for (const ent of entries) {
                        if (!ent.name.toLowerCase().endsWith('.json'))
                            continue;
                        const p = path.join(r, ent.name);
                        try {
                            const raw = await fs.readFile(p, 'utf-8');
                            const tpl = JSON.parse(raw);
                            if (!tpl?.templateId || seen.has(tpl.templateId))
                                continue;
                            seen.add(tpl.templateId);
                            const schema = deriveRoleSchema(tpl);
                            const roles = schema.specs.map(s => ({ role: s.role, count: s.count, maxLines: s.maxLines, graphemeBudget: s.graphemeBudget, upperBoundFontPx: s.upperBoundFontPx }));
                            results.push({ templateId: tpl.templateId, pixelSize: tpl.pixelSize, roles });
                        }
                        catch { }
                    }
                }
                catch { }
            }
            results.sort((a, b) => String(a.templateId).localeCompare(String(b.templateId)));
            return reply.send(results);
        }
        catch (e) {
            return reply.code(500).send({ error: String(e?.message || e) });
        }
    });
    // List background images under allowed dirs
    app.get('/bg/list', async (req, reply) => {
        const dirQ = String(req.query?.dir || '.');
        const allowed = (process.env.ALLOWED_BG_DIRS || '../AdCreator2/backend/output,./').split(',').map(s => path.resolve(s.trim()));
        const target = path.resolve(dirQ);
        if (!allowed.some(a => target.startsWith(a)))
            return reply.code(400).send({ error: 'dir not allowed' });
        const exts = new Set(['.png', '.jpg', '.jpeg']);
        const files = [];
        async function walk(d, depth) {
            if (depth > 2)
                return;
            let entries = [];
            try {
                entries = await fs.readdir(d, { withFileTypes: true });
            }
            catch {
                return;
            }
            for (const ent of entries) {
                const p = path.join(d, ent.name);
                if (ent.isDirectory())
                    await walk(p, depth + 1);
                else if (ent.isFile && exts.has(path.extname(ent.name).toLowerCase()))
                    files.push({ name: ent.name, path: p, url: `/file?p=${encodeURIComponent(p)}` });
            }
        }
        await walk(target, 0);
        return reply.send({ dir: target, files });
    });
    // Runs list and details
    app.get('/runs/list', async (_req, reply) => {
        const runsDir = path.resolve('runs');
        let entries = [];
        try {
            entries = await fs.readdir(runsDir, { withFileTypes: true });
        }
        catch { }
        const out = [];
        for (const ent of entries) {
            if (!ent.isDirectory())
                continue;
            const dir = path.join(runsDir, ent.name);
            const manP = path.join(dir, 'manifest.json');
            let count = 0;
            let createdAt = null;
            try {
                const raw = await fs.readFile(manP, 'utf-8');
                const m = JSON.parse(raw);
                count = (m.items || []).length;
                createdAt = m.startedAt || null;
            }
            catch {
                try {
                    const st = await fs.stat(dir);
                    createdAt = new Date(st.mtimeMs).toISOString();
                }
                catch { }
            }
            out.push({ id: ent.name, dir, count, createdAt });
        }
        out.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        return reply.send(out);
    });
    app.get('/runs/:id', async (req, reply) => {
        const id = String(req.params?.id || '');
        const dir = path.resolve('runs', id);
        const manP = path.join(dir, 'manifest.json');
        try {
            const raw = await fs.readFile(manP, 'utf-8');
            const m = JSON.parse(raw);
            const items = (m.items || []).map((it) => ({ file: it.outPath, url: `/file?p=${encodeURIComponent(it.outPath)}`, templateId: it.templateId, angle: it.angle, meta: it.meta, ctxSummary: it.ctxSummary, rolesUsed: it.rolesUsed, brandId: it.brandId }));
            return reply.send({ id, dir, startedAt: m.startedAt || null, items });
        }
        catch {
            // Fallback: list PNGs
            let files = [];
            try {
                files = (await fs.readdir(dir)).filter(n => n.toLowerCase().endsWith('.png')).map(n => { const p = path.join(dir, n); return ({ file: p, url: `/file?p=${encodeURIComponent(p)}` }); });
            }
            catch { }
            return reply.send({ id, dir, items: files });
        }
    });
    // Content search across runs with optional filters
    app.get('/content/search', async (req, reply) => {
        try {
            const q = (req.query || {});
            const brandIdQ = q.brandId ? String(q.brandId) : undefined;
            const createdAfter = q.createdAfter ? new Date(String(q.createdAfter)) : undefined;
            const createdBefore = q.createdBefore ? new Date(String(q.createdBefore)) : undefined;
            const limit = Math.min(500, Math.max(1, parseInt(String(q.limit || '200'), 10) || 200));
            const offset = Math.max(0, parseInt(String(q.offset || '0'), 10) || 0);
            const runsDir = path.resolve('runs');
            let runDirs = [];
            try {
                runDirs = await fs.readdir(runsDir, { withFileTypes: true });
            }
            catch { }
            const out = [];
            for (const ent of runDirs) {
                if (!ent.isDirectory())
                    continue;
                const dir = path.join(runsDir, ent.name);
                const manP = path.join(dir, 'manifest.json');
                let man;
                try {
                    man = JSON.parse(await fs.readFile(manP, 'utf-8'));
                }
                catch {
                    continue;
                }
                const startedAt = man.startedAt ? new Date(man.startedAt) : undefined;
                if (createdAfter && startedAt && startedAt < createdAfter)
                    continue;
                if (createdBefore && startedAt && startedAt > createdBefore)
                    continue;
                for (const it of (man.items || [])) {
                    const bId = String(it.brandId || it?.ctxSummary?.brandId || '');
                    if (brandIdQ && bId !== brandIdQ)
                        continue;
                    out.push({
                        runId: ent.name,
                        file: it.outPath,
                        url: `/file?p=${encodeURIComponent(it.outPath)}`,
                        templateId: it.templateId,
                        angle: it.angle,
                        brandId: bId || null,
                        ctxSummary: it.ctxSummary || null,
                        createdAt: man.startedAt || null
                    });
                }
            }
            out.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
            const sliced = out.slice(offset, offset + limit);
            return reply.send({ ok: true, total: out.length, items: sliced });
        }
        catch (e) {
            return reply.code(500).send({ error: String(e?.message || e) });
        }
    });
    // Branding info (latest or by brandId)
    app.get('/branding/info', async (req, reply) => {
        try {
            const q = (req.query || {});
            const brandIdQ = q.brandId ? String(q.brandId) : undefined;
            const runsDir = path.resolve('runs');
            let runDirs = [];
            try {
                runDirs = await fs.readdir(runsDir, { withFileTypes: true });
            }
            catch { }
            const candidates = [];
            for (const ent of runDirs) {
                if (!ent.isDirectory())
                    continue;
                const manP = path.join(runsDir, ent.name, 'manifest.json');
                try {
                    const man = JSON.parse(await fs.readFile(manP, 'utf-8'));
                    const startedAt = man.startedAt || null;
                    for (const it of (man.items || [])) {
                        const ctx = it.ctxSummary || {};
                        const bId = it.brandId || ctx.brandId || null;
                        if (brandIdQ && bId !== brandIdQ)
                            continue;
                        candidates.push({ ctx, brandId: bId, startedAt, runId: ent.name });
                    }
                }
                catch { }
            }
            candidates.sort((a, b) => String(b.startedAt || '').localeCompare(String(a.startedAt || '')));
            const pick = candidates[0] || null;
            return reply.send({ ok: true, brandId: pick?.brandId || null, ctx: pick?.ctx || null, runId: pick?.runId || null });
        }
        catch (e) {
            return reply.code(500).send({ error: String(e?.message || e) });
        }
    });
    // Settings: simple JSON persisted under .cache/settings.json
    const settingsPath = path.resolve('.cache', 'settings.json');
    app.get('/settings', async (_req, reply) => {
        try {
            const raw = await fs.readFile(settingsPath, 'utf-8');
            const data = JSON.parse(raw);
            const merged = {
                brandId: null,
                allowedBgDirs: (process.env.ALLOWED_BG_DIRS || '../AdCreator2/backend/output,./'),
                preferredFont: null,
                randomFont: true,
                headlineUppercase: false,
                headlineWeight: 'normal',
                headlineColor: null,
                bodyUppercase: false,
                bodyWeight: 'normal',
                bodyColor: null,
                subheadlineUppercase: false,
                subheadlineWeight: 'normal',
                subheadlineColor: null,
                ctaUppercase: false,
                ctaWeight: 'normal',
                ctaColor: null,
                ...(data || {})
            };
            return reply.send({ ok: true, settings: merged });
        }
        catch {
            return reply.send({ ok: true, settings: { brandId: null, allowedBgDirs: (process.env.ALLOWED_BG_DIRS || '../AdCreator2/backend/output,./'), preferredFont: null, randomFont: true, headlineUppercase: false, headlineWeight: 'normal', headlineColor: null, bodyUppercase: false, bodyWeight: 'normal', bodyColor: null, subheadlineUppercase: false, subheadlineWeight: 'normal', subheadlineColor: null, ctaUppercase: false, ctaWeight: 'normal', ctaColor: null } });
        }
    });
    app.post('/settings', async (req, reply) => {
        try {
            const Body = z.object({ brandId: z.string().nullable().optional(), allowedBgDirs: z.string().optional(), preferredFont: z.string().nullable().optional(), randomFont: z.boolean().optional(), headlineUppercase: z.boolean().optional(), headlineWeight: z.enum(['normal','bold']).optional(), headlineColor: z.string().nullable().optional(), bodyUppercase: z.boolean().optional(), bodyWeight: z.enum(['normal','bold']).optional(), bodyColor: z.string().nullable().optional(), subheadlineUppercase: z.boolean().optional(), subheadlineWeight: z.enum(['normal','bold']).optional(), subheadlineColor: z.string().nullable().optional(), ctaUppercase: z.boolean().optional(), ctaWeight: z.enum(['normal','bold']).optional(), ctaColor: z.string().nullable().optional() });
            const p = Body.safeParse(req.body);
            if (!p.success)
                return reply.code(400).send({ error: 'Invalid payload', zodIssues: p.error.issues });
            try {
                await fs.mkdir(path.dirname(settingsPath), { recursive: true });
            }
            catch { }
            let current = {};
            try {
                current = JSON.parse(await fs.readFile(settingsPath, 'utf-8')) || {};
            }
            catch { }
            const merged = { ...current, ...p.data };
            await fs.writeFile(settingsPath, JSON.stringify(merged, null, 2), 'utf-8');
            return reply.send({ ok: true });
        }
        catch (e) {
            return reply.code(500).send({ error: String(e?.message || e) });
        }
    });
    // Curated font list (install TTFs under text-overlay/fonts to ensure availability for node-canvas)
    const curatedFonts = [
        'Montserrat', 'Poppins', 'Playfair Display', 'Bebas Neue', 'Oswald', 'Raleway', 'Inter', 'Lato', 'Rubik', 'Nunito', 'DM Sans', 'Kanit', 'Archivo Black', 'Barlow', 'Exo 2', 'Source Sans 3', 'Pacifico'
    ];
    app.get('/fonts/list', async (_req, reply) => {
        try {
            // Best-effort: list files found under ./fonts as available families (if present)
            const fontDir = path.resolve('text-overlay', 'fonts');
            let files = [];
            try {
                files = await fs.readdir(fontDir);
            }
            catch { }
            const installed = files.filter(n => /\.(ttf|otf)$/i.test(n)).map(n => n.replace(/\.(ttf|otf)$/i, '')).sort();
            return reply.send({ ok: true, curated: curatedFonts, installed });
        }
        catch (e) {
            return reply.code(500).send({ error: String(e?.message || e) });
        }
    });
    // Serve a local file (restricted to allowed directories)
    app.get('/file', async (req, reply) => {
        try {
            const qp = req.query || {};
            const p0 = String(qp.p || '');
            if (!p0)
                return reply.code(400).send({ error: 'p required' });
            const p = path.resolve(p0);
            // Allowed roots: runs dir + allowed bg dirs
            const runsDir = path.resolve('runs');
            const allowedBg = (process.env.ALLOWED_BG_DIRS || '../AdCreator2/backend/output,./').split(',').map(s => path.resolve(s.trim()));
            const roots = [runsDir, ...allowedBg];
            if (!roots.some(r => p.startsWith(r)))
                return reply.code(403).send({ error: 'forbidden' });
            // Content type by extension
            const ext = path.extname(p).toLowerCase();
            const type = ext === '.png' ? 'image/png' : (ext === '.jpg' || ext === '.jpeg') ? 'image/jpeg' : 'application/octet-stream';
            const data = await fs.readFile(p);
            reply.header('Content-Type', type);
            return reply.send(data);
        }
        catch (e) {
            return reply.code(404).send({ error: 'not found' });
        }
    });
    // Generate social pack copy from a chosen bundle + ctx
    app.post('/social/generate', async (req, reply) => {
        try {
            const Body = z.object({
                imagePath: z.string(),
                ctx: z.any(),
                bundle: z.object({
                    id: z.string(),
                    angle: z.string().optional(),
                    theme_id: z.string().optional(),
                    roles: z.record(z.any())
                })
            });
            const parsed = Body.safeParse(req.body);
            if (!parsed.success)
                return reply.code(200).send({ ok: false, errors: parsed.error.issues });
            // Social pack validation is centralized in socialPrompt.ts
            const provider = getProvider();
            const ctx = parsed.data.ctx || {};
            const bundle = parsed.data.bundle;
            const locale = ctx?.locale || 'en-US';
            const input = {
                imagePath: parsed.data.imagePath,
                bundle,
                ctx: { product: ctx?.product, audience: ctx?.audience, tone: ctx?.tone, locale }
            };
            const prompt = `You are a social media copywriter. Return JSON ONLY for a social pack.\n\nINPUT (JSON):\n${JSON.stringify(input, null, 2)}\n\nREQUIREMENTS (STRICT):\n- No numbers (no digits, dates, percents, prices, number words).\n- Locale-aware (${locale}).\n- Captions must be ≤ 220 characters.\n- Provide short, platform-appropriate voice.\n- For Twitter and Instagram include a small set of relevant hashtags (lowercase).\n- Provide descriptive "altText" for the image (1 short sentence).\n\nRETURN JSON ONLY IN THIS SHAPE:\n{\n  "twitter": {"caption": "...", "hashtags": ["#..."]},\n  "instagram": {"caption": "...", "hashtags": ["#..."]},\n  "linkedin": {"caption": "..."},\n  "altText": "..."\n}`;
            const prompt2 = buildSocialPrompt(parsed.data.bundle, (parsed.data.ctx || {}));
            const { text } = await provider.generate({ prompt: prompt2, n: 1 });
            let obj;
            try {
                obj = JSON.parse(text || '{}');
            }
            catch {
                return reply.code(200).send({ ok: false, errors: ['Provider returned non-JSON'], raw: text });
            }
            const v = validateSocialPack(obj);
            if (!v.ok)
                return reply.code(200).send({ ok: false, errors: v.errors, raw: obj });
            return reply.code(200).send({ ok: true, pack: v.pack });
        }
        catch (e) {
            return reply.code(200).send({ ok: false, errors: [String(e?.message || e)] });
        }
    });
    app.get('/version', async () => ({ version: await getPkgVersion() }));
    const tplSchema = z.object({ templateId: z.string(), pixelSize: z.object({ w: z.number(), h: z.number() }), fonts: z.record(z.any()), areas: z.array(z.any()) });
    app.post('/roles/derive', async (req, reply) => {
        const body = await req.body;
        const parsed = z.object({ template: tplSchema }).safeParse(body);
        if (!parsed.success)
            return reply.code(400).send({ error: 'Invalid template' });
        const schema = deriveRoleSchema(parsed.data.template);
        return { schema };
    });
    app.post('/bundles/generate', async (req, reply) => {
        const body = await req.body;
        const parsed = z.object({ ctx: z.any(), template: tplSchema, n: z.number().optional() }).safeParse(body);
        if (!parsed.success)
            return reply.code(400).send({ error: 'Invalid payload' });
        const tpl = parsed.data.template;
        const schema = deriveRoleSchema(tpl);
        const bundles = await generateBundles(parsed.data.ctx, schema, parsed.data.n ?? 14);
        const prompt = buildBundlePrompt(parsed.data.ctx, schema);
        return { schema, bundles, prompt };
    });
    // LLM pipeline (prepare mode): derive schema, enrich roles, build prompt
    app.post('/pipeline/runLLM', async (req, reply) => {
        let body = await req.body;
        if (typeof body === 'string') {
            try {
                body = JSON.parse(body);
            }
            catch { /* accept as-is for flexible parsing below */ }
        }
        // generate path: call provider to get bundles
        if (body?.mode === 'generate') {
            const parsed = z.object({ mode: z.literal('generate'), template: tplSchema, ctx: z.any().optional(), n: z.number().optional(), k: z.number().optional(), fontFamily: z.string().optional(), bg: z.object({ kind: z.enum(['path', 'url']), value: z.string() }).optional(), brandColors: z.array(z.string()).optional() }).safeParse(body);
            if (!parsed.success)
                return reply.code(400).send({ error: 'Invalid payload', zodIssues: parsed.error?.issues });
            const tpl = parsed.data.template;
            const ctx = parsed.data.ctx || {};
            const n = parsed.data.n || 14;
            const schema = deriveRoleSchema(tpl);
            const enriched = enrichSchema(tpl, schema, ctx);
            const prompt = buildLLMPrompt(ctx, enriched, n);
            let text = '';
            try {
                const provider = getProvider();
                const gen = await provider.generate({ prompt, n });
                text = gen.text || '';
            }
            catch (e) {
                return reply.status(502).send({ error: 'LLM provider error', detail: String(e?.message || e) });
            }
            let bundles;
            try {
                bundles = JSON.parse(text);
            }
            catch (e) {
                return reply.status(422).send({ errors: ['Model did not return valid JSON'], raw: text });
            }
            if (bundles && bundles.bundles)
                bundles = bundles.bundles;
            const parsedRes = validateAndClean(bundles, schema, enriched);
            if (!parsedRes.ok)
                return reply.status(422).send({ errors: parsedRes.errors, warnings: parsedRes.warnings });
            const font = parsed.data.fontFamily || tpl.fonts?.headline?.family || 'Arial';
            const bundleFits = [];
            for (const b of parsedRes.bundles) {
                bundleFits.push(await fitBundleAllRoles(tpl, b, font, ctx?.locale));
            }
            const best = pickTopBundleByAggregate(bundleFits, parsedRes.scores);
            if (!best)
                return reply.status(422).send({ error: 'No candidates fit' });
            const winner = parsedRes.bundles.find(b => b.id === best.bundleId);
            const outPath = `./out_llm_${Date.now()}.png`;
            const bgPath = parsed.data.bg?.value;
            if (!bgPath)
                return reply.status(400).send({ error: 'bg.path required' });
            const meta = await renderBundle(tpl, winner, bgPath, outPath, font, parsed.data.brandColors, ctx?.locale);
            const policy = [{ bundleId: best.bundleId, coherence: parsedRes.scores?.[best.bundleId]?.coherence ?? 0, ctaOk: parsedRes.scores?.[best.bundleId]?.ctaOk ?? true }];
            return reply.send({ outPath: meta.outPath, meta, topBundle: best, policy });
        }
        // prepare path
        if (body?.mode === 'prepare') {
            const parsed = z.object({ mode: z.literal('prepare'), template: tplSchema, ctx: z.any(), n: z.number().optional() }).safeParse(body);
            if (!parsed.success)
                return reply.code(400).send({ error: 'Invalid payload' });
            const tpl = parsed.data.template;
            const schema = deriveRoleSchema(tpl);
            const enriched = enrichSchema(tpl, schema, parsed.data.ctx);
            const prompt = buildLLMPrompt(parsed.data.ctx, enriched, parsed.data.n ?? 14);
            return { schema, enriched, prompt };
        }
        // ingest path: validate, rank, render
        if (body?.mode === 'ingest') {
            // Accept flexible shapes; we'll manually coerce, then zod-check the rest
            const baseParsed = z.object({
                mode: z.literal('ingest'),
                template: tplSchema,
                ctx: z.any().optional(),
                bundles: z.any().optional(),
                k: z.number().optional(),
                fontFamily: z.string().optional(),
                bg: z.object({ kind: z.enum(['path', 'url']), value: z.string() }).optional(),
                brandColors: z.array(z.string()).optional()
            }).safeParse(body);
            if (!baseParsed.success) {
                // Surface detailed zod issues
                return reply.code(400).send({ error: 'Invalid payload', zodIssues: baseParsed.error?.issues });
            }
            const tpl = baseParsed.data.template;
            const schema = deriveRoleSchema(tpl);
            const enriched = enrichSchema(tpl, schema, baseParsed.data.ctx);
            // Flexible bundles extraction
            let rawBundles = baseParsed.data.bundles;
            if (!rawBundles && Array.isArray(body))
                rawBundles = body; // bare array posted
            if (typeof rawBundles === 'string') {
                try {
                    rawBundles = JSON.parse(rawBundles);
                }
                catch { }
            }
            if (!rawBundles)
                return reply.status(400).send({ error: 'bundles required' });
            let res;
            try {
                res = validateAndClean(rawBundles, schema, enriched);
            }
            catch (e) {
                return reply.status(422).send({ errors: ['Invalid JSON payload'], zodIssues: e?.issues });
            }
            if (!res.ok)
                return reply.status(422).send({ errors: res.errors, warnings: res.warnings });
            const font = baseParsed.data.fontFamily || tpl.fonts?.headline?.family || 'Arial';
            const bundleFits = [];
            for (const b of res.bundles) {
                bundleFits.push(await fitBundleAllRoles(tpl, b, font, baseParsed.data.ctx?.locale));
            }
            const best = pickTopBundleByAggregate(bundleFits, res.scores);
            if (!best)
                return reply.status(422).send({ error: 'No candidates fit', warnings: res.warnings });
            const winner = res.bundles.find(b => b.id === best.bundleId);
            const outPath = `./out_llm_${Date.now()}.png`;
            const brandColors = baseParsed.data.brandColors || [];
            const bgPath = baseParsed.data.bg?.value;
            if (!bgPath)
                return reply.status(400).send({ error: 'bg.path required' });
            const meta = await renderBundle(tpl, winner, bgPath, outPath, font, brandColors, baseParsed.data.ctx?.locale);
            const policy = [{ bundleId: best.bundleId, coherence: res.scores?.[best.bundleId]?.coherence ?? 0, ctaOk: res.scores?.[best.bundleId]?.ctaOk ?? true }];
            return reply.send({ outPath: meta.outPath, meta, topBundle: best, policy, warnings: res.warnings || [] });
        }
        return reply.code(400).send({ error: 'Unknown mode' });
    });
    app.post('/bundles/generateLocal', async (req, reply) => {
        const body = await req.body;
        const parsed = z.object({ template: tplSchema, ctx: z.any(), n: z.number().optional() }).safeParse(body);
        if (!parsed.success)
            return reply.code(400).send({ error: 'Invalid payload' });
        const tpl = parsed.data.template;
        const schema = deriveRoleSchema(tpl);
        const enriched = enrichSchema(tpl, schema, parsed.data.ctx);
        const wl = (enriched.specs.find((s) => s.kind === 'cta')?.semantics?.ctaWhitelist || []);
        const bundles = await generateBundlesLocal(parsed.data.ctx, schema, parsed.data.n ?? 14, { ctaWhitelist: wl });
        return { schema, bundles };
    });
    app.post('/layout/fit', async (req, reply) => {
        const body = await req.body;
        const parsed = z.object({ template: tplSchema, areaId: z.string(), text: z.string(), fontFamily: z.string().optional(), opts: z.any().optional(), locale: z.string().optional() }).safeParse(body);
        if (!parsed.success)
            return reply.code(400).send({ error: 'Invalid payload' });
        const tpl = parsed.data.template;
        const area = tpl.areas.find((a) => a.id === parsed.data.areaId);
        if (!area)
            return reply.code(404).send({ error: 'Area not found' });
        const roleFont = tpl.fonts[area.role]?.family;
        const font = parsed.data.fontFamily || roleFont || 'Arial';
        const report = await fitText(parsed.data.text, area, font, tpl.pixelSize.w, { ...parsed.data.opts, locale: parsed.data.locale });
        return report;
    });
    app.post('/select', async (req, reply) => {
        const body = await req.body;
        const parsed = z.object({
            candidates: z.array(z.object({ id: z.string(), bundleId: z.string(), angle: z.string(), text: z.string(), fit: z.object({ font_px: z.number(), lines: z.number(), penalties: z.number(), used_hyphenation: z.boolean().optional() }) })),
            k: z.number().optional(),
            key: z.object({ brandId: z.string(), templateId: z.string() }).optional(),
            quotas: z.any().optional(),
            lambda: z.number().optional()
        }).safeParse(body);
        if (!parsed.success)
            return reply.code(400).send({ error: 'Invalid payload' });
        const selected = await selectTop(parsed.data.candidates, { k: parsed.data.k ?? 3, key: parsed.data.key, quotas: parsed.data.quotas, lambda: parsed.data.lambda });
        return { selected };
    });
    app.post('/render', async (req, reply) => {
        const body = await req.body;
        const parsed = z.object({
            template: tplSchema,
            areaId: z.string(),
            text: z.string(),
            fontFamily: z.string().optional(),
            bg: z.object({ kind: z.enum(['url', 'path', 'raw']), value: z.string() }),
            brandColors: z.array(z.string()).optional(),
            report: z.any().optional(),
            outPath: z.string().optional(),
            options: z.object({ stroke: z.object({ color: z.string().optional(), widthPx: z.number().optional() }).optional(), scrim: z.object({ maxOpacity: z.number().optional() }).optional() }).optional()
        }).safeParse(body);
        if (!parsed.success)
            return reply.code(400).send({ error: 'Invalid payload' });
        const tpl = parsed.data.template;
        const area = tpl.areas.find((a) => a.id === parsed.data.areaId);
        if (!area)
            return reply.code(404).send({ error: 'Area not found' });
        const roleFont = tpl.fonts[area.role]?.family;
        const font = parsed.data.fontFamily || roleFont || 'Arial';
        let report = parsed.data.report;
        if (!report) {
            report = await fitText(parsed.data.text, area, font, tpl.pixelSize.w);
        }
        if (!report.fits)
            return reply.code(422).send({ error: 'fits=false', reasons: report.reasons });
        if (parsed.data.bg.kind !== 'path')
            return reply.code(400).send({ error: 'Only bg.kind="path" is supported in dev' });
        const outPath = parsed.data.outPath || './out_api.png';
        const meta = await renderText(parsed.data.bg.value, outPath, area, parsed.data.text, font, report, parsed.data.brandColors, parsed.data.options);
        return { outPath, meta };
    });
    // Glue endpoint: accepts either explicit RolePayload or bundles and renders
    app.post('/pipeline/fromComposed', async (req, reply) => {
        const body = await req.body;
        // Flexible schema: { rolePayload?, bundles?, bg:{kind:'path',value}, fontFamily?, brandColors? }
        const bgPath = body?.bg?.value;
        if (!bgPath)
            return reply.code(400).send({ error: 'bg.path required' });
        // 1) RolePayload path
        if (body?.rolePayload) {
            try {
                const parsed = RolePayloadZ.safeParse(body.rolePayload);
                if (!parsed.success)
                    return reply.code(400).send({ error: 'Invalid rolePayload', zodIssues: parsed.error?.issues });
                const { templateId, roles, locale, brandColors } = parsed.data;
                const tpl = await loadTemplateById(templateId);
                const schema = deriveRoleSchema(tpl);
                const v = validateRolePayload(parsed.data, schema);
                if (!v.ok)
                    return reply.code(422).send({ errors: v.errors });
                const bundle = { id: 'rp1', angle: 'ROLE_PAYLOAD', theme_id: 'default', roles };
                const font = body?.fontFamily || tpl.fonts?.headline?.family || 'Arial';
                const fits = await fitBundleAllRoles(tpl, bundle, font, locale);
                const outPath = `./out_llm_${Date.now()}.png`;
                const meta = await renderBundle(tpl, bundle, bgPath, outPath, font, (brandColors && brandColors.length ? brandColors : body?.brandColors), locale);
                return reply.send({
                    outPath: meta.outPath || outPath,
                    templateId,
                    bgPath,
                    winner: { id: bundle.id, texts: roles, fits },
                    meta,
                    policy: { ctaOk: true }
                });
            }
            catch (e) {
                return reply.code(500).send({ error: 'fromComposed-rolePayload-failed', detail: String(e?.message || e) });
            }
        }
        // 2) Bundles path (kept for compatibility): require template in body
        if (body?.bundles && (body?.template || body?.templatePath)) {
            try {
                const tpl = body.template || JSON.parse(await fs.readFile(path.resolve(body.templatePath), 'utf-8'));
                const schema = deriveRoleSchema(tpl);
                const enriched = enrichSchema(tpl, schema, body?.ctx);
                const vres = validateAndClean(body.bundles, schema, enriched);
                if (!vres.ok)
                    return reply.status(422).send({ errors: vres.errors, warnings: vres.warnings });
                const font = body?.fontFamily || tpl.fonts?.headline?.family || 'Arial';
                const fits = [];
                for (const b of vres.bundles) {
                    fits.push(await fitBundleAllRoles(tpl, b, font, body?.ctx?.locale));
                }
                const best = pickTopBundleByAggregate(fits, vres.scores);
                const winner = vres.bundles.find(b => b.id === best.bundleId);
                const outPath = `./out_llm_${Date.now()}.png`;
                const meta = await renderBundle(tpl, winner, bgPath, outPath, font, body?.brandColors, body?.ctx?.locale);
                return reply.send({ outPath: meta.outPath || outPath, winner: best, meta });
            }
            catch (e) {
                return reply.code(500).send({ error: 'fromComposed-bundles-failed', detail: String(e?.message || e) });
            }
        }
        return reply.code(400).send({ error: 'Provide either rolePayload or bundles + template' });
    });
    app.post('/ctx/fromUrl', async (req, reply) => {
        try {
            const body = await req.body;
            const parsedBody = z.object({ url: z.string().url(), enrich: z.boolean().optional() }).safeParse(body);
            if (!parsedBody.success)
                return reply.code(400).send({ error: 'Invalid payload' });
            const { url } = parsedBody.data;
            const res = await fetchUrl(url);
            if (res.status >= 400)
                return reply.code(502).send({ error: 'Fetch failed', status: res.status });
            const p = parseHTML(res.html, res.finalUrl);
            const ctx = buildCtxFromParsed(p);
            // Optional enrichment layer (opt-in)
            const wantEnrich = !!(parsedBody.data.enrich || String(req.query?.enrich || '').toLowerCase() === 'true');
            if (wantEnrich) {
                try {
                    ctx.enriched = await enrichCtx(ctx, { cacheKey: res.finalUrl || ctx?.product?.name || undefined });
                }
                catch { }
            }
            return reply.send({ parsed: { url: p.url, lang: p.lang, title: p.title, heroText: p.heroText, buttons: p.buttons?.slice(0, 10) || [], hasPricing: p.hasPricing, hasCart: p.hasCart, hasAppBadges: p.hasAppBadges, hasBlog: p.hasBlog }, ctx });
        }
        catch (e) {
            return reply.code(500).send({ error: 'ctx-from-url-failed', detail: String(e?.message || e) });
        }
    });
    // One-shot: scrape → ctx → LLM generate → validate → fit (bundle-level) → render
    app.post('/pipeline/fromUrl', async (req, reply) => {
        try {
            const body = await req.body;
            const schemaZ = z.object({
                url: z.string().url(),
                template: z.any().optional(),
                templatePath: z.string().optional(),
                n: z.number().optional(),
                k: z.number().optional(),
                bg: z.object({ kind: z.literal('path'), value: z.string() }).optional(),
                brandColors: z.array(z.string()).optional(),
                fontFamily: z.string().optional()
            });
            const parsed = schemaZ.safeParse(body);
            if (!parsed.success)
                return reply.code(400).send({ error: 'Invalid payload', zodIssues: parsed.error?.issues });
            // 1) Fetch & parse
            const fetchRes = await fetchUrl(parsed.data.url);
            if (fetchRes.status >= 400)
                return reply.code(502).send({ error: 'Fetch failed', status: fetchRes.status });
            const parsedDoc = parseHTML(fetchRes.html, fetchRes.finalUrl);
            const ctx = buildCtxFromParsed(parsedDoc);
            // 2) Template: inline JSON or by path
            let tpl = parsed.data.template;
            if (!tpl && parsed.data.templatePath) {
                const p = path.resolve(parsed.data.templatePath);
                const raw = await fs.readFile(p, 'utf-8');
                tpl = JSON.parse(raw);
            }
            if (!tpl)
                return reply.code(400).send({ error: 'Template required (template or templatePath)' });
            // 3) Enrich roles + prompt
            const schema = deriveRoleSchema(tpl);
            const enriched = enrichSchema(tpl, schema, ctx);
            const n = parsed.data.n || 14;
            const prompt = buildLLMPrompt(ctx, enriched, n);
            // 4) Provider generate
            let modelText = '';
            try {
                const provider = getProvider();
                const out = await provider.generate({ prompt, n });
                modelText = out.text || '';
            }
            catch (e) {
                return reply.code(502).send({ error: 'LLM provider error', detail: String(e?.message || e) });
            }
            let bundles;
            try {
                bundles = JSON.parse(modelText);
            }
            catch {
                return reply.status(422).send({ errors: ['Model did not return valid JSON'], raw: modelText });
            }
            if (bundles && bundles.bundles)
                bundles = bundles.bundles;
            // 5) Validate & clean
            const vres = validateAndClean(bundles, schema, enriched);
            if (!vres.ok)
                return reply.status(422).send({ errors: vres.errors, warnings: vres.warnings, promptUsed: prompt });
            // 6) Fit all roles per bundle and pick best aggregate
            const font = parsed.data.fontFamily || tpl.fonts?.headline?.family || 'Arial';
            const bundleFits = [];
            for (const b of vres.bundles) {
                bundleFits.push(await fitBundleAllRoles(tpl, b, font, ctx?.locale));
            }
            const best = pickTopBundleByAggregate(bundleFits, vres.scores);
            if (!best)
                return reply.status(422).send({ error: 'No candidates fit', warnings: vres.warnings, promptUsed: prompt });
            const winner = vres.bundles.find(b => b.id === best.bundleId);
            const outPath = `./out_llm_${Date.now()}.png`;
            const bgPath = parsed.data.bg?.value;
            if (!bgPath)
                return reply.status(400).send({ error: 'bg.path required' });
            const meta = await renderBundle(tpl, winner, bgPath, outPath, font, parsed.data.brandColors, ctx?.locale);
            const policy = [{ bundleId: best.bundleId, coherence: vres.scores?.[best.bundleId]?.coherence ?? 0, ctaOk: vres.scores?.[best.bundleId]?.ctaOk ?? true }];
            return reply.send({ outPath: meta.outPath, ctx, policy, meta, promptUsed: prompt });
        }
        catch (e) {
            return reply.code(500).send({ error: 'pipeline-from-url-failed', detail: String(e?.message || e) });
        }
    });
    app.post('/pipeline/batchFromUrl', async (req, reply) => {
        const body = await req.body;
        if (!body?.url)
            return reply.code(400).send({ error: 'url required' });
        if ((!body?.templates || !Array.isArray(body.templates) || body.templates.length === 0) && !body?.templatesGlob)
            return reply.code(400).send({ error: 'templates[] or templatesGlob required' });
        const bgPath = body?.bg?.value;
        if (!bgPath)
            return reply.code(400).send({ error: 'bg.path required' });
        try {
            const manifest = await runBatchFromUrl({
                url: body.url,
                templates: body.templates,
                templatesGlob: body.templatesGlob,
                concurrency: body.concurrency,
                n: body.n,
                k: body.k,
                bgPath,
                brandColors: body.brandColors,
                fontFamily: body.fontFamily,
                outDir: body.outDir
            });
            return reply.send(manifest);
        }
        catch (e) {
            return reply.code(500).send({ error: String(e?.message || e) });
        }
    });
    // Generate directly on a composed PNG (no scraping unless url provided)
    app.post('/pipeline/generateOnComposed', async (req, reply) => {
        try {
            const Body = z.object({
                templateId: z.string(),
                bgPath: z.string(),
                ctx: z.any().optional(),
                url: z.string().url().optional(),
                n: z.number().optional(),
                k: z.number().optional(),
                brandColors: z.array(z.string()).optional(),
                fontFamily: z.string().optional(),
                outDir: z.string().optional(),
                useLocal: z.boolean().optional(),
                twoStage: z.boolean().optional(),
                angleQuotas: z.record(z.number()).optional()
            });
            const p = Body.safeParse(req.body);
            if (!p.success)
                return reply.code(400).send({ error: 'Invalid payload', zodIssues: p.error.issues });
            let ctx = p.data.ctx;
            if (!ctx && p.data.url) {
                const res = await fetchUrl(p.data.url);
                const parsed = parseHTML(res.html, p.data.url);
                ctx = buildCtxFromParsed(parsed);
            }
            if (!ctx)
                return reply.code(400).send({ error: 'ctx or url required' });
            const tpl = await loadTemplateByIdLoose(p.data.templateId);
            // Local generator path (no LLM)
            if (p.data.useLocal) {
                const schema = deriveRoleSchema(tpl);
                const enriched = enrichSchema(tpl, schema, ctx);
                const wl = (enriched.specs.find((s) => s.kind === 'cta')?.semantics?.ctaWhitelist || []);
                const bundles = await generateBundlesLocal(ctx, schema, p.data.n ?? 14, { ctaWhitelist: wl });
                const vres = validateAndClean(bundles, schema, enriched);
                if (!vres.ok)
                    return reply.status(422).send({ errors: vres.errors, warnings: vres.warnings });
                const font = p.data.fontFamily || tpl.fonts?.headline?.family || 'Arial';
                const fits = [];
                for (const b of vres.bundles)
                    fits.push(await fitBundleAllRoles(tpl, b, font, ctx?.locale));
                const best = pickTopBundleByAggregate(fits, vres.scores);
                if (!best)
                    return reply.status(422).send({ error: 'No candidates fit (local)' });
                const winner = vres.bundles.find(b => b.id === best.bundleId);
                const outDir = p.data.outDir;
                const resolvedDir = outDir ? path.resolve(outDir) : null;
                if (resolvedDir) {
                    try {
                        await fs.mkdir(resolvedDir, { recursive: true });
                    }
                    catch { }
                }
                const bgBase = path.basename(p.data.bgPath).replace(/\.[^.]+$/, '');
                const outName = `${tpl.templateId}__${bgBase}.png`;
                const outPath = resolvedDir ? path.join(resolvedDir, outName) : `./out_llm_${Date.now()}.png`;
                const meta = await renderBundle(tpl, winner, p.data.bgPath, outPath, font, p.data.brandColors, ctx?.locale);
                if (resolvedDir) {
                    try {
                        await appendItem(resolvedDir, { templateId: tpl.templateId, bgPath: p.data.bgPath, outPath, chosenBundleId: winner.id, angle: winner.angle, meta, ctxSummary: { product: ctx?.product, audience: ctx?.audience, tone: ctx?.tone, brandVoice: ctx?.brandVoice, locale: ctx?.locale }, rolesUsed: winner?.roles || {} });
                    }
                    catch { }
                }
                const outFinal = meta.outPath || outPath;
                let signed = await uploadGeneratedImage(outFinal, ctx, tpl.templateId);
                return reply.send({ ok: true, outPath: outFinal, url: signed?.signedUrl || `/file?p=${encodeURIComponent(outFinal)}`, storage: signed ? { bucket: signed.bucket, object: signed.object } : null, meta, winnerId: winner.id, policy: { coherence: vres.scores?.[best.bundleId]?.coherence ?? 0 } });
            }
            // Normal LLM path
            try {
                if (p.data.outDir) {
                    try {
                        await fs.mkdir(path.resolve(p.data.outDir), { recursive: true });
                    }
                    catch { }
                }
                const r = await generateOnComposed({ tpl, ctx, bgPath: p.data.bgPath, n: p.data.n, k: p.data.k, brandColors: p.data.brandColors, fontFamily: p.data.fontFamily, outDir: p.data.outDir, twoStage: p.data.twoStage, angleQuotas: p.data.angleQuotas, profileId: p.data.profileId });
                if (r?.ok && r?.outPath) {
                    let signed = await uploadGeneratedImage(r.outPath, ctx, tpl.templateId);
                    return reply.send({ ...r, url: signed?.signedUrl || r.url || null, storage: signed ? { bucket: signed.bucket, object: signed.object } : null });
                }
                return reply.send(r);
            }
            catch (e) {
                const msg = String(e?.message || e);
                // Check profile for fallback permissions
                const profile = loadProfile(p.data.profileId);
                if (profile.twoStage && !profile.allowLocalFallback) {
                    return reply.status(503).send({ error: 'LLM unavailable', generationMode: 'required-twoStage-no-provider' });
                }
                // Fallback to local if allowed
                const schema = deriveRoleSchema(tpl);
                const enriched = enrichSchema(tpl, schema, ctx);
                const wl = (enriched.specs.find((s) => s.kind === 'cta')?.semantics?.ctaWhitelist || []);
                const bundles = await generateBundlesLocal(ctx, schema, p.data.n ?? 14, { ctaWhitelist: wl });
                const vres = validateAndClean(bundles, schema, enriched);
                if (!vres.ok)
                    return reply.status(502).send({ error: 'LLM and local fallback both failed', details: { msg, errors: vres.errors } });
                const font = p.data.fontFamily || tpl.fonts?.headline?.family || 'Arial';
                const fits = [];
                for (const b of vres.bundles)
                    fits.push(await fitBundleAllRoles(tpl, b, font, ctx?.locale));
                const best = pickTopBundleByAggregate(fits, vres.scores);
                if (!best)
                    return reply.status(422).send({ error: 'No candidates fit (fallback)' });
                const winner = vres.bundles.find(b => b.id === best.bundleId);
                const outDir = p.data.outDir;
                const resolvedDir = outDir ? path.resolve(outDir) : null;
                if (resolvedDir) {
                    try {
                        await fs.mkdir(resolvedDir, { recursive: true });
                    }
                    catch { }
                }
                const bgBase = path.basename(p.data.bgPath).replace(/\.[^.]+$/, '');
                const outName = `${tpl.templateId}__${bgBase}.png`;
                const outPath = resolvedDir ? path.join(resolvedDir, outName) : `./out_llm_${Date.now()}.png`;
                const meta = await renderBundle(tpl, winner, p.data.bgPath, outPath, font, p.data.brandColors, ctx?.locale);
                if (resolvedDir) {
                    try {
                        await appendItem(resolvedDir, { templateId: tpl.templateId, bgPath: p.data.bgPath, outPath, chosenBundleId: winner.id, angle: winner.angle, meta, ctxSummary: { product: ctx?.product, audience: ctx?.audience, tone: ctx?.tone, brandVoice: ctx?.brandVoice, locale: ctx?.locale }, rolesUsed: winner?.roles || {} });
                    }
                    catch { }
                }
                const outFinal = meta.outPath || outPath;
                let signed = await uploadGeneratedImage(outFinal, ctx, tpl.templateId);
                return reply.send({ ok: true, outPath: outFinal, url: signed?.signedUrl || `/file?p=${encodeURIComponent(outFinal)}`, storage: signed ? { bucket: signed.bucket, object: signed.object } : null, meta, winnerId: winner.id, policy: { coherence: vres.scores?.[best.bundleId]?.coherence ?? 0 }, warning: 'LLM failed; used local generator', generationMode: 'local' });
            }
        }
        catch (e) {
            const msg = String(e?.message || e);
            const hint = /LLM_PROVIDER/i.test(msg) ? ' Set LLM_PROVIDER and API key in .env' : '';
            return reply.code(500).send({ error: msg + hint });
        }
    });
    // Batch: many composed PNGs, one per job
    app.post('/pipeline/batchFromComposed', async (req, reply) => {
        const Body = z.object({
            jobs: z.array(z.object({
                templateId: z.string(),
                bgPath: z.string(),
                url: z.string().url().optional(),
                ctx: z.any().optional(),
                brandColors: z.array(z.string()).optional(),
                fontFamily: z.string().optional()
            })),
            n: z.number().optional(),
            k: z.number().optional()
        });
        const p = Body.safeParse(req.body);
        if (!p.success)
            return reply.code(400).send({ error: 'Invalid payload', zodIssues: p.error.issues });
        // Capture optional params outside the worker to avoid TS narrow issues
        const globalN = p.data.n;
        const globalK = p.data.k;
        // Load font preference
        let settings = {};
        try {
            settings = JSON.parse(await fs.readFile(settingsPath, 'utf-8'));
        }
        catch { }
        const curatedFonts = ['Montserrat', 'Poppins', 'Playfair Display', 'Bebas Neue', 'Oswald', 'Raleway', 'Inter', 'Lato', 'Rubik', 'Nunito', 'DM Sans', 'Kanit', 'Archivo Black', 'Barlow', 'Exo 2', 'Source Sans 3', 'Pacifico'];
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const runDir = path.resolve(`./runs/${ts}`);
        await fs.mkdir(runDir, { recursive: true });
        // Concurrency-limited processing
        const jobs = p.data.jobs;
        const limit = Math.max(1, parseInt(process.env.OVERLAY_CONCURRENCY || '2', 10));
        let idxJ = 0;
        const resultsArr = new Array(jobs.length);
        async function runWorker() {
            while (true) {
                const i = idxJ++;
                if (i >= jobs.length)
                    break;
                const j = jobs[i];
                try {
                    let ctx = j.ctx;
                    if (!ctx && j.url) {
                        const res = await fetchUrl(j.url);
                        const parsed = parseHTML(res.html, j.url);
                        ctx = buildCtxFromParsed(parsed);
                        if (p.data.enrich) {
                            try {
                                ctx.enriched = await enrichCtx(ctx, { cacheKey: res.finalUrl || ctx?.product?.name || undefined });
                                // Persist once per run (best-effort)
                                try {
                                    const outP = path.join(runDir, 'ctx.enriched.json');
                                    if (!fsSync.existsSync(outP)) {
                                        await fs.writeFile(outP, JSON.stringify({ url: res.finalUrl, ctx }, null, 2), 'utf-8');
                                    }
                                }
                                catch { }
                            }
                            catch { }
                        }
                    }
                    if (!ctx)
                        throw new Error('ctx or url required');
                    const tpl = await loadTemplateByIdLoose(j.templateId);
                    try {
                        const st = await fs.stat(j.bgPath);
                        console.log(`[overlay] template=${tpl.templateId} bgPath=${j.bgPath} size=${st.size}`);
                    }
                    catch (e) {
                        console.warn(`[overlay] bgPath missing or unreadable: ${j.bgPath} err=${String(e?.message || e)}`);
                    }
                    // Choose font: job-specified > settings.preferredFont (if set) > random (if randomFont true) > template fallback
                    let chosenFont = j.fontFamily;
                    if (!chosenFont) {
                        const pref = settings?.preferredFont;
                        const rnd = !!settings?.randomFont;
                        if (pref && curatedFonts.includes(pref))
                            chosenFont = pref;
                        else if (rnd) {
                            chosenFont = curatedFonts[Math.floor(Math.random() * curatedFonts.length)];
                        }
                    }
                    const r = await generateOnComposed({ tpl, ctx, bgPath: j.bgPath, n: globalN, k: globalK, brandColors: j.brandColors, fontFamily: chosenFont, twoStage: p.data.twoStage, angleQuotas: p.data.angleQuotas, profileId: p.data.profileId, outDir: runDir });
                    if (r.ok && r.outPath) {
                        const base = path.basename(j.bgPath).replace(/\.[^.]+$/, '');
                        const destPng = path.join(runDir, `${tpl.templateId}__${base}.png`);
                        try {
                            await fs.copyFile(r.outPath, destPng);
                        }
                        catch { }
                        // Upload to Supabase (generated bucket) and sign URL
                        let signed = await uploadGeneratedImage(destPng, ctx, tpl.templateId);
                        const meta = r.meta || {};
                        const rolesUsed = r.rolesUsed || r.rolePayloadUsed?.roles || {};
                        const perRoleFitRaw = r.perRoleFit || {};
                        const perRoleFit = {};
                        for (const [role, arr] of Object.entries(perRoleFitRaw)) {
                            perRoleFit[role] = arr.map((it) => ({ fontPx: it.font_px ?? it.fontPx ?? 0, lines: it.lines ?? 0, widthLimited: !!it.widthLimited }));
                        }
                        const summary = {
                            winnerId: r.winnerId,
                            rolesUsed,
                            rolePayloadUsed: r.rolePayloadUsed,
                            perRoleFit,
                            contrast: meta?.headlineMeta?.contrastRatio ?? meta?.contrastRatio,
                            scrim: meta?.appliedScrim ?? meta?.scrimType ?? null,
                            policy: r.policy || {},
                            warnings: r.warnings || [],
                            rawBundleCount: r.rawBundleCount ?? null,
                            dedupBundleCount: r.dedupBundleCount ?? null,
                            trace: r.trace || null,
                            rankTrace: r.rankTrace ?? []
                        };
                        await fs.writeFile(path.join(runDir, `${tpl.templateId}.json`), JSON.stringify(summary, null, 2), 'utf-8');
                        // Save per-winner trace too
                        try {
                            const tracePath = path.join(runDir, `${tpl.templateId}.${String(r.winnerId || 'win')}.trace.json`);
                            await fs.writeFile(tracePath, JSON.stringify(r.trace || r.rankTrace || [], null, 2), 'utf-8');
                        }
                        catch { }
                        resultsArr[i] = { templateId: tpl.templateId, ...r, outPath: destPng, bgPathUsed: j.bgPath, url: signed?.signedUrl || r.url || null, storage: signed ? { bucket: signed.bucket, object: signed.object } : null };
                    }
                    else {
                        resultsArr[i] = { templateId: tpl.templateId, ...r, bgPathTried: j.bgPath };
                    }
                }
                catch (e) {
                    resultsArr[i] = { templateId: j.templateId, ok: false, error: String(e?.message || e) };
                }
            }
        }
        const workers2 = Array.from({ length: limit }, () => runWorker());
        await Promise.all(workers2);
        const results = resultsArr.filter(Boolean);
        // Write summary.json aggregating results
        const summary = { ok: true, count: results.length, results };
        try {
            await fs.writeFile(path.join(runDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf-8');
        }
        catch { }
        return reply.send({ ...summary, runDir });
    });
    // One-call pipeline: generate → fit (+compress) → select → render
    app.post('/pipeline/run', async (req, reply) => {
        const body = await req.body;
        const schemaZ = z.object({
            template: tplSchema,
            bg: z.object({ kind: z.enum(['path', 'url']), value: z.string() }),
            ctx: z.any(),
            n: z.number().optional(),
            k: z.number().optional(),
            brandColors: z.array(z.string()).optional(),
            fontFamily: z.string().optional(),
            options: z.object({ stroke: z.object({ color: z.string().optional(), widthPx: z.number().optional() }).optional(), scrim: z.object({ maxOpacity: z.number().optional() }).optional() }).optional(),
            quotas: z.any().optional(),
            lambda: z.number().optional(),
            brandId: z.string().optional()
        });
        const parsed = schemaZ.safeParse(body);
        if (!parsed.success)
            return reply.code(400).send({ error: 'Invalid payload' });
        const tpl = parsed.data.template;
        const roleSchema = deriveRoleSchema(tpl);
        const scoringRole = roleSchema.specs.find(s => s.role === 'headline')?.role || roleSchema.specs[0]?.role;
        if (!scoringRole)
            return reply.code(400).send({ error: 'No roles found' });
        const headlineArea = tpl.areas.find((a) => a.role === scoringRole);
        if (!headlineArea)
            return reply.code(400).send({ error: `Area not found for role ${scoringRole}` });
        const bundles = await generateBundles(parsed.data.ctx, roleSchema, parsed.data.n ?? 14);
        const font = parsed.data.fontFamily || tpl.fonts[scoringRole]?.family || 'Arial';
        const upper = upperBoundForArea(headlineArea);
        const cands = [];
        const byId = new Map();
        for (const b of bundles) {
            const roleVal = b.roles[scoringRole];
            const text = Array.isArray(roleVal) ? String(roleVal[0] || '') : String(roleVal || '');
            if (!text)
                continue;
            const rep = await fitText(text, headlineArea, font, tpl.pixelSize?.w, { locale: parsed.data.ctx.locale });
            if (!rep.fits)
                continue; // cannot fit even at minFont/maxLines
            byId.set(b.id, { text, rep });
            cands.push({ id: b.id, bundleId: b.id, angle: b.angle, text, fit: { font_px: rep.font_px || 0, lines: rep.lines || (rep.lineBreaks ? rep.lineBreaks.length : 0) || 0, penalties: rep.used_hyphenation ? 0.1 : 0, used_hyphenation: rep.used_hyphenation } });
        }
        if (cands.length === 0)
            return reply.code(422).send({ error: 'No fitting candidates' });
        const selected = await selectTop(cands, {
            k: parsed.data.k ?? 3,
            key: { brandId: parsed.data.brandId || 'demoBrand', templateId: tpl.templateId },
            quotas: parsed.data.quotas,
            lambda: parsed.data.lambda
        });
        const best = selected[0];
        const bestData = byId.get(best.id);
        const outPath = path.resolve(`out_pipeline_${Date.now()}.png`);
        const bgPath = parsed.data.bg.kind === 'path' ? parsed.data.bg.value : await downloadToTemp(parsed.data.bg.value);
        const meta = await renderText(bgPath, outPath, headlineArea, bestData.text, font, bestData.rep, parsed.data.brandColors, parsed.data.options);
        return {
            outPath,
            meta,
            scoringRole,
            topK: selected.map(s => ({ id: s.id, angle: s.angle, font_px: s.fit.font_px, lines: s.fit.lines, text: s.text })),
            prompt: buildBundlePrompt(parsed.data.ctx, roleSchema)
        };
    });
    // Local pipeline: local generator → fit (+optional compress) → select → render
    app.post('/pipeline/runLocal', async (req, reply) => {
        const body = await req.body;
        const schemaZ = z.object({
            template: tplSchema,
            bg: z.object({ kind: z.enum(['path', 'url']), value: z.string() }),
            ctx: z.any(),
            n: z.number().optional(),
            k: z.number().optional(),
            brandColors: z.array(z.string()).optional(),
            fontFamily: z.string().optional(),
            options: z.object({ stroke: z.object({ color: z.string().optional(), widthPx: z.number().optional() }).optional(), scrim: z.object({ maxOpacity: z.number().optional() }).optional() }).optional(),
            quotas: z.any().optional(),
            lambda: z.number().optional(),
            brandId: z.string().optional()
        });
        const parsed = schemaZ.safeParse(body);
        if (!parsed.success)
            return reply.code(400).send({ error: 'Invalid payload' });
        const tpl = parsed.data.template;
        const roleSchema = deriveRoleSchema(tpl);
        const scoringRole = roleSchema.specs.find(s => s.role === 'headline')?.role || roleSchema.specs[0]?.role;
        if (!scoringRole)
            return reply.code(400).send({ error: 'No roles found' });
        const headlineArea = tpl.areas.find((a) => a.role === scoringRole);
        if (!headlineArea)
            return reply.code(400).send({ error: `Area not found for role ${scoringRole}` });
        // Generate locally (respect CTA whitelist inferred from template/ctx)
        const enriched = enrichSchema(tpl, roleSchema, parsed.data.ctx);
        const wl = (enriched.specs.find((s) => s.kind === 'cta')?.semantics?.ctaWhitelist || []);
        const bundles = await generateBundlesLocal(parsed.data.ctx, roleSchema, parsed.data.n ?? 14, { ctaWhitelist: wl });
        const font = parsed.data.fontFamily || tpl.fonts[scoringRole]?.family || 'Arial';
        const upper = upperBoundForArea(headlineArea);
        const cands = [];
        const byId = new Map();
        for (const b of bundles) {
            const roleVal = b.roles[scoringRole];
            const text0 = Array.isArray(roleVal) ? String(roleVal[0] || '') : String(roleVal || '');
            if (!text0)
                continue;
            const rep = await fitText(text0, headlineArea, font, tpl.pixelSize?.w, { locale: parsed.data.ctx.locale });
            if (!rep.fits)
                continue;
            byId.set(b.id, { text: text0, rep });
            cands.push({ id: b.id, bundleId: b.id, angle: b.angle, text: text0, fit: { font_px: rep.font_px || 0, lines: rep.lines || (rep.lineBreaks ? rep.lineBreaks.length : 0) || 0, penalties: rep.used_hyphenation ? 0.1 : 0, used_hyphenation: rep.used_hyphenation } });
        }
        if (cands.length === 0)
            return reply.code(422).send({ error: 'No fitting candidates' });
        const selected = await selectTop(cands, {
            k: parsed.data.k ?? 3,
            key: { brandId: parsed.data.brandId || 'demoBrand', templateId: tpl.templateId },
            quotas: parsed.data.quotas,
            lambda: parsed.data.lambda
        });
        const best = selected[0];
        const bestData = byId.get(best.id);
        const outPath = path.resolve(`out_pipeline_${Date.now()}.png`);
        const bgPath = parsed.data.bg.kind === 'path' ? parsed.data.bg.value : await downloadToTemp(parsed.data.bg.value);
        const meta = await renderText(bgPath, outPath, headlineArea, bestData.text, font, bestData.rep, parsed.data.brandColors, parsed.data.options);
        return {
            outPath,
            meta,
            scoringRole,
            topK: selected.map(s => ({ id: s.id, angle: s.angle, font_px: s.fit.font_px, lines: s.fit.lines, text: s.text })),
            prompt: null
        };
    });
    // List SVG templates
    app.get('/svg/list', async (req, reply) => {
        try {
            const dir = req.query.dir || '../AdCreator2/backend/templates/svgs';
            const resolvedDir = path.resolve(dir);
            const files = await fs.readdir(resolvedDir, { withFileTypes: true });
            const svgFiles = files
                .filter((f) => f.isFile() && f.name.endsWith('.svg'))
                .map((f) => ({
                name: f.name,
                path: path.join(resolvedDir, f.name)
            }));
            return reply.send({ dir: resolvedDir, files: svgFiles });
        }
        catch (e) {
            return reply.code(500).send({ error: 'Failed to list SVG files', detail: String(e?.message || e) });
        }
    });
    // Generate from SVG template with text overlay
    app.post('/pipeline/generateFromSVG', async (req, reply) => {
        try {
            const Body = z.object({
                svgPath: z.string(),
                templateId: z.string(),
                ctx: z.any(),
                brandColors: z.record(z.string()).optional(),
                logo: z.string().optional(),
                productImage: z.string().optional(),
                placeholderMappings: z.record(z.string()).optional(),
                n: z.number().optional(),
                k: z.number().optional(),
                textColors: z.array(z.string()).optional(),
                fontFamily: z.string().optional(),
                outDir: z.string().optional(),
                useLocal: z.boolean().optional(),
                twoStage: z.boolean().optional()
            });
            const p = Body.safeParse(req.body);
            if (!p.success)
                return reply.code(400).send({ error: 'Invalid payload', zodIssues: p.error.issues });
            const tpl = await loadTemplateByIdLoose(p.data.templateId);
            if (p.data.outDir) {
                try {
                    await fs.mkdir(path.resolve(p.data.outDir), { recursive: true });
                }
                catch { }
            }
            const result = await generateFromSVG({
                svgPath: p.data.svgPath,
                tpl,
                ctx: p.data.ctx,
                brandColors: p.data.brandColors,
                logo: p.data.logo,
                productImage: p.data.productImage,
                placeholderMappings: p.data.placeholderMappings,
                n: p.data.n,
                k: p.data.k,
                textColors: p.data.textColors,
                fontFamily: p.data.fontFamily,
                outDir: p.data.outDir,
                useLocal: p.data.useLocal
            });
            if (result?.ok && result?.outPath) {
                let signed = await uploadGeneratedImage(result.outPath, p.data.ctx, tpl.templateId);
                return reply.send({ ...result, url: signed?.signedUrl || result.url || null, storage: signed ? { bucket: signed.bucket, object: signed.object } : null });
            }
            return reply.send(result);
        }
        catch (e) {
            return reply.code(500).send({ error: 'SVG processing failed', detail: String(e?.message || e) });
        }
    });
    // Optional compressor endpoint
    app.post('/compress', async (req, reply) => {
        const body = await req.body;
        const parsed = z.object({ text: z.string(), targetGraphemes: z.number(), mustInclude: z.array(z.string()).optional(), mustAvoid: z.array(z.string()).optional() }).safeParse(body);
        if (!parsed.success)
            return reply.code(400).send({ error: 'Invalid payload' });
        const { compressToBudget } = await import('./compress.js');
        const res = await compressToBudget(parsed.data.text, { targetGraphemes: parsed.data.targetGraphemes, mustInclude: parsed.data.mustInclude, mustAvoid: parsed.data.mustAvoid });
        return res;
    });
    // Register image analysis endpoints
    const { registerImageAnalysisEndpoints } = await import('./image-analysis-endpoints.js');
    registerImageAnalysisEndpoints(app);
    // Simple mapping store on disk
    const mappingsDir = path.resolve('mappings');
    // Backward-compat: some previous runs used CWD text-overlay/dist which wrote to dist/mappings
    const altMappingsDir = path.resolve('dist/mappings');
    try {
        await fs.mkdir(mappingsDir, { recursive: true });
    }
    catch { }
    // Save mapping from onboarding (single source of truth)
    app.post('/mapping/save', async (req, reply) => {
        try {
            const body = await req.body;
            const mapping = body?.mapping;
            if (!mapping?.images || !mapping?.colors)
                return reply.code(400).send({ error: 'Invalid mapping' });
            const id = `mapping_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
            const out = { id, mapping };
            await fs.writeFile(path.join(mappingsDir, `${id}.json`), JSON.stringify(out, null, 2), 'utf-8');
            return reply.send({ ok: true, id });
        }
        catch (e) {
            return reply.code(500).send({ error: 'Failed to save mapping', detail: String(e?.message || e) });
        }
    });
    app.get('/mapping/:id', async (req, reply) => {
        const id = String(req.params?.id || '');
        if (!id)
            return reply.code(400).send({ error: 'id required' });
        try {
            const primaryPath = path.join(mappingsDir, `${id}.json`);
            const raw = await fs.readFile(primaryPath, 'utf-8');
            const data = JSON.parse(raw);
            return reply.send({ ok: true, ...data });
        }
        catch {
            // Try legacy location
            try {
                const legacyPath = path.join(altMappingsDir, `${id}.json`);
                const raw2 = await fs.readFile(legacyPath, 'utf-8');
                const data2 = JSON.parse(raw2);
                return reply.send({ ok: true, ...data2 });
            }
            catch {
                return reply.code(404).send({ error: 'mapping not found' });
            }
        }
    });
    // Compose backgrounds from SVGs with a mapping
    app.post('/compose/svgBatch', async (req, reply) => {
        try {
            const Body = z.object({
                mappingId: z.string().optional(),
                mapping: z.any().optional(),
                templateNames: z.array(z.string()).optional(),
                force: z.boolean().optional(),
                useCache: z.boolean().optional()
            });
            const p = Body.safeParse(req.body);
            if (!p.success)
                return reply.code(400).send({ error: 'Invalid payload' });
            // Capture parsed payload outside nested closures so TS knows it's defined
            const payload = p.data;
            const payloadUseCache = payload?.useCache;
            const payloadForce = payload?.force;
            // Resolve mapping
            let mapping = p.data.mapping;
            if (!mapping && p.data.mappingId) {
                try {
                    const primary = path.join(mappingsDir, `${p.data.mappingId}.json`);
                    const raw = await fs.readFile(primary, 'utf-8');
                    mapping = JSON.parse(raw).mapping;
                }
                catch {
                    // Try legacy location from earlier runs
                    try {
                        const legacy = path.join(altMappingsDir, `${p.data.mappingId}.json`);
                        const raw2 = await fs.readFile(legacy, 'utf-8');
                        mapping = JSON.parse(raw2).mapping;
                    }
                    catch {
                        return reply.code(404).send({ error: 'mapping not found' });
                    }
                }
            }
            if (!mapping?.images || !mapping?.colors)
                return reply.code(400).send({ error: 'mapping missing images/colors' });
            // Helper: download http(s) URLs to local files and rewrite mapping to /file?p= paths
            async function fetchBuffer(url) {
                return new Promise((resolve, reject) => {
                    try {
                        const mod = url.startsWith('https') ? https : http;
                        const req = mod.get(url, { timeout: 15000 }, (res) => {
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
                                resolve({ buffer: buf });
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
            // Where SVGs live (AdCreator2 repo path)
            const svgsDir = path.resolve('../AdCreator2/backend/templates/svgs');
            let entries = [];
            try {
                entries = await fs.readdir(svgsDir, { withFileTypes: true });
            }
            catch {
                return reply.code(500).send({ error: 'Failed to read SVG dir', detail: svgsDir });
            }
            let files = entries.filter((e) => e.isFile() && e.name.endsWith('.svg')).map((e) => e.name);
            if (payload.templateNames && payload.templateNames.length > 0) {
                const want = new Set(p.data.templateNames);
                files = files.filter(f => want.has(f));
            }
            if (files.length === 0)
                return reply.send({ ok: true, count: 0, results: [], runDir: null });
            // Create run dir
            const ts = new Date().toISOString().replace(/[:.]/g, '-');
            const runDir = path.resolve('runs', `compose-${ts}`);
            await fs.mkdir(runDir, { recursive: true });
            const { composeFromSVG } = await import('./pipeline/composeFromSVG.js');
            const results = [];
            // Optional disk cache for composed PNGs (huge win for iteration)
            // Include a fingerprint of the mapping so updated assets invalidate cache
            let cacheDir = null;
            try {
                const crypto = await import('crypto');
                const fingerprint = crypto.createHash('sha1').update(JSON.stringify(mapping)).digest('hex').slice(0, 10);
                if (payload.mappingId)
                    cacheDir = path.resolve('runs', 'compose-cache', `${payload.mappingId}-${fingerprint}`);
            }
            catch {
                cacheDir = payload.mappingId ? path.resolve('runs', 'compose-cache', payload.mappingId) : null;
            }
            if (cacheDir) {
                try {
                    await fs.mkdir(cacheDir, { recursive: true });
                }
                catch { }
            }
            // Materialize mapping http assets to local files under cache or run dir
            async function materializeMapping(m, baseDir) {
                const out = JSON.parse(JSON.stringify(m || {}));
                const assetsDir = path.join(baseDir, 'assets');
                try { await fs.mkdir(assetsDir, { recursive: true }); } catch {}
                const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
                const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
                function parseSupabase(u) {
                    try {
                        const url = new URL(u);
                        const origin = `${url.protocol}//${url.host}`;
                        const p = url.pathname; // /storage/v1/object/<variant>/<bucket>/<path> or /storage/v1/object/<bucket>/<path>
                        const parts = p.split('/').filter(Boolean);
                        const i = parts.findIndex(s => s === 'object');
                        if (i === -1 || i + 1 >= parts.length) return null;
                        let j = i + 1;
                        let variant = parts[j];
                        let bucket, obj;
                        if (variant === 'public' || variant === 'sign') {
                            bucket = parts[j + 1];
                            obj = parts.slice(j + 2).join('/');
                        }
                        else {
                            bucket = parts[j];
                            obj = parts.slice(j + 1).join('/');
                        }
                        if (!bucket || !obj) return null;
                        return { bucket, object: obj, origin };
                    }
                    catch { return null; }
                }
                async function fetchBufferAuth(u) {
                    return new Promise((resolve, reject) => {
                        try {
                            let url = new URL(u);
                            const opts = { method: 'GET', headers: {} };
                            const parsed = parseSupabase(u);
                            if (parsed && SUPABASE_SERVICE_KEY) {
                                // Use authenticated endpoint regardless of original variant
                                const base = (SUPABASE_URL || parsed.origin).replace(/\/$/, '');
                                url = new URL(`${base}/storage/v1/object/${parsed.bucket}/${parsed.object}`);
                                opts.headers['Authorization'] = `Bearer ${SUPABASE_SERVICE_KEY}`;
                                opts.headers['apikey'] = SUPABASE_SERVICE_KEY;
                            }
                            const lib = url.protocol === 'https:' ? https : http;
                            const req = lib.request(url, opts, (res) => {
                                if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                                    fetchBufferAuth(res.headers.location).then(resolve, reject);
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
                                res.on('end', () => resolve({ buffer: Buffer.concat(chunks) }));
                            });
                            req.on('error', reject);
                            req.end();
                        }
                        catch (e) { reject(e); }
                    });
                }
                async function materializeOne(u) {
                    if (!u || typeof u !== 'string') return u;
                    if (!/^https?:\/\//i.test(u)) return u;
                    try {
                        const crypto = await import('crypto');
                        const hash = crypto.createHash('sha1').update(u).digest('hex').slice(0, 12);
                        const ext = (() => {
                            const e = (u.split('?')[0].split('#')[0].split('.').pop() || '').toLowerCase();
                            if (!e) return 'png';
                            if (['jpg','jpeg','png','webp','gif'].includes(e)) return e === 'jpg' ? 'jpeg' : e;
                            return 'png';
                        })();
                        const dest = path.join(assetsDir, `${hash}.${ext}`);
                        try { await fs.access(dest); } catch {
                            const { buffer } = await fetchBufferAuth(u);
                            await fs.writeFile(dest, buffer);
                        }
                        return `/file?p=${encodeURIComponent(dest)}`;
                    } catch (e) {
                        try { console.warn('[compose] materialize failed', u, String(e?.message || e)); } catch {}
                        return u; // fall back to original
                    }
                }
                const imgs = out?.images || {};
                if (imgs.logo) imgs.logo = await materializeOne(imgs.logo);
                const mapArr = async (arr) => Array.isArray(arr) ? await Promise.all(arr.map(materializeOne)) : arr;
                imgs.products = await mapArr(imgs.products);
                imgs.screenshots = await mapArr(imgs.screenshots);
                imgs.backgrounds = await mapArr(imgs.backgrounds);
                out.images = imgs;
                return out;
            }
            // Simple promise pool for concurrency control
            const limit = Math.max(1, parseInt(process.env.COMPOSE_CONCURRENCY || '3', 10));
            let idx = 0;
            const out = new Array(files.length);
            async function worker(wid) {
                while (true) {
                    const i = idx++;
                    if (i >= files.length)
                        break;
                    const name = files[i];
                    try {
                        const svgPath = path.join(svgsDir, name);
                        // Check cache
                        const targetName = `${name.replace(/\.svg$/i, '')}.png`;
                        const cached = cacheDir ? path.join(cacheDir, targetName) : null;
                        if (cached && ((payloadUseCache ?? !payloadForce) ?? true)) {
                            try {
                                await fs.access(cached);
                                // Invalidate cache if SVG is newer than cached PNG
                                try {
                                    const [stSvg, stPng] = await Promise.all([fs.stat(svgPath), fs.stat(cached)]);
                                    if (stSvg.mtimeMs <= stPng.mtimeMs) {
                                        out[i] = { name, ok: true, outPath: cached, url: `/file?p=${encodeURIComponent(cached)}`, cached: true };
                                        continue;
                                    }
                                }
                                catch { }
                            }
                            catch { }
                        }
                        const outPngPath = path.join(runDir, targetName);
                        // For each SVG, materialize mapping assets to local files (so downstream inliner can always read)
                        const mappingForThis = await materializeMapping(mapping, cacheDir || runDir);
                        const r = await composeFromSVG({ svgPath, mapping: mappingForThis, outPngPath });
                        // Save to cache as well
                        if (cached) {
                            try {
                                await fs.mkdir(path.dirname(cached), { recursive: true });
                                await fs.copyFile(r.outPath, cached);
                            }
                            catch { }
                        }
                        out[i] = { name, ok: true, outPath: r.outPath, url: `/file?p=${encodeURIComponent(r.outPath)}` };
                    }
                    catch (e) {
                        out[i] = { name, ok: false, error: String(e?.message || e) };
                    }
                }
            }
            const workers = Array.from({ length: limit }, (_, k) => worker(k));
            await Promise.all(workers);
            const resultsOrdered = out.filter(Boolean);
            return reply.send({ ok: true, count: resultsOrdered.length, results: resultsOrdered, runDir });
        }
        catch (e) {
            try {
                console.error('[compose/svgBatch] failed:', e?.stack || e?.message || String(e));
            }
            catch { }
            return reply.code(500).send({ error: 'compose failed', detail: String(e?.message || e) });
        }
    });
    return app;
}
if (process.argv[1] && import.meta.url.endsWith('api.ts')) {
    // Running via ts-node
}
// If executed from compiled JS
if (process.argv[1] && (process.argv[1].endsWith('api.js') || process.argv[1].endsWith('api.ts'))) {
    (async () => {
        try {
            const port = parseInt(process.env.PORT || '3000', 10);
            const host = '0.0.0.0';
            const app = await createServer();
            const addr = await app.listen({ port, host });
            const version = await getPkgVersion();
            console.log(`[api] ${addr} version=${version}`);
        }
        catch (err) {
            console.error(err);
            process.exit(1);
        }
    })();
}
