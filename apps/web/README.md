# PlaylistXfer Web

This is the clean product web shell for PlaylistXfer.

It intentionally lives outside the local demo:

- `tools/playlist-preview-server.mjs` remains the visual/engineering lab.
- `apps/transfer-api` owns JSON routes and transfer orchestration.
- `apps/web` is the user-facing web product track that talks to the API.

## Run Locally

Start the Transfer API in one terminal:

```bash
npm run dev:transfer-api
```

Start the web app in another terminal:

```bash
npm run dev:web
```

Open:

```text
http://127.0.0.1:8792
```

The web server proxies `/api/*` to the Transfer API at `http://127.0.0.1:8791` by default.

Override the API target when needed:

```bash
TRANSFER_API_URL=http://127.0.0.1:8791 npm run dev:web
```

## Deploy

Preferred production deploy is Cloudflare Pages:

```text
Build command: none
Build output directory: apps/web/public
```

Set:

```bash
TRANSFER_API_URL=https://playlist-transfer-api.onrender.com
```

Production domain:

```text
https://playlistxfer.com
```

The repo-level `functions/api/[[path]].js` file proxies same-origin `/api/*` requests to the Transfer API, and `apps/web/public/_routes.json` keeps Cloudflare Functions limited to `/api/*` and `/health` so ordinary page views stay fully static.

Render can still run the web app as a Node fallback because [server.mjs](/Users/arthur_t_m/Documents/PlaylistTransfer/apps/web/server.mjs) serves static files and proxies API requests.

On Render, use:

```bash
npm install
```

as the build command, and:

```bash
node apps/web/server.mjs
```

as the start command.

Set these environment variables:

```bash
WEB_HOST=0.0.0.0
TRANSFER_API_URL=https://playlist-transfer-api.onrender.com
```

The server reads Render's `PORT` automatically.

## Product Flow

1. Paste a public Spotify playlist link.
2. Preview readable public playlist metadata.
3. Analyze Apple Music matches through a background job.
4. Review low-confidence candidates.
5. Connect Apple Music only when creating the playlist.
6. Create from ready or user-approved tracks only.
7. Show a receipt with transferred and skipped counts.

The app stores an anonymous session id and the latest `transferId` in `localStorage`, then restores the match report from the Transfer API after refresh, tab close, or API restart. Review decisions are saved server-side in local SQLite and scoped to that anonymous session, not only in browser memory.

Current local storage keys:

- `playlist-transfer:anonymous-session-id`
- `playlist-transfer:last-transfer-id`

## MVP Analytics

The web app sends first-party operational events to `POST /api/events`.

These events are intentionally small and safe:

- Apple Music connect success/failure
- Spotify preview success/failure
- Apple Music analysis success/failure
- review decision success/failure
- playlist creation success/failure

The API writes them as structured JSON lines in the API logs with `logType: "playlist_transfer_event"`. The session id is hashed server-side, and the client sends playlist ids plus aggregate counts instead of full Spotify URLs or Apple Music tokens.

The public page intentionally does not call the API on initial load. This keeps casual visits, SEO crawls, and social-preview traffic from waking the hosted API. The API wakes only after a user starts a transfer action or restores an existing transfer.

## Sponsor Slot

The page includes a lightweight sponsor placeholder. It is intentionally static for now: no third-party ad script loads before we have privacy copy, approval, and performance guardrails in place.

## Notes

- There is no demo fixture button in this app.
- Creation is still protected by Apple Music authorization at the final step.
- The current web app is dependency-free on purpose so it can evolve before we commit to React, React Native, or native UI.
