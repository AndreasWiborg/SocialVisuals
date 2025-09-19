# syntax=docker/dockerfile:1
FROM node:20-bullseye AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libpng-dev \
    libgif-dev \
    librsvg2-dev \
    libwebp-dev \
    pkg-config \
    python3 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app/text-overlay

COPY text-overlay/package*.json ./

RUN npm install --omit=dev

COPY text-overlay/dist ./dist
# Create the runs directory and the recorder.js file
RUN mkdir -p ./dist/runs && cat > ./dist/runs/recorder.js << 'EOF'
import fs from 'fs/promises';
import path from 'path';
export async function initRun(dir, startedAt) {
    await fs.mkdir(dir, { recursive: true });
    const p = path.join(dir, 'manifest.json');
    const now = new Date().toISOString();
    const manifest = { startedAt: startedAt || now, finishedAt: null, total: 0, items: [], dir };
    try {
        await fs.writeFile(p, JSON.stringify(manifest, null, 2), 'utf-8');
    }
    catch { }
}
export async function appendItem(dir, item) {
    const p = path.join(dir, 'manifest.json');
    let data = { startedAt: new Date().toISOString(), finishedAt: null, total: 0, items: [], dir };
    try {
        data = JSON.parse(await fs.readFile(p, 'utf-8'));
    }
    catch { }
    data.items = data.items || [];
    data.items.push(item);
    data.total = data.items.length;
    data.dir = dir;
    await fs.writeFile(p, JSON.stringify(data, null, 2), 'utf-8');
}
export async function finalizeRun(dir) {
    const p = path.join(dir, 'manifest.json');
    let data;
    try {
        data = JSON.parse(await fs.readFile(p, 'utf-8'));
    }
    catch {
        return;
    }
    data.finishedAt = new Date().toISOString();
    data.total = (data.items || []).length;
    await fs.writeFile(p, JSON.stringify(data, null, 2), 'utf-8');
}
EOF
COPY text-overlay/fonts ./fonts
COPY text-overlay/scripts ./scripts
COPY text-overlay/bundles*.json ./
COPY text-overlay/manifest.json ./
COPY text-overlay/bg-*.png ./

# Create mappings directory - will be populated at runtime if needed
RUN mkdir -p ./mappings

# Create template/config lookup roots expected by the pipeline
RUN mkdir -p /app/AdCreator2/backend/templates /app/AdCreator2/backend/assets /app/AdCreator/image-generation-service/templates /app/AdCreator/backend/templates/configs /app/templates /app/templates-new

RUN mkdir -p /app/text-overlay/logs /app/text-overlay/runs /app/text-overlay/uploads

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
