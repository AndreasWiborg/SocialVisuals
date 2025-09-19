import fs from 'fs';
import path from 'path';
const DEFAULTS = {
  id: 'staging',
  twoStage: true,
  allowLocalFallback: false,
  singleLine: { softOpticalCapMultiplierHeadline: 1.20, softOpticalCapMultiplierBody: 1.10, minLH: 0.94 },
  ranking: { answerShapeWeight: 0.15, duplicatePenalty: 0.40, shortCountPenalty: 0.50, widthLimitedPenalty: -0.02 },
  fonts: {
    preferJobFont: true,
    minTracking: 0.10,
    maxNegTracking: -0.25,
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
    ctaColor: null
  },
};
export function loadProfile(id) {
  const pid = String(process.env.PROFILE_ID || id || 'staging');
  const p = path.resolve(path.join(process.cwd(), 'text-overlay', 'src', 'config', 'profiles', `${pid}.json`));
  try {
    if (fs.existsSync(p)) {
      const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
      const prof = {
        ...DEFAULTS,
        ...raw,
        id: raw.id || pid,
        singleLine: { ...DEFAULTS.singleLine, ...(raw.singleLine || {}) },
        ranking: { ...DEFAULTS.ranking, ...(raw.ranking || {}) },
        fonts: { ...DEFAULTS.fonts, ...(raw.fonts || {}) },
      };
      // Merge runtime settings from .cache/settings.json if present
      try {
        const sPath = path.resolve('.cache', 'settings.json');
        if (fs.existsSync(sPath)) {
          const s = JSON.parse(fs.readFileSync(sPath, 'utf-8')) || {};
          if (typeof s.headlineUppercase === 'boolean') prof.fonts.headlineUppercase = s.headlineUppercase;
          if (typeof s.headlineWeight === 'string') prof.fonts.headlineWeight = s.headlineWeight;
          if (typeof s.headlineColor === 'string') prof.fonts.headlineColor = s.headlineColor;
          if (typeof s.bodyUppercase === 'boolean') prof.fonts.bodyUppercase = s.bodyUppercase;
          if (typeof s.bodyWeight === 'string') prof.fonts.bodyWeight = s.bodyWeight;
          if (typeof s.bodyColor === 'string') prof.fonts.bodyColor = s.bodyColor;
          if (typeof s.subheadlineUppercase === 'boolean') prof.fonts.subheadlineUppercase = s.subheadlineUppercase;
          if (typeof s.subheadlineWeight === 'string') prof.fonts.subheadlineWeight = s.subheadlineWeight;
          if (typeof s.subheadlineColor === 'string') prof.fonts.subheadlineColor = s.subheadlineColor;
          if (typeof s.ctaUppercase === 'boolean') prof.fonts.ctaUppercase = s.ctaUppercase;
          if (typeof s.ctaWeight === 'string') prof.fonts.ctaWeight = s.ctaWeight;
          if (typeof s.ctaColor === 'string') prof.fonts.ctaColor = s.ctaColor;
        }
      } catch {}
      return Object.freeze(prof);
    }
  } catch {}
  const prof = { ...DEFAULTS, id: pid };
  try {
    const sPath = path.resolve('.cache', 'settings.json');
    if (fs.existsSync(sPath)) {
      const s = JSON.parse(fs.readFileSync(sPath, 'utf-8')) || {};
      if (typeof s.headlineUppercase === 'boolean') prof.fonts.headlineUppercase = s.headlineUppercase;
      if (typeof s.headlineWeight === 'string') prof.fonts.headlineWeight = s.headlineWeight;
      if (typeof s.headlineColor === 'string') prof.fonts.headlineColor = s.headlineColor;
      if (typeof s.bodyUppercase === 'boolean') prof.fonts.bodyUppercase = s.bodyUppercase;
      if (typeof s.bodyWeight === 'string') prof.fonts.bodyWeight = s.bodyWeight;
      if (typeof s.bodyColor === 'string') prof.fonts.bodyColor = s.bodyColor;
      if (typeof s.subheadlineUppercase === 'boolean') prof.fonts.subheadlineUppercase = s.subheadlineUppercase;
      if (typeof s.subheadlineWeight === 'string') prof.fonts.subheadlineWeight = s.subheadlineWeight;
      if (typeof s.subheadlineColor === 'string') prof.fonts.subheadlineColor = s.subheadlineColor;
      if (typeof s.ctaUppercase === 'boolean') prof.fonts.ctaUppercase = s.ctaUppercase;
      if (typeof s.ctaWeight === 'string') prof.fonts.ctaWeight = s.ctaWeight;
      if (typeof s.ctaColor === 'string') prof.fonts.ctaColor = s.ctaColor;
    }
  } catch {}
  return Object.freeze(prof);
}
