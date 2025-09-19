# Cloud Deployment Guide

This project now ships with container definitions for the Text Overlay API and the Next.js frontend. The goal is to keep the render pipeline bundled with its template assets while letting you deploy to services such as Render, Railway, Fly.io, or any Docker-compatible host.

## Directory & Asset Layout

- `text-overlay/` – compiled Fastify API (`dist/api.js`) plus fonts and bundled mappings.
- `AdCreator2/backend/templates/` – primary JSON template configs referenced by the renderer.
- `AdCreator/image-generation-service/templates/` – legacy/extra template configs still discoverable by the lookup logic.
- `frontend/` – Next.js SaaS dashboard that talks to the API and Supabase.
- `docker-compose.yml` – runs both services together for local smoke tests or a simple single-VM deployment.

## Prerequisites

1. Docker 24+ and Docker Compose.
2. Supabase project with:
   - URL, anon key, service-role key.
   - Storage buckets: `user-content` (existing), `generated` (for rendered outputs).
3. OpenAI (or compatible) API key for the text/SVG pipeline.
4. Optional: Stripe publishable & secret keys for billing (frontend currently expects publishable key only).

## Environment Files

Sample env files live under `env/`:

- `env/.text-overlay.example` – copy to `env/.text-overlay.prod` (or similar) and fill in Supabase + OpenAI secrets for the API container.
- `env/.frontend.example` – copy to `env/.frontend.prod` and set public Supabase + API base values for the Next.js app.

Update `docker-compose.yml` to point at your real env filenames or export the vars directly in your hosting provider’s UI.

## Build & Run Locally

1. Copy the sample env files and update Docker Compose to point at them:
   ```bash
   cp env/.text-overlay.example env/.text-overlay.local
   cp env/.frontend.example env/.frontend.local
   sed -i '' 's/.text-overlay.example/.text-overlay.local/' docker-compose.yml
   sed -i '' 's/.frontend.example/.frontend.local/' docker-compose.yml
   ```
   *(Use `gsed` or edit manually on Linux.)*

2. Fill in real values:
   ```bash
   $EDITOR env/.text-overlay.local env/.frontend.local
   ```

3. Build and launch:
   ```bash
   docker compose up --build
   ```

If you prefer to keep the sample filenames, export the required variables in your shell before running `docker compose up --build`.

When both services are up:

- API: http://localhost:3000
- Frontend: http://localhost:3001 (Text Overlay UI lives at `/text-overlay`).

## Deploying to Render/Railway/Fly.io

1. Build images using the provided Dockerfiles:
   - `text-overlay/Dockerfile`
   - `frontend/Dockerfile`
2. Provision two services:
   - **Text Overlay API** (port 3000). Supply Supabase service role key, OpenAI key, and optional bucket overrides.
   - **Frontend** (port 3001). Point `NEXT_PUBLIC_API_BASE` to the API service URL (internal URL for same network, public URL otherwise). Supply Supabase anon key.
3. Expose each service on your desired domains (`api.example.com`, `app.example.com`). Add TLS/HTTPS via the platform’s settings.
4. Set restart policy to “always/unless-stopped” so renders survive crashes.
5. For persistent run history, rely on Supabase storage rather than container volumes (the API already uploads final images to the `generated` bucket).

## Stripe Integration Placeholder

The frontend env sample includes `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` and `NEXT_PUBLIC_STRIPE_PRICE_ID`. When you wire up billing:

1. Add the secret key to the API service (not the frontend).
2. Swap the placeholders with real values in your env files.
3. Build a small billing API route (can live in the Next.js app or a new microservice) that talks to Stripe.

## Operational Tips

- The API container registers fonts from `text-overlay/fonts`. Add new font files there and rebuild the image.
- To update templates, edit JSON under `AdCreator2/backend/templates` (or the other template directories) and rebuild/redeploy. The lookup routine scans those directories on boot.
- Logs are written to STDOUT/STDERR inside the container. Use your platform’s log streaming or attach to the Docker service locally (`docker compose logs -f text-overlay`).
- For debugging template discovery in production, call `GET /debug/template-roots` on the API.

## Next Steps

- Hook up health checks: `/health` for the API, `/api/health` (custom) for the frontend if desired.
- Add CI workflow to build and push both images to a registry (GitHub Container Registry, ECR, etc.).
- Layer in a background worker or job queue once render volume increases; today the single Fastify instance handles everything synchronously.
