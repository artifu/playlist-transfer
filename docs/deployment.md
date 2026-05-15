# Deployment Notes

Last reviewed: 2026-05-14

This project should not require a heavy local database install. Local development can keep using SQLite, while the first hosted MVP can use Supabase REST storage from the Node API.

## Recommended First Hosted Stack

- Render Web Service for `apps/transfer-api`.
- Cloudflare Pages for the static web shell in `apps/web/public`.
- Supabase Postgres for transfer persistence.
- Local web shell can keep proxying to the hosted API while we test.

This keeps the mobile/web clients thin and avoids running Postgres on the development Mac.

## Supabase Setup

1. Create a Supabase project.
2. Open the SQL editor.
3. Run [supabase-schema.sql](/Users/arthur_t_m/Documents/PlaylistTransfer/apps/transfer-api/sql/supabase-schema.sql).
4. Copy the project URL.
5. Copy the service role key.

Important: the service role key is a backend secret. Never ship it in the web app, mobile app, screenshots, or public docs.

## Render Blueprint Setup

The repo includes [render.yaml](/Users/arthur_t_m/Documents/PlaylistTransfer/render.yaml), so the preferred path is a Render Blueprint with two services:

- `playlist-transfer-api`: Node API, Apple Music session handoff, Spotify public import, transfer jobs, and Supabase persistence.
- `playlist-transfer-web`: product web shell that proxies `/api/*` to the hosted API.

1. In Render, create a new Blueprint from the GitHub repository.
2. Render should detect `render.yaml` at the repo root.
3. Fill the API secret env vars that are marked `sync: false`.
4. Deploy the API and web services.

The API service uses:

```yaml
buildCommand: npm install && npm run build
startCommand: node --disable-warning=ExperimentalWarning apps/transfer-api/server.mjs
healthCheckPath: /health
```

The hosted API must run the TypeScript build because `dist/` is generated from `src/` during each clean deploy.

If creating the API service manually instead of using the Blueprint, use these values.

Build command:

```bash
npm install && npm run build
```

Start command:

```bash
node --disable-warning=ExperimentalWarning apps/transfer-api/server.mjs
```

Environment variables:

```bash
TRANSFER_API_HOST=0.0.0.0
TRANSFER_API_STORAGE_DRIVER=supabase-rest
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_TRANSFERS_TABLE=transfers
APPLE_MUSIC_DEVELOPER_TOKEN=your-apple-developer-token
APPLE_MUSIC_STOREFRONT=us
TRANSFER_API_TRANSFER_RETENTION_DAYS=7
TRANSFER_API_CLEANUP_INTERVAL_MS=3600000
TRANSFER_API_RATE_LIMIT_WINDOW_MS=60000
TRANSFER_API_RATE_LIMIT_MAX=240
```

The API reads Render's `PORT` automatically. Set `TRANSFER_API_PORT` only if a host requires a custom port override.

## Cloudflare Pages Web Setup

Cloudflare Pages is the preferred host for the public web shell because it serves static files from the edge without waking a Node web service for every page hit.

The repo includes:

- [wrangler.toml](/Users/arthur_t_m/Documents/PlaylistTransfer/wrangler.toml) with the Pages output directory.
- [functions/api/[[path]].js](/Users/arthur_t_m/Documents/PlaylistTransfer/functions/api/[[path]].js), a same-origin `/api/*` proxy to the Render API.
- [functions/health.js](/Users/arthur_t_m/Documents/PlaylistTransfer/functions/health.js), a Pages health endpoint.
- [apps/web/public/_routes.json](/Users/arthur_t_m/Documents/PlaylistTransfer/apps/web/public/_routes.json), which ensures only `/api/*` and `/health` invoke Functions.
- [apps/web/public/_redirects](/Users/arthur_t_m/Documents/PlaylistTransfer/apps/web/public/_redirects), which maps `/privacy` and `/terms` to static HTML files.
- [apps/web/public/_headers](/Users/arthur_t_m/Documents/PlaylistTransfer/apps/web/public/_headers), which adds lightweight security and cache headers.

Create the Cloudflare Pages project from GitHub with these settings:

```text
Project name: playlist-transfer-web
Production branch: main
Build command: none
Build output directory: apps/web/public
Root directory: /
```

Set this Pages environment variable:

```bash
TRANSFER_API_URL=https://playlist-transfer-api.onrender.com
```

Then configure `playlist.arthurmendes.com` as the Pages custom domain. Because `arthurmendes.com` already uses Cloudflare DNS, Cloudflare can manage this hostname directly. Remove or replace the old Render `CNAME` for `playlist` when switching traffic.

After deploy, smoke test:

```bash
curl https://playlist.arthurmendes.com/health
curl https://playlist.arthurmendes.com/privacy
curl https://playlist.arthurmendes.com/api/events
```

The `/api/events` request should return a method or payload error from the Render API, proving that the Pages proxy is reaching the backend without exposing backend secrets to the browser.

## Render Web Setup

Render can still host `apps/web` as a fallback or staging service.

The web service is intentionally small: it serves `apps/web/public` and proxies `/api/*` requests to `TRANSFER_API_URL`.

The Blueprint uses:

```yaml
buildCommand: npm install
startCommand: node apps/web/server.mjs
healthCheckPath: /health
```

Environment variables:

```bash
WEB_HOST=0.0.0.0
TRANSFER_API_URL=https://playlist-transfer-api.onrender.com
```

The web service reads Render's `PORT` automatically. Set `WEB_PORT` only for a custom local or non-Render host.

## Custom Domain Setup

For testing with Arthur's existing domain, prefer a subdomain such as:

```text
playlist.arthurmendes.com
```

This keeps `arthurmendes.com` available for the personal site while giving PlaylistTransfer a real HTTPS origin for Apple Music authorization and tester links.

Render setup:

1. In Render, open the `playlist-transfer-web` service.
2. Go to Settings > Custom Domains.
3. Add `playlist.arthurmendes.com`.
4. In the DNS provider for `arthurmendes.com`, add a `CNAME` record:

```text
Name: playlist
Value: playlist-transfer-web-esj4.onrender.com
```

5. Return to Render and verify the domain.

Render automatically provisions TLS certificates for verified custom domains. Remove conflicting `AAAA` records for the same hostname if verification or routing behaves unexpectedly.

When Cloudflare Pages becomes the production web host, move `playlist.arthurmendes.com` from the Render web service to the Pages project instead. Keep the Render API service and `playlist-transfer-api.onrender.com` unchanged.

## Traffic And Cold-Start Strategy

The web app should stay cheap to load even if a social post, crawler, or SEO experiment sends traffic to the landing page.

Current mitigation:

- The public page does not call the Transfer API on initial load.
- The public page does not load MusicKit until Apple Music authorization is needed.
- Apple Music session checks are deferred until the user analyzes, connects, creates, or restores an existing transfer.
- Product analytics events are emitted only after transfer-flow actions.
- A lightweight sponsor slot exists in the UI, but no third-party ad script is loaded yet.

Current hosting direction:

- Move `apps/web/public` to Cloudflare Pages for static hosting.
- Keep `apps/transfer-api` on Render for the transfer engine until traffic justifies either a paid no-spin-down API host or a Cloudflare-native rewrite.
- Use the included Cloudflare Pages Function proxy for `/api/*` so the browser can keep using same-origin API calls.

This split lets casual page traffic hit Cloudflare's static edge instead of waking the Render API. The API still wakes when a user actually previews, analyzes, or creates a transfer.

Do not move the full API to Cloudflare Workers without a separate migration pass. The current API relies on Node runtime behavior, in-memory jobs, and long-running Apple Music matching work that are not a drop-in fit for Workers.

## Render Smoke Test

After deploy:

```bash
curl https://your-render-service.onrender.com/health
```

Expected response:

```json
{"ok":true}
```

For the web service:

```bash
curl https://your-web-service.onrender.com/health
```

Expected response:

```json
{"ok":true,"transferApiUrl":"https://playlist-transfer-api.onrender.com/"}
```

## Local Hosted-Storage Smoke Test

After Supabase is configured, the local API can talk to Supabase without installing a local database:

```bash
TRANSFER_API_STORAGE_DRIVER=supabase-rest npm run dev:transfer-api
```

Then run a normal web flow against `http://127.0.0.1:8792`.

## Production Gaps Before Launch

- Move long-running jobs out of process if hosted traffic grows.
- Replace in-memory rate limiting with provider-level or shared-store rate limiting for multi-instance deployments.
- Decide whether Apple Music user tokens should remain in-memory, be encrypted at rest, or be used only during a single create flow.
- Add observability for Spotify public-link ingestion failures.
