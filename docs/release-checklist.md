# MVP Release Checklist

Last reviewed: 2026-07-13

Use this checklist before sharing a public PlaylistXfer link with testers, recruiters, or app-store reviewers.

For the production domain launch sequence, use [playlistxfer-launch-roadmap.md](/Users/arthur_t_m/Documents/PlaylistTransfer/docs/playlistxfer-launch-roadmap.md).

## Hosted Services

- Cloudflare Pages API mode is `cloudflare-native` for the normal production path.
- Render API service at `https://playlist-transfer-api.onrender.com` is fallback only and should not be required for normal production transfers.
- Cloudflare Pages web service is live for `https://playlistxfer.com`.
- `https://www.playlistxfer.com` redirects to `https://playlistxfer.com`.
- `https://playlist.arthurmendes.com` remains available as staging or fallback.
- Render web service at `https://playlist-transfer-web-esj4.onrender.com` is legacy fallback only.
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
- Render/Supabase variables are fallback-only and are not required for the Cloudflare-native production path.
- `APPLE_MUSIC_DEVELOPER_TOKEN` is set and current.
- `APPLE_MUSIC_STOREFRONT=us`
- Rate limiting is enabled.
- Anonymous transfer retention is configured.
- D1 rejects transfer restoration after the configured retention window and opportunistically deletes expired transfers, jobs, and cache rows.

## Web Environment

- Cloudflare Pages may keep `TRANSFER_API_URL=https://playlist-transfer-api.onrender.com` as rollback config.
- Cloudflare Pages has `PLAYLIST_TRANSFER_DB` D1 binding when using native mode.
- Cloudflare Pages has `GA_MEASUREMENT_ID=G-XXXXXXXXXX` if Google Analytics should load.
- Cloudflare Pages build output directory is `apps/web/public`.
- Cloudflare Pages Functions are active only for `/api/*`, `/health`, and `/config.js`.
- `/config.js` returns safe public runtime config and does not expose backend secrets.
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

## iOS App Store Release

Use [app-store-release.md](/Users/arthur_t_m/Documents/PlaylistTransfer/docs/app-store-release.md) for the prepared metadata, privacy inventory, reviewer notes, screenshots, and TestFlight gate.

- Version is `1.0` and build is `1`.
- The first release targets iPhone only.
- Main and Share Extension bundle identifiers exist in Apple Developer.
- Unsigned generic-device Release archive passes the local source/package preflight.
- Archived app contains `PrivacyInfo.xcprivacy`, compiled icons, and the embedded Share Extension.
- Signed archive passes `Validate App` in Xcode Organizer before upload.
- App Privacy answers match the final native event and storage behavior.
- App Store Privacy URL is `https://playlistxfer.com/privacy`.
- Support URL is `https://playlistxfer.com/contact`.
- A clean TestFlight install passes playlist, song, Share Extension, MusicKit authorization, candidate review, and creation tests.
- Current cream two-record icon assets are installed; final icon approval and final screenshots happen after the final visual pass.

## Web AdSense Readiness

- `playlistxfer.com` is added to AdSense and ownership is verified.
- AdSense reports the site as `Ready` before production ads are enabled.
- Public publisher id is `ca-pub-8103940626356369`; no account password is shared.
- `/ads.txt` returns HTTP 200 from the root domain and contains the exact publisher id.
- Privacy copy explains Google advertising/cookies before ad scripts are enabled.
- A Google-certified consent message/CMP is configured for the EEA, UK, and Switzerland.
- The first responsive ad unit is placed away from URL entry, Apple authorization, progress, review controls, and the create button.
- Ad scripts load asynchronously and reserve layout space to avoid layout shift.
- Google and AdSense crawlers are not blocked by Cloudflare or `robots.txt`.
- Auto Ads stay disabled. Use manual placements only so ads never interrupt the transfer flow.

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

The MVP uses Google Analytics for aggregate traffic/acquisition and first-party structured logs for transfer reliability.

In Google Analytics, confirm page views arrive for:

- `/`
- `/spotify-to-apple-music`
- `/faq`

After a real transfer test, confirm funnel events arrive in GA4 DebugView or Realtime:

- `preview_succeeded` or `preview_failed`
- `analysis_succeeded` or `analysis_failed`
- `transfer_create_succeeded` or `transfer_create_failed`

In Cloudflare Pages Function logs, or Render logs for `playlist-transfer-api` if using fallback mode, filter or search for:

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

The web page should not wake the Transfer API on initial load. Open the page in a fresh browser session and confirm no new `playlist_transfer_event` line appears until you click preview, analyze, connect, or create. Google Analytics page views may still fire if `GA_MEASUREMENT_ID` is configured.

## Known MVP Caveats

- Public Spotify ingestion depends on public web/embed surfaces and can break if Spotify changes them.
- Apple Music matching is best-effort and storefront-sensitive.
- Anonymous sessions are not user accounts.
- Render free instances can spin down and make the first request slow only when the site is deliberately in Render proxy fallback mode.
- Cloudflare-native mode avoids Render cold starts, but very large playlists still depend on Spotify/Apple response times and Cloudflare execution limits.
- The current analytics layer is operational telemetry for MVP testing, not a full product analytics warehouse.
