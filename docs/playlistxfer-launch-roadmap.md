# PlaylistXfer Launch Roadmap

Last reviewed: 2026-07-13

This is the production launch runbook for moving the current PlaylistTransfer MVP to:

```text
https://playlistxfer.com
```

The goal is a fast, public, ad-ready web MVP with the static site and normal transfer API path on Cloudflare Pages. Render and Supabase are now fallback-only; the production path should not depend on either service being awake.

## Launch Decisions

- Production domain: `https://playlistxfer.com`
- Redirect domain: `https://www.playlistxfer.com` -> `https://playlistxfer.com`
- Staging domain: `https://playlist.arthurmendes.com`
- Backend API: Cloudflare Pages Functions with D1; `https://playlist-transfer-api.onrender.com` as fallback only
- Web host: Cloudflare Pages
- Apple Music auth timing: ask only when the user creates the Apple Music playlist
- Spotify auth: no Spotify login for MVP; use public playlist link ingestion

## Phase 0 - Already Done

- Domain `playlistxfer.com` purchased through Cloudflare Registrar.
- Render API was validated and remains a rollback target only.
- Supabase storage was validated as a fallback path but is not required for normal production operation.
- Cloudflare Pages API is live in native mode with D1 for the production path.
- Cloudflare Pages-compatible files exist in the repo:
  - `wrangler.toml`
  - `functions/api/[[path]].js`
  - `functions/health.js`
  - `apps/web/public/_routes.json`
  - `apps/web/public/_headers`
- Cloudflare Pages clean URLs serve `/privacy` from `privacy.html` and `/terms` from `terms.html`.
- The landing page does not call the API or load MusicKit on initial page load.
- Google Analytics and AdSense verification are wired, with manual ad placement deferred until approval.

## Phase 1 - Cloudflare Pages Production Setup

Owner: Arthur

Create a Cloudflare Pages project from the GitHub repository:

```text
Repository: artifu/playlist-transfer
Project name: playlist-transfer
Production branch: main
Root directory: /
Build command: none
Build output directory: apps/web/public
```

Set this Pages environment variable only as rollback config:

```bash
TRANSFER_API_URL=https://playlist-transfer-api.onrender.com
```

Add custom domains in the Pages project:

```text
playlistxfer.com
www.playlistxfer.com
```

Expected behavior:

- `https://playlistxfer.com` serves the app.
- `https://www.playlistxfer.com` redirects to `https://playlistxfer.com`.
- Static page views should not wake the Render API.
- `/api/*` calls should use D1 native mode. Render proxy mode should be used only as rollback.

Keep `playlist.arthurmendes.com` as staging until production smoke tests pass.

Create a Cloudflare Redirect Rule for `www`:

```text
If incoming requests match: Hostname equals www.playlistxfer.com
Then: Dynamic redirect
Expression: concat("https://playlistxfer.com", http.request.uri.path)
Status code: 301
Preserve query string: enabled
```

## Phase 2 - Apple Music / MusicKit Production Origin

Owner: Arthur

In Apple Developer, update the MusicKit / Apple Music web configuration so the production origin is allowed:

```text
https://playlistxfer.com
```

If Apple asks for additional web domains or return origins, include:

```text
https://www.playlistxfer.com
https://playlist.arthurmendes.com
```

Keep the same Apple Music key id, team id, and developer token flow unless Apple forces a new identifier. The app should still connect late: users can preview and analyze first, then authorize Apple Music only when creating the playlist.

Validation:

- Click `Create Apple Music playlist` on `https://playlistxfer.com`.
- Confirm the Apple access dialog shows the PlaylistXfer app/domain, not `127.0.0.1` or the old Render hostname.
- Deny once and confirm no playlist is created.
- Retry, allow, and confirm creation succeeds.

## Phase 2.5 - Cloudflare-Native API Cutover

Owner: Arthur + Codex

Status: implemented for the normal production path.

Goal: remove the Render free-tier cold start from normal transfers while keeping Render as a rollback path.

Cloudflare setup:

```text
D1 database: playlist-transfer
Pages D1 binding: PLAYLIST_TRANSFER_DB
```

Pages environment variables:

```bash
APPLE_MUSIC_DEVELOPER_TOKEN=your-apple-developer-token
APPLE_MUSIC_STOREFRONT=us
TRANSFER_API_URL=https://playlist-transfer-api.onrender.com
```

Expected health response after redeploy:

```json
{
  "apiMode": "cloudflare-native",
  "nativeApiConfigured": true,
  "hasAppleDeveloperToken": true
}
```

Cutover smoke test:

1. Open `https://playlistxfer.com`.
2. Paste a public Spotify playlist.
3. Preview.
4. Analyze full playlist.
5. Approve or skip one review candidate.
6. Create Apple Music playlist.
7. Confirm the playlist appears in Apple Music.
8. Confirm Render logs do not wake for this flow.

Rollback:

- Remove or rename the `PLAYLIST_TRANSFER_DB` Pages binding.
- Redeploy Pages.
- `/health` should return `apiMode: "render-proxy"` and `/api/*` will proxy to Render again.

## Phase 3 - Brand And SEO Code Pass

Owner: Codex

Status: implemented in the web shell.

Update the web app and docs for the production brand:

- Page title: `PlaylistXfer - Transfer Spotify playlists to Apple Music`
- Meta description focused on public Spotify playlist transfer and transparent match review.
- Canonical URL: `https://playlistxfer.com`
- Open Graph and Twitter card metadata.
- Web manifest name and short name.
- Privacy and terms pages with the production domain and brand name.
- README and deployment docs with `playlistxfer.com` as production and `playlist.arthurmendes.com` as staging.
- `robots.txt` and `sitemap.xml`.

Do not add AdSense scripts in this phase unless the AdSense account/site approval flow is ready.

## Phase 4 - Production Smoke Test

Owner: Arthur + Codex

Run these checks on `https://playlistxfer.com`:

```bash
curl https://playlistxfer.com/health
curl https://playlistxfer.com/privacy
curl https://playlistxfer.com/terms
curl -I https://www.playlistxfer.com
```

Expected:

- `/health` returns `host: "cloudflare-pages"`.
- `/health` returns `apiMode: "cloudflare-native"` once D1 is bound, or `render-proxy` before cutover.
- `/privacy` and `/terms` return HTML.
- `www` redirects to the apex domain.
- The first page load does not create a `playlist_transfer_event` log line.

Product flow:

1. Paste a known public Spotify playlist.
2. Preview the playlist.
3. Analyze the full playlist.
4. Approve or skip at least one review row if available.
5. Click `Create Apple Music playlist`.
6. Authorize Apple Music if prompted.
7. Confirm the receipt counts make sense.
8. Confirm the playlist appears in Apple Music.
9. Confirm Render API logs show only safe structured event data.

## Phase 5 - Ad-Readiness Pass

Owner: Codex + Arthur

Priority: after the iOS MVP unless the web page starts receiving meaningful organic traffic first.

Before requesting AdSense approval, add trust/content pages so the site is not just a thin utility shell:

- `About`
- `How it works`
- `FAQ`
- `Contact`
- Stronger privacy explanation for Apple Music authorization and anonymous transfer logs

AdSense publisher id:

```text
ca-pub-8103940626356369
```

Current deployed verification:

```text
/ads.txt
Google AdSense script in the public web shell
```

Ad policy for MVP:

- Do not enable Auto Ads.
- Use manual placements only.
- Keep ads away from URL entry, Apple Music authorization, progress, review controls, and create actions.

Then, after AdSense approves the site:

- Place the first ad/sponsor unit away from auth, progress, and the match report.

Current status:

- Trust/content pages and navigation are live.
- AdSense account and site record exist for publisher `ca-pub-8103940626356369`.
- The ownership-verification script and root `ads.txt` entry are deployed.
- Auto Ads and manual ad units remain disabled while site approval is pending.
- Remaining external step: Google site review and consent-message configuration.
- Preferred first placement: one responsive manual unit below supporting content or after a completed result, never adjacent to a transfer action.

## Phase 5.5 - iOS App Store Readiness

Owner: Codex + Arthur

Status: release package and privacy manifest prepared; unsigned Release archive preflight passed; signed Organizer validation, final screenshots, TestFlight, and submission remain.

- Ship version `1.0` build `1` as iPhone-only.
- Use `com.artifu.playlistxfer` and `com.artifu.playlistxfer.shareextension`.
- Complete App Store metadata, privacy answers, content-rights declaration, and age rating.
- Run signed `Validate App`, upload the archive, and complete the clean-install TestFlight gate.
- Use the prepared reviewer flow and public Spotify test playlist.
- Capture screenshots only after the final icon and visual pass.

See [app-store-release.md](/Users/arthur_t_m/Documents/PlaylistTransfer/docs/app-store-release.md).
See [testflight-runbook.md](/Users/arthur_t_m/Documents/PlaylistTransfer/docs/testflight-runbook.md).

## Phase 6 - Post-iOS AI and Agent Discovery

Owner: Codex + Arthur

Priority: after the iOS MVP app is working end-to-end.

This phase is intentionally deferred. The opportunity is real: users may ask ChatGPT, Gemini, Claude, Perplexity, or other agents how to move Spotify playlists into Apple Music. PlaylistXfer should be easy for those systems to understand, cite, preview or analyze through safe endpoints, and hand off to.

The product rule:

- Agents may help users understand, preview, and analyze a public Spotify playlist.
- Agents should not create Apple Music playlists unattended.
- Final Apple Music creation should happen in the PlaylistXfer browser/app experience, where the user can review matches and authorize Apple Music directly.
- Partner or affiliate offers must be optional and disclosed.

Recommended public assets:

- `/llms.txt`: short agent-readable summary, canonical links, safe usage rules, and API notes.
- `/openapi.json`: OpenAPI description for agent-safe read/analysis endpoints.
- `/api/agent/capabilities`: compact machine-readable capability statement.
- `/api/agent/transfer-intents`: creates a saved transfer-intent summary and completion link.
- `/spotify-to-apple-music`: search-friendly transfer guide.
- `/how-it-works`: trust-focused explanation of preview, match review, and late Apple authorization.
- `/faq`: FAQ with structured data.
- JSON-LD on the main page for `SoftwareApplication`.
- JSON-LD on FAQ/guide pages for `FAQPage` and `HowTo`.

Recommended agent-safe API surface:

```text
GET /health
GET /api/agent/capabilities
POST /api/agent/transfer-intents
GET /api/agent/transfer-intents/{id}
POST /api/spotify/public-playlist-preview
POST /api/transfers/analyze-public-job
GET /api/jobs/{jobId}
```

Do not expose these as public agent actions until there is an explicit consent design:

```text
POST /api/apple-music/user-token
POST /api/transfers/create-public-job
PATCH /api/transfers/:id/items/:index
```

Recommended handoff URL:

```text
https://playlistxfer.com/?playlist=<encoded Spotify playlist URL>
```

Recommended transfer-intent URL:

```text
https://playlistxfer.com/t/<transfer-intent-id>?ref=<partner-id>
```

Expected agent behavior:

1. User asks an assistant how to transfer a Spotify playlist to Apple Music.
2. Assistant recommends PlaylistXfer and explains that creation requires user consent.
3. If the user provides a playlist link, assistant may preview or analyze using safe API endpoints.
4. Assistant sends the user to a prefilled PlaylistXfer URL or saved transfer-intent URL.
5. User reviews matches, approves any fuzzy rows, connects Apple Music, and creates the playlist.

Validation checklist:

- `/llms.txt` is reachable and concise.
- `/openapi.json` validates as OpenAPI.
- The OpenAPI file does not expose Apple Music write endpoints.
- The handoff URL pre-fills the playlist box without auto-starting API work.
- The landing page still does not wake the API on initial load.
- Search snippets and agent summaries describe the product accurately.
- Logs can identify agent referrals without storing sensitive playlist or Apple user-token data.

Success metrics:

- Visits from known AI/chat referrers.
- Visits with a prefilled playlist URL.
- Preview starts from prefilled URLs.
- Analyze starts from prefilled URLs.
- Completed transfers from agent referrals.
- Transfer intents created by partner id.
- Premium starts, affiliate clicks, or ad revenue attributed to agent referrals.
- Support tickets caused by incorrect agent instructions.

Detailed strategy: [Agent API and Monetization Strategy](agent-api-monetization.md).

## Rollback Plan

If production has issues:

- Keep `playlist.arthurmendes.com` available as staging.
- Keep the Render web service available as a fallback until Cloudflare Pages is stable.
- Repoint `playlistxfer.com` back to a simple maintenance page or Cloudflare Pages rollback if needed.
- Do not change the Render API domain during this launch unless necessary.

## Definition Of Live

The page is considered live when:

- `https://playlistxfer.com` loads the product web app.
- `www` redirects to the apex domain.
- Apple Music authorization works from the production domain.
- A real playlist can be previewed, analyzed, and created.
- The landing page does not wake the API on load.
- Privacy, terms, and basic launch docs are reachable.
