import fs from 'fs/promises';
import fss from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { normalizeTemplateRoles } from '../roles/normalize.js';
import { convertLegacyJson } from '../legacyConvert.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_SUBDIRS = [
  'templates',
  'templates-new',
  'AdCreator2/backend/templates/configs',
  'AdCreator/backend/templates/configs',
  'AdCreator/image-generation-service/templates/configs',
];

const uniq = (a) => [...new Set(a)];

function resolveRoots() {
  const roots = [];
  const cwd = process.cwd();
  const here = __dirname;

  // 1) env override (colon/comma separated)
  const envRoots = (process.env.TEMPLATE_ROOTS || '')
    .split(/[,:]/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(p => path.resolve(cwd, p));
  roots.push(...envRoots);

  // 2) typical places relative to cwd
  for (const sub of DEFAULT_SUBDIRS) roots.push(path.resolve(cwd, sub));

  // 3) typical places relative to compiled file location (dist/<...>/pipeline)
  for (const sub of DEFAULT_SUBDIRS) roots.push(path.resolve(here, '..', '..', sub));
  for (const sub of DEFAULT_SUBDIRS) roots.push(path.resolve(here, '..', '..', '..', sub));

  // 4) parent dirs of cwd (walk up a bit)
  for (let i = 1; i <= 3; i++) {
    const base = path.resolve(cwd, ...new Array(i).fill('..'));
    for (const sub of DEFAULT_SUBDIRS) roots.push(path.resolve(base, sub));
  }

  return uniq(roots).filter(p => fss.existsSync(p));
}

function idVariants(id) {
  return uniq([
    id,
    id.toLowerCase(),
    id.replace(/_/g, '-'),
    id.replace(/_/g, '-').toLowerCase(),
    id.replace(/-/g, '_'),
    id.replace(/-/g, '_').toLowerCase(),
  ]);
}

export async function loadTemplateById(id) {
    const roots = resolveRoots();
    const tried = [];
    const names = idVariants(id).flatMap(v => (v.endsWith('.json') ? [v] : [`${v}.json`, v]));

    for (const root of roots) {
        for (const name of names) {
            const file = path.resolve(root, name.endsWith('.json') ? name : `${name}.json`);
            tried.push(file);
            if (fss.existsSync(file)) {
                const raw = await fs.readFile(file, 'utf-8');
                let tpl = JSON.parse(raw);
                // Handle both templateId and templateName
                if (!tpl.templateId && tpl.templateName) {
                    tpl.templateId = tpl.templateName;
                }
                // Auto-convert legacy AdCreator2 configs lacking `areas`
                if (!Array.isArray(tpl?.areas)) {
                    try {
                        tpl = convertLegacyJson(tpl);
                    }
                    catch { /* fall through; will error below if unusable */ }
                }
                if (tpl?.templateId && Array.isArray(tpl?.areas))
                    return normalizeTemplateRoles(tpl);
            }
        }
    }

    const err = new Error(`templateId not found: ${id}. Tried:\n${tried.join('\n')}`);
    err.roots = roots;
    throw err;
}

export async function loadTemplateByIdLoose(id) {
  const roots = resolveRoots();
  const tried = [];
  const names = idVariants(id).flatMap(v => (v.endsWith('.json') ? [v] : [`${v}.json`, v]));

  for (const root of roots) {
    for (const name of names) {
      const file = path.resolve(root, name.endsWith('.json') ? name : `${name}.json`);
      tried.push(file);
      if (fss.existsSync(file)) {
        const raw = await fs.readFile(file, 'utf-8');
        let tpl = JSON.parse(raw);
        // Handle both templateId and templateName
        if (!tpl.templateId && tpl.templateName) {
            tpl.templateId = tpl.templateName;
        }
        // Auto-convert legacy AdCreator2 configs lacking `areas`
        if (!Array.isArray(tpl?.areas)) {
          try {
            tpl = convertLegacyJson(tpl);
          } catch { /* ignore */ }
        }
        return normalizeTemplateRoles(tpl);
      }
    }
  }

  const err = new Error(`Template not found for id="${id}". Tried:\n${tried.join('\n')}`);
  err.roots = roots;
  throw err;
}

export function getTemplateSearchRoots() {
  return resolveRoots();
}
