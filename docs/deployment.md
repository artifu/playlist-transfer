# Deployment Notes

Last reviewed: 2026-06-03

This project should not require a heavy local database install. Local development can keep using SQLite, while production can run in one of two modes:

- Cloudflare-native API mode: Cloudflare Pages Functions plus D1 for transfer/job storage. This is the preferred free-tier direction because static page loads and transfer API calls stay on Cloudflare without Render cold starts.
- Render proxy mode: Cloudflare Pages proxies `/api/*` to the Render Node API. This remains the fallback while D1 is not configured.

## Recommended First Hosted Stack

- Cloudflare Pages for the static web shell in `apps/web/public`.
- Cloudflare Pages Functions for same-origin `/api/*`.
- Cloudflare D1 for anonymous transfer and job persistence.
- Render Web Service for `apps/transfer-api` only as fallback.
- Supabase Postgres only as fallback storage for the Render API.

This keeps the mobile/web clients thin, avoids running Postgres on the development Mac, and gives us a no-cold-start path for the main production transfer flow.

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

Cloudflare Pages is the preferred host for the public web shell because it serves static files from the edge without waking a Node web service for every page hit. The same Pages project can also serve the Cloudflare-native transfer API when a D1 binding is present.

The production domain plan lives in [playlistxfer-launch-roadmap.md](/Users/arthur_t_m/Documents/PlaylistTransfer/docs/playlistxfer-launch-roadmap.md).

The repo includes:

- [wrangler.toml](/Users/arthur_t_m/Documents/PlaylistTransfer/wrangler.toml) with the Pages output directory.
- [functions/api/[[path]].js](/Users/arthur_t_m/Documents/PlaylistTransfer/functions/api/[[path]].js), a same-origin `/api/*` entrypoint. It uses Cloudflare D1 when the `PLAYLIST_TRANSFER_DB` binding exists and falls back to the Render API otherwise.
- [functions/health.js](/Users/arthur_t_m/Documents/PlaylistTransfer/functions/health.js), a Pages health endpoint.
- [functions/config.js](/Users/arthur_t_m/Documents/PlaylistTransfer/functions/config.js), a tiny public runtime config script for safe client-side settings such as Google Analytics.
- [apps/web/public/_routes.json](/Users/arthur_t_m/Documents/PlaylistTransfer/apps/web/public/_routes.json), which ensures only `/api/*`, `/health`, and `/config.js` invoke Functions.
- [apps/web/public/_headers](/Users/arthur_t_m/Documents/PlaylistTransfer/apps/web/public/_headers), which adds lightweight security and cache headers.

Create the Cloudflare Pages project from GitHub with these settings:

```text
Project name: playlist-transfer
Production branch: main
Build command: none
Build output directory: apps/web/public
Root directory: /
```

Set this Pages environment variable:

```bash
TRANSFER_API_URL=https://playlist-transfer-api.onrender.com
GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

This keeps Render proxy mode working. When Cloudflare-native API mode is enabled, the Pages Function ignores `TRANSFER_API_URL` for implemented API routes and uses D1 instead.

`GA_MEASUREMENT_ID` is optional. If it is missing or empty, `/config.js` returns an empty analytics id and Google Analytics is not loaded.

## Cloudflare-Native API Setup

This removes the Render cold start from the normal transfer path.

1. In Cloudflare, create a D1 database named `playlist-transfer`.
2. In the Pages project, add a D1 binding:

```text
Variable name / binding: PLAYLIST_TRANSFER_DB
D1 database: playlist-transfer
```

3. Add these Pages environment variables:

```bash
APPLE_MUSIC_DEVELOPER_TOKEN=your-apple-developer-token
APPLE_MUSIC_STOREFRONT=us
TRANSFER_API_URL=https://playlist-transfer-api.onrender.com
GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

4. Redeploy the Pages project.
5. Confirm `/health` reports native mode:

```bash
curl https://playlistxfer.com/health
```

Expected shape:

```json
{
  "ok": true,
  "host": "cloudflare-pages",
  "apiMode": "cloudflare-native",
  "nativeApiConfigured": true,
  "hasAppleDeveloperToken": true
}
```

The native API auto-creates the D1 tables on first use. The schema is also saved in [cloudflare-d1-schema.sql](/Users/arthur_t_m/Documents/PlaylistTransfer/apps/transfer-api/sql/cloudflare-d1-schema.sql) if you prefer running it manually.

Supported native routes:

- `GET /api/apple-music/session`
- `POST /api/apple-music/user-token`
- `POST /api/events`
- `POST /api/spotify/public-playlist-preview`
- `POST /api/transfers/analyze-public-job`
- `GET /api/jobs/:jobId`
- `GET /api/transfers/:transferId`
- `PATCH /api/transfers/:transferId/items/:itemIndex`
- `POST /api/transfers/:transferId/create-job`
- `POST /api/transfers/create-public-job`

Important security notes:

- `APPLE_MUSIC_DEVELOPER_TOKEN` is a backend secret and must stay in Cloudflare/Render environment variables only.
- Apple Music user tokens stay in the browser session and are sent only for the explicit create-playlist action.
- D1 stores anonymous transfer reports and job results, not Apple Music user tokens.

Then configure these Pages custom domains:

```text
playlistxfer.com
www.playlistxfer.com
```

Use `playlist.arthurmendes.com` as staging or fallback until production smoke tests pass.

To redirect `www.playlistxfer.com` to `playlistxfer.com`, use a Cloudflare Redirect Rule at the domain level:

```text
If incoming requests match: Hostname equals www.playlistxfer.com
Then: Dynamic redirect
Expression: concat("https://playlistxfer.com", http.request.uri.path)
Status code: 301
Preserve query string: enabled
```

After deploy, smoke test:

```bash
curl https://playlistxfer.com/health
curl https://playlistxfer.com/config.js
curl https://playlistxfer.com/privacy
curl https://playlistxfer.com/api/events
curl -I https://www.playlistxfer.com/privacy
```

In Render proxy mode, the `/api/events` request should return a method or payload error from the Render API, proving that the Pages proxy is reaching the backend without exposing backend secrets to the browser. In Cloudflare-native mode, use a POST request instead:

```bash
curl -X POST https://playlistxfer.com/api/events \
  -H "Content-Type: application/json" \
  -d '{"event":"smoke_test"}'
```

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

- Keep `apps/web/public` on Cloudflare Pages for static hosting.
- Prefer Cloudflare-native API mode with D1 to avoid Render cold starts in the main transfer path.
- Keep the Render API deployed as a safety fallback until native D1 mode has passed real playlist smoke tests.
- Use the included Cloudflare Pages Function entrypoint for `/api/*` so the browser can keep using same-origin API calls in both modes.

This split lets casual page traffic hit Cloudflare's static edge. With D1 configured, transfer actions also stay on Cloudflare. Without D1, transfer actions fall back to Render.

The native API is intentionally a small compatibility layer, not a blind lift-and-shift of the Node API. It ports the public playlist ingestion, Apple Music catalog matching, anonymous transfer storage, and explicit create flow into Worker-compatible modules.

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

Expected response while Render proxy mode is active:

```json
{"ok":true,"host":"cloudflare-pages","apiMode":"render-proxy","transferApiUrl":"https://playlist-transfer-api.onrender.com"}
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
