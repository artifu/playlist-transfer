# PlaylistXfer Launch Roadmap

Last reviewed: 2026-05-15

This is the production launch runbook for moving the current PlaylistTransfer MVP to:

```text
https://playlistxfer.com
```

The goal is a fast, public, ad-ready web MVP with the static site on Cloudflare Pages and the transfer API still on Render.

## Launch Decisions

- Production domain: `https://playlistxfer.com`
- Redirect domain: `https://www.playlistxfer.com` -> `https://playlistxfer.com`
- Staging domain: `https://playlist.arthurmendes.com`
- Backend API: `https://playlist-transfer-api.onrender.com`
- Web host: Cloudflare Pages
- Apple Music auth timing: ask only when the user creates the Apple Music playlist
- Spotify auth: no Spotify login for MVP; use public playlist link ingestion

## Phase 0 - Already Done

- Domain `playlistxfer.com` purchased through Cloudflare Registrar.
- Render API is live.
- Supabase storage is configured.
- Cloudflare Pages-compatible files exist in the repo:
  - `wrangler.toml`
  - `functions/api/[[path]].js`
  - `functions/health.js`
  - `apps/web/public/_routes.json`
  - `apps/web/public/_redirects`
  - `apps/web/public/_headers`
- The landing page does not call the API or load MusicKit on initial page load.
- A static sponsor placeholder exists without loading a third-party ad script.

## Phase 1 - Cloudflare Pages Production Setup

Owner: Arthur

Create a Cloudflare Pages project from the GitHub repository:

```text
Repository: artifu/playlist-transfer
Production branch: main
Root directory: /
Build command: none
Build output directory: apps/web/public
```

Set this Pages environment variable:

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
- `/api/*` calls should proxy to the Render API only after user actions.

Keep `playlist.arthurmendes.com` as staging until production smoke tests pass.

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

## Phase 3 - Brand And SEO Code Pass

Owner: Codex

Update the web app and docs for the production brand:

- Page title: `PlaylistXfer - Transfer Spotify playlists to Apple Music`
- Meta description focused on public Spotify playlist transfer and transparent match review.
- Canonical URL: `https://playlistxfer.com`
- Open Graph and Twitter card metadata.
- Web manifest name and short name.
- Privacy and terms pages with the production domain and brand name.
- README and deployment docs with `playlistxfer.com` as production and `playlist.arthurmendes.com` as staging.
- Optional `robots.txt` and `sitemap.xml`.

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

Before requesting AdSense approval, add trust/content pages so the site is not just a thin utility shell:

- `About`
- `How it works`
- `FAQ`
- `Contact`
- Stronger privacy explanation for Apple Music authorization and anonymous transfer logs

Then, after AdSense gives the publisher id and `ads.txt` line:

- Add `ads.txt` at the site root.
- Add the AdSense verification/snippet carefully.
- Keep the first page load lightweight.
- Place the first ad/sponsor unit away from auth, progress, and the match report.

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
