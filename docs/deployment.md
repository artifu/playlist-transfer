# Deployment Notes

Last reviewed: 2026-05-10

This project should not require a heavy local database install. Local development can keep using SQLite, while the first hosted MVP can use Supabase REST storage from the Node API.

## Recommended First Hosted Stack

- Render Web Service for `apps/transfer-api`.
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

## Render API Setup

Create a Render Web Service connected to the GitHub repo.

Build command:

```bash
npm install
```

Start command:

```bash
node --disable-warning=ExperimentalWarning apps/transfer-api/server.mjs
```

The current API imports the checked-in `dist/` provider code. Run `npm run build` only when TypeScript files under `src/` change and the local TypeScript build is healthy.

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
