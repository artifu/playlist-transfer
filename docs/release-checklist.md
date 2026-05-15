# MVP Release Checklist

Last reviewed: 2026-05-15

Use this checklist before sharing a public PlaylistTransfer link with testers, recruiters, or app-store reviewers.

## Hosted Services

- Render API service is live at `https://playlist-transfer-api.onrender.com`.
- Render web service is live at `https://playlist-transfer-web-esj4.onrender.com`.
- Custom domain is live at `https://playlist.arthurmendes.com`.
- `/health` returns `{"ok":true}` for the API.
- `/health` on the web service returns the expected `transferApiUrl`.
- `/privacy` and `/terms` load from the custom domain.

## Backend Environment

- `TRANSFER_API_HOST=0.0.0.0`
- `TRANSFER_API_STORAGE_DRIVER=supabase-rest`
- `SUPABASE_URL` is set.
- `SUPABASE_SERVICE_ROLE_KEY` is set only on the API service.
- `SUPABASE_TRANSFERS_TABLE=transfers`
- `APPLE_MUSIC_DEVELOPER_TOKEN` is set and current.
- `APPLE_MUSIC_STOREFRONT=us`
- Rate limiting is enabled.
- Anonymous transfer retention is configured.

## Web Environment

- `WEB_HOST=0.0.0.0`
- `TRANSFER_API_URL=https://playlist-transfer-api.onrender.com`
- Render custom domain points to the web service.
- Cloudflare DNS record for `playlist` is `DNS only` while Render manages TLS.

## Apple Music

- MusicKit identifier is configured for the public web origin.
- Apple Music authorization popup shows the PlaylistTransfer app icon/name.
- User authorization is requested only when creating the Apple Music playlist.
- Denying Apple Music authorization does not create a playlist.
- Retrying create after authorization succeeds.

## Product Smoke Test

Run this on `https://playlist.arthurmendes.com`:

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

- `page_view`
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

## Known MVP Caveats

- Public Spotify ingestion depends on public web/embed surfaces and can break if Spotify changes them.
- Apple Music matching is best-effort and storefront-sensitive.
- Anonymous sessions are not user accounts.
- Render free instances can spin down and make the first request slow.
- The current analytics layer is operational telemetry for MVP testing, not a full product analytics warehouse.
