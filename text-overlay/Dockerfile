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
COPY text-overlay/fonts ./fonts
COPY text-overlay/mappings ./mappings
COPY text-overlay/scripts ./scripts
COPY text-overlay/bundles*.json ./
COPY text-overlay/manifest.json ./
COPY text-overlay/bg-*.png ./

# Provide template/config lookup roots expected by the pipeline
COPY AdCreator2/backend/templates /app/AdCreator2/backend/templates
COPY AdCreator/image-generation-service/templates /app/AdCreator/image-generation-service/templates
RUN mkdir -p /app/AdCreator/backend/templates/configs /app/templates /app/templates-new

RUN mkdir -p /app/text-overlay/logs /app/text-overlay/runs /app/text-overlay/uploads

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
