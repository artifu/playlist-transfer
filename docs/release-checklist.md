# MVP Release Checklist

Last reviewed: 2026-05-31

Use this checklist before sharing a public PlaylistXfer link with testers, recruiters, or app-store reviewers.

For the production domain launch sequence, use [playlistxfer-launch-roadmap.md](/Users/arthur_t_m/Documents/PlaylistTransfer/docs/playlistxfer-launch-roadmap.md).

## Hosted Services

- Cloudflare Pages API mode is decided for the release: `cloudflare-native` preferred, `render-proxy` acceptable as fallback.
- Render API service is live at `https://playlist-transfer-api.onrender.com` if fallback is needed.
- Cloudflare Pages web service is live for `https://playlistxfer.com`.
- `https://www.playlistxfer.com` redirects to `https://playlistxfer.com`.
- `https://playlist.arthurmendes.com` remains available as staging or fallback.
- Render web service at `https://playlist-transfer-web-esj4.onrender.com` remains available as fallback until we remove it.
- `/health` returns `{"ok":true}` for the API.
- `/health` on the Cloudflare Pages site returns `host: "cloudflare-pages"` and the expected `apiMode`.
- `/privacy` and `/terms` load from the custom domain.
- `/api/*` calls on the Cloudflare Pages site use the native D1 API when `PLAYLIST_TRANSFER_DB` exists; otherwise they proxy to Render.
- `/robots.txt` and `/sitemap.xml` load from the custom domain.

## Backend Environment

- `TRANSFER_API_HOST=0.0.0.0`
- Cloudflare-native mode: `PLAYLIST_TRANSFER_DB` D1 binding exists on the Pages project.
- Cloudflare-native mode: `APPLE_MUSIC_DEVELOPER_TOKEN` is set on the Pages project.
- Cloudflare-native mode: `APPLE_MUSIC_STOREFRONT=us` is set on the Pages project.
- Render fallback mode: `TRANSFER_API_STORAGE_DRIVER=supabase-rest`
- Render fallback mode: `SUPABASE_URL` is set.
- Render fallback mode: `SUPABASE_SERVICE_ROLE_KEY` is set only on the API service.
- Render fallback mode: `SUPABASE_TRANSFERS_TABLE=transfers`
- `APPLE_MUSIC_DEVELOPER_TOKEN` is set and current.
- `APPLE_MUSIC_STOREFRONT=us`
- Rate limiting is enabled.
- Anonymous transfer retention is configured.

## Web Environment

- Cloudflare Pages has `TRANSFER_API_URL=https://playlist-transfer-api.onrender.com`.
- Cloudflare Pages has `PLAYLIST_TRANSFER_DB` D1 binding when using native mode.
- Cloudflare Pages build output directory is `apps/web/public`.
- Cloudflare Pages Functions are active only for `/api/*` and `/health`.
- `playlistxfer.com` points to the Cloudflare Pages project.
- Cloudflare Redirect Rule sends `www.playlistxfer.com` to the apex domain.
- `playlist.arthurmendes.com` is staging or fallback, not the production domain.
- Render web env remains optional fallback only: `WEB_HOST=0.0.0.0` and `TRANSFER_API_URL=https://playlist-transfer-api.onrender.com`.

## Apple Music

- MusicKit identifier is configured for the public web origin.
- Apple Music authorization popup shows the PlaylistXfer app icon/name and `playlistxfer.com`.
- User authorization is requested only when creating the Apple Music playlist.
- Denying Apple Music authorization does not create a playlist.
- Retrying create after authorization succeeds.

## Product Smoke Test

Run this on `https://playlistxfer.com`:

1. Paste a public Spotify playlist URL.
2. Preview the public playlist.
3. Analyze the full playlist by default.
4. Confirm the match report shows ready, review, and missing counts.
5. Approve or skip at least one review row when available.
6. Click `Create Apple Music playlist`.
7. Authorize Apple Music if prompted.
8. Confirm the receipt shows transferred, review-left, and not-moved counts.
9. Confirm the playlist appears in Apple Music.
10. Click `Transfer another playlist` and confirm the UI resets.

## Analytics Smoke Test

The MVP uses first-party structured logs, not third-party analytics.

In Render logs for `playlist-transfer-api`, filter or search for:

```text
playlist_transfer_event
```

Expected events:

- `preview_succeeded` or `preview_failed`
- `analysis_succeeded` or `analysis_failed`
- `apple_connect_succeeded` or `apple_connect_failed`
- `transfer_create_succeeded` or `transfer_create_failed`

Each log line is JSON and includes:

- `event`
- `anonymousSession` as a hash
- `observedAt`
- safe counts such as `readyCount`, `reviewCount`, `missingCount`, and `durationMs`

Do not log Apple Music user tokens, Spotify full URLs, emails, or raw authorization payloads.

The web page should not wake the API on initial load. Open the page in a fresh browser session and confirm no new `playlist_transfer_event` line appears until you click preview, analyze, connect, or create.

## Known MVP Caveats

- Public Spotify ingestion depends on public web/embed surfaces and can break if Spotify changes them.
- Apple Music matching is best-effort and storefront-sensitive.
- Anonymous sessions are not user accounts.
- Render free instances can spin down and make the first request slow when the site is in Render proxy mode.
- Cloudflare-native mode avoids Render cold starts, but very large playlists still depend on Cloudflare Function limits and Spotify/Apple response times.
- The current analytics layer is operational telemetry for MVP testing, not a full product analytics warehouse.
