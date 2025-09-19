#!/usr/bin/env node
// Extract original source files from Next.js server build outputs where
// source maps are inlined as data URLs containing sourcesContent.
//
// Scans: frontend/.next/server/app (all .js files)
// Writes to: recovered_from_next/frontend/<relative path>
// Skips node_modules entries.

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const INPUT_DIRS = [
  path.join(ROOT, 'frontend', '.next', 'server', 'app'),
  path.join(ROOT, 'frontend', '.next', 'cache', 'webpack', 'server-development'),
  path.join(ROOT, 'frontend', '.next', 'cache', 'webpack', 'client-development')
];
const OUTPUT_ROOT = path.join(ROOT, 'recovered_from_next', 'frontend');

function* walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      yield* walk(full);
    } else if (e.isFile()) {
      // Consider JS and gzip pack files
      if (e.name.endsWith('.js') || e.name.endsWith('.gz')) {
        yield full;
      }
    }
  }
}

function ensureDir(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
}

function cleanSourceToRel(src) {
  // Examples:
  // webpack://adcreator-frontend/./components/ui/button.tsx?8944
  // (ssr)/./app/page.tsx
  // (rsc)/./node_modules/next/dist/... (skip)
  let s = src;
  // Drop protocol-like prefixes
  s = s.replace(/^webpack-internal:\/\/+/, '');
  s = s.replace(/^webpack:\/\/+[^/]+\//, '');
  s = s.replace(/^webpack:\/\/+/, '');
  // Keep from './'
  const idx = s.indexOf('./');
  if (idx >= 0) s = s.slice(idx + 2);
  // Remove query/hash
  s = s.replace(/[?#].*$/, '');
  // Normalize
  s = s.replace(/\\/g, '/');
  return s;
}

function plausibleExt(p) {
  return /\.(tsx?|jsx?|css|scss|json|md|svg)$/.test(p);
}

let written = 0;
let filesScanned = 0;

const zlib = require('zlib');

function readMaybeGzip(file) {
  const buf = fs.readFileSync(file);
  try {
    if (file.endsWith('.gz')) return zlib.gunzipSync(buf).toString('utf8');
    return buf.toString('utf8');
  } catch (e) {
    return '';
  }
}

for (const base of INPUT_DIRS) {
  if (!fs.existsSync(base)) continue;
  for (const file of walk(base)) {
    filesScanned++;
    const text = readMaybeGzip(file);
  // Find all data URLs with source maps
  const re = /sourceMappingURL=data:application\/json[^,]*,([A-Za-z0-9+/=]+)/g;
  let m;
  while ((m = re.exec(text))) {
    try {
      const json = Buffer.from(m[1], 'base64').toString('utf8');
      const map = JSON.parse(json);
      const sources = map.sources || [];
      const contents = map.sourcesContent || [];
      for (let i = 0; i < sources.length; i++) {
        const src = sources[i];
        const body = contents[i];
        if (!body) continue;
        if (/node_modules\//.test(src)) continue; // skip deps
        let rel = cleanSourceToRel(src);
        if (!plausibleExt(rel)) continue;
        // Prepend 'frontend/' to reflect original project root
        const outPath = path.join(OUTPUT_ROOT, rel);
        ensureDir(outPath);
        if (!fs.existsSync(outPath)) {
          fs.writeFileSync(outPath, body, 'utf8');
          written++;
        } else {
          // If exists but empty and new has content, overwrite
          const cur = fs.readFileSync(outPath, 'utf8');
          if (cur.length === 0 && body.length > 0) {
            fs.writeFileSync(outPath, body, 'utf8');
          }
        }
      }
    } catch (_) {
      // ignore parse errors
    }
  }
  }
}

console.log(`Scanned ${filesScanned} bundle files. Wrote ${written} source files to ${path.relative(ROOT, OUTPUT_ROOT)}.`);
