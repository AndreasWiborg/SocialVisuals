#!/usr/bin/env node
// Compose a single (or multiple) SVGs using a saved mapping, materializing
// Supabase (or any http/https) image URLs to local files first, then invoking
// the composer so rendering needs no network.

import path from 'path'
import fs from 'fs/promises'
import fss from 'fs'
import https from 'https'
import http from 'http'
import { fileURLToPath } from 'url'
import { composeFromSVG } from '../dist/pipeline/composeFromSVG.js'

// Lightweight .env loader
function loadEnvFile(p) {
  try {
    const txt = fss.readFileSync(p, 'utf-8')
    for (const raw of txt.split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
      if (!m) continue
      let val = m[2]
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1)
      if (process.env[m[1]] == null) process.env[m[1]] = val
    }
  } catch {}
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function usage() {
  console.log(`Usage: node scripts/compose-one.js --mapping-id <id> [--svg <file.svg>] [--list]`)
  console.log(`
  --mapping-id   Required. ID of a saved mapping under text-overlay/mappings
  --svg          Optional. Specific SVG filename to compose (located under ../AdCreator2/backend/templates/svgs)
  --list         List available SVGs and exit
`)
}

function parseArgs(argv) {
  const out = { mappingId: '', svg: '', list: false, supabaseUrl: '', serviceKey: '' }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--mapping-id') { out.mappingId = argv[++i] }
    else if (a === '--svg') { out.svg = argv[++i] }
    else if (a === '--list') { out.list = true }
    else if (a === '--supabase-url') { out.supabaseUrl = argv[++i] }
    else if (a === '--service-key') { out.serviceKey = argv[++i] }
  }
  return out
}

async function ensureDir(p) { await fs.mkdir(p, { recursive: true }).catch(() => {}) }

async function fetchBufferAuth(u, supabaseBase, serviceKey) {
  return new Promise((resolve, reject) => {
    try {
      let url = new URL(u)
      const opts = { method: 'GET', headers: {} }
      // If looks like Supabase Storage URL and we have service key, rewrite to authenticated endpoint
      try {
        const parts = url.pathname.split('/').filter(Boolean)
        const i = parts.findIndex(s => s === 'object')
        if (i >= 0) {
          let j = i + 1
          let bucket, obj
          if (parts[j] === 'public' || parts[j] === 'sign') {
            bucket = parts[j + 1]
            obj = parts.slice(j + 2).join('/')
          } else {
            bucket = parts[j]
            obj = parts.slice(j + 1).join('/')
          }
          if (bucket && obj && serviceKey) {
            const base = (supabaseBase || `${url.protocol}//${url.host}`).replace(/\/$/, '')
            url = new URL(`${base}/storage/v1/object/${bucket}/${obj}`)
            opts.headers['Authorization'] = `Bearer ${serviceKey}`
            opts.headers['apikey'] = serviceKey
          }
        }
      } catch {}
      const lib = url.protocol === 'https:' ? https : http
      const req = lib.request(url, opts, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchBufferAuth(res.headers.location, supabaseBase, serviceKey).then(resolve, reject)
          res.resume(); return
        }
        if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); res.resume(); return }
        const chunks = []
        res.on('data', (d) => chunks.push(d))
        res.on('end', () => resolve({ buffer: Buffer.concat(chunks) }))
      })
      req.on('error', reject)
      req.end()
    } catch (e) { reject(e) }
  })
}

async function materializeMapping(mapping, baseDir, supabaseBase, serviceKey, log = console) {
  const out = JSON.parse(JSON.stringify(mapping || {}))
  const assetsDir = path.join(baseDir, 'assets')
  await ensureDir(assetsDir)
  async function materializeOne(u) {
    if (!u || typeof u !== 'string') return u
    if (!/^https?:\/\//i.test(u)) return u
    const crypto = await import('crypto')
    const hash = crypto.createHash('sha1').update(u).digest('hex').slice(0, 12)
    const ext = (() => {
      const e = (u.split('?')[0].split('#')[0].split('.').pop() || '').toLowerCase()
      if (!e) return 'png'
      if (['jpg','jpeg','png','webp','gif'].includes(e)) return e === 'jpg' ? 'jpeg' : e
      return 'png'
    })()
    const dest = path.join(assetsDir, `${hash}.${ext}`)
    try { await fs.access(dest) } catch {
      try {
        const { buffer } = await fetchBufferAuth(u, supabaseBase, serviceKey)
        await fs.writeFile(dest, buffer)
        try { log.log(`[mat] ${u} -> ${dest} (${buffer.length}b)`) } catch {}
      } catch (e) {
        try { log.warn(`[mat] FAILED ${u}: ${e?.message || e}`) } catch {}
        return u // fallback
      }
    }
    return `/file?p=${encodeURIComponent(dest)}`
  }
  const imgs = out?.images || {}
  if (imgs.logo) imgs.logo = await materializeOne(imgs.logo)
  const mapArr = async (arr) => Array.isArray(arr) ? await Promise.all(arr.map(materializeOne)) : arr
  imgs.products = await mapArr(imgs.products)
  imgs.screenshots = await mapArr(imgs.screenshots)
  imgs.backgrounds = await mapArr(imgs.backgrounds)
  out.images = imgs
  return out
}

async function main() {
  // Load env from common locations
  loadEnvFile(path.resolve(process.cwd(), '.env'))
  loadEnvFile(path.resolve(process.cwd(), '.env.local'))
  loadEnvFile(path.resolve(__dirname, '../../.env'))
  loadEnvFile(path.resolve(__dirname, '../../.env.local'))
  const args = parseArgs(process.argv)
  const svgsDir = path.resolve(__dirname, '../../AdCreator2/backend/templates/svgs')
  if (args.list) {
    const entries = fss.existsSync(svgsDir) ? await fs.readdir(svgsDir) : []
    console.log(entries.filter(n => n.toLowerCase().endsWith('.svg')).join('\n'))
    process.exit(0)
  }
  if (!args.mappingId) { usage(); process.exit(2) }
  const mappingPath = path.resolve(__dirname, `../mappings/${args.mappingId}.json`)
  if (!fss.existsSync(mappingPath)) { console.error('Mapping not found:', mappingPath); process.exit(2) }
  const raw = await fs.readFile(mappingPath, 'utf-8')
  const wrap = JSON.parse(raw)
  const mapping = wrap?.mapping || wrap

  const SUPABASE_URL = args.supabaseUrl || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const SERVICE_KEY = args.serviceKey || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || ''
  if (!SERVICE_KEY) {
    console.warn('[compose-one] Warning: SUPABASE_SERVICE_ROLE_KEY not set; private assets will likely 400')
  }

  // Create run dir
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const runDir = path.resolve(__dirname, `../runs/compose-cli-${ts}`)
  await ensureDir(runDir)

  // Determine SVG files
  let files = []
  if (args.svg) {
    files = [args.svg]
  } else {
    const entries = fss.existsSync(svgsDir) ? await fs.readdir(svgsDir) : []
    files = entries.filter(n => n.toLowerCase().endsWith('.svg'))
  }
  if (files.length === 0) { console.error('No SVGs found'); process.exit(1) }

  // Compose each
  for (const name of files) {
    const svgPath = path.join(svgsDir, name)
    const targetName = `${name.replace(/\.svg$/i, '')}.png`
    const outPngPath = path.join(runDir, targetName)
    console.log(`[compose-one] SVG: ${svgPath}`)
    const mat = await materializeMapping(mapping, runDir, SUPABASE_URL, SERVICE_KEY, console)
    const r = await composeFromSVG({ svgPath, mapping: mat, outPngPath })
    console.log(`[compose-one] OK -> ${r.outPath}`)
  }
  console.log('Done. Run dir:', runDir)
}

main().catch((e) => { console.error(e); process.exit(1) })
