# syntax=docker/dockerfile:1
FROM node:20-bullseye AS deps
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci

FROM node:20-bullseye AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY frontend/ ./

# Set environment variables for build
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG SUPABASE_SERVICE_ROLE_KEY
ARG NEXT_PUBLIC_API_BASE
ARG PUBLIC_SVGS_MANIFEST_URL
ARG PUBLIC_ASSETS_BASE
ARG LLM_PROVIDER

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY
ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE
ENV PUBLIC_SVGS_MANIFEST_URL=$PUBLIC_SVGS_MANIFEST_URL
ENV PUBLIC_ASSETS_BASE=$PUBLIC_ASSETS_BASE
ENV LLM_PROVIDER=$LLM_PROVIDER

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
