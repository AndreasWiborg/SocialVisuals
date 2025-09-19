# text-overlay

Node 20 + TypeScript project scaffolding for a future text overlay/fitting/rendering toolkit.

This commit only sets up tooling and dependencies — no implementation code yet.

## Requirements

- Node `>=20`
- macOS build deps (for `canvas`):
  - `brew install pkg-config cairo pango libpng jpeg giflib librsvg`

If you use another OS later:
- Linux: `sudo apt-get install -y build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev`
- Windows: See node-canvas docs for prebuilt binaries or MSYS2 setup.

## Install

```bash
# Ensure Node 20
node -v

# Install dependencies
npm install
```

## Test
Run unit tests:
```bash
npm test
```

## Scripts

- `build`: Type-checks and compiles to `dist/` (empty project compiles cleanly).
- `test`: Runs `vitest` (no tests yet).
- `dev`: Runs `src/index.ts` with `ts-node` (placeholder entry; no code yet).
- `fit`: Future CLI entry for fitting (expects built files in `dist/`).
- `render`: Future CLI entry for rendering (expects built files in `dist/`).
- `pipeline`: Future CLI entry for end-to-end pipeline (expects built files in `dist/`).

## Notes

- The `canvas` package requires native libraries. Install the Homebrew dependencies above on macOS before `npm install`.
- `tsconfig.json` targets ES2020 with NodeNext module resolution and outputs to `dist/`.
- The repo currently contains no source implementation by design.

```text
North Star Rules (future implementation reference)
- Zero truncation and FitReport as single source of truth
- Derived font sizing; no magic maxFont
- Bundled content areas (H1/H2/BODY/CTA/BULLETS)
- Diversity & novelty (MMR + trigram penalty; quotas)
- Single fallback ladder (tracking → hyphenation → balanced wrap → drop lowest-priority area → compress → re-fit)
```

## Quick Background (solid color)
Generate a solid 1080x1350 background locally using a tiny Node snippet (requires node-canvas installed):
```bash
node -e "const {createCanvas}=require('canvas');const fs=require('fs');const c=createCanvas(1080,1350);const g=c.getContext('2d');g.fillStyle='#3366FF';g.fillRect(0,0,1080,1350);fs.writeFileSync('bg.jpg',c.toBuffer('image/jpeg',{quality:0.9}));console.log('wrote bg.jpg');"
```

## CLI: Fit and Render
Try fitting text to the sample template, then render with a background:

```bash
# Fit
npx ts-node src/index.ts fit --template templates/portrait-promo-v2.json --role headline --text "What if ads wrote themselves?"

# Or via npm script
npm run fit -- --template templates/portrait-promo-v2.json --role headline --text "Your headline"

# Render
npx ts-node src/index.ts render --template templates/portrait-promo-v2.json --area headline-box --text "What if ads wrote themselves?" --bg ./bg.jpg --out out.png

# Or via npm script
npm run render -- --template templates/portrait-promo-v2.json --area headline-box --text "Your headline" --bg ./bg.jpg --out out.png
```
