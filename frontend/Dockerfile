# syntax=docker/dockerfile:1
FROM node:20-bullseye AS deps
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci

FROM node:20-bullseye AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY frontend/ ./
RUN npm run build

FROM node:20-bullseye AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY frontend/package*.json ./
COPY --from=deps /app/node_modules ./node_modules
RUN npm prune --omit=dev
EXPOSE 3001
CMD ["npm", "run", "start"]
