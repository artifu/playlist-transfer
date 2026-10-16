# Roadmap

Agent transfer track: [Roadmap de transferência pelo agente](agent-transfer-roadmap.md). This is the current plan for authenticated MCP tools, conversational match review, and agent-driven playlist creation. Monetization is outside that track; the existing web/iOS roadmap remains below.

Last reviewed: 2026-10-16

## Current Position

PlaylistXfer is publicly available on the [App Store](https://apps.apple.com/us/app/playlistxfer/id6791439177), and the production web flow can:

- read public Spotify playlist links without Spotify OAuth when Spotify public surfaces cooperate
- analyze Apple Music catalog matches
- show customer-facing Matched, Unsure, and No match groups
- save review decisions server-side
- request Apple Music access at create time
- create an Apple Music playlist from confident or approved matches
- accept an individual Spotify song link through the same web/iOS input
- add an approved song to a reusable `PlaylistXfer Inbox` in the native app
- search the Apple Music catalog manually and replace an incorrect or missing match

The matching pipeline now resolves ISRCs in Apple Music batches of up to 25, caches catalog results in D1 for 30 days, and runs bounded concurrent text fallback only for unresolved tracks. This replaces the previous mostly sequential search path and is the baseline for the next performance UAT.

Local development keeps a small SQLite store for convenience. Production uses Cloudflare D1 for durable transfer and analytics data, with Oracle as the primary ingestion dependency and Render as the fallback.

## Immediate Next Sprint

The product is launched. The next sprint is post-launch stabilization and measurement rather than another redesign.

1. Local-first iOS ingestion and matching with remote fallback. **Implementation complete; device UAT remains part of regression coverage.**
   Read public Spotify playlist/song metadata on-device without Spotify OAuth, perform Apple Music catalog search and matching with MusicKit on-device, and write to Apple Music only after confirmation. Keep the hosted ingestion/matching API behind a feature-controlled fallback for Spotify surface changes, device/network incompatibilities, and emergency recovery. Instrument local success, fallback reason, fallback success, duration, playlist size, and completeness without logging full URLs or library contents. Ship only after side-by-side quality and completeness tests prove that local results match or beat the current hosted path.

2. iOS UAT and short polish.
   Test 5-10 real Spotify playlists on device and fix conversion blockers first: keyboard behavior, loading states, share-sheet handoff, button labels, review-row decisions, Apple Music creation, and post-transfer actions.

3. Designer-package incorporation.
   Pull only the useful missing components from the latest `DesignSuggestions/newpackage/` drop. Avoid a full redesign for now; focus on final icon/brand assets, mobile layout polish, loading states, match cards, and the post-transfer screen.

4. App Store maintenance.
   Keep screenshots, privacy disclosures, release notes, support URL, icon, and MusicKit permission copy current for each release. The public listing is `https://apps.apple.com/us/app/playlistxfer/id6791439177`.

5. Web SEO and analytics operations.
   Keep `playlistxfer.com` metadata, guide pages, sitemap/robots, GA events, Search Console status, and the preview → analyze → review → create funnel healthy. Code instrumentation and the GA4 `playlist_transfer_completed` key event are implemented; dashboards and indexing need ongoing review rather than new product UI.

6. Reliability pass.
   Test large playlists, individual song links, `spotify.link` URLs, duplicates, bad matches, denied Apple authorization, expired sessions, and interrupted creation. This is the pass that turns the demo into a product.

Recommended sequencing: protect the released transfer loop with device regression tests and production monitoring, review Search Console and GA4 regularly, then prioritize reliability and retention work over landing-page redesigns.

## Phase 0: Technical Validation

Status: mostly complete.

- Confirm Spotify and Apple Music API constraints.
- Prototype Apple Music catalog matching and playlist writes.
- Validate public Spotify playlist ingestion.
- Validate review-before-write UX.
- Measure real-world match rate on more sample playlists.
- Estimate cost per transfer once a hosted backend is running.

## Phase 1: Deploy-Ready API

Goal: make the backend safe enough to put behind a public web/mobile client.

- Keep SQLite as the local storage driver.
- Add a storage adapter boundary so managed Postgres, D1, Supabase, or Neon can be tested without changing the app contract.
- Add anonymous-session ownership for jobs and saved transfers.
- Add retention cleanup for anonymous transfer data.
- Add basic session/IP rate limiting.
- Keep provider secrets out of mobile/web clients.
- Add clear operational knobs through environment variables.
- Keep the old demo server intact as the product lab.

## Phase 2: Web MVP Product

- Spotify to Apple Music only.
- Public-link ingestion as the primary path.
- Guided Spotify fallback when public-link ingestion fails.
- Apple Music authorization at create time.
- Clean transfer receipt.
- First hosted API deployment.
- First mobile app shell after the API contract is stable.

## Phase 3: iOS MVP App

Goal: turn the working web transfer flow into a credible mobile-first product.

Why this comes before AI/agent distribution:

- The core user promise is still a consumer transfer experience, not an API product.
- Apple Music authorization and playlist creation are inherently user-consented flows.
- A strong iOS app gives the project a clearer App Store story, better trust, and a more natural place for Apple Music permissions.
- Agent integrations can drive traffic later, but they should hand off to a polished product surface.

Recommended scope:

- Native or mobile-shell import screen for a Spotify playlist URL.
- Apple Music authorization using the production MusicKit setup.
- Public Spotify playlist preview.
- Unified playlist/song link input with automatic resource detection.
- Full-playlist analysis by default.
- Match report with ready, review, and missing groups.
- Approve suggested match and skip track review actions.
- Create Apple Music playlist only after explicit user confirmation.
- Add individual songs to `PlaylistXfer Inbox` only after explicit user confirmation.
- Transfer receipt with counts, destination playlist name, and not-moved summary.
- Basic error recovery for expired Apple sessions, API timeout, Spotify blocked links, and Render/Supabase failures.

Important product constraints:

- Do not require Spotify login for the MVP unless public-link ingestion becomes too fragile.
- Do not add ads inside the critical transfer progress path.
- Do not promise background transfer until job reliability is proven on real playlists.
- Do not add Android until the iOS flow proves the main funnel.

Definition of done:

- A user can open the app, paste a public Spotify playlist, analyze it, approve/skip review rows, authorize Apple Music, and create the destination playlist.
- The app handles a 500-track playlist without feeling frozen.
- Transfer results match the hosted web behavior.
- Logs are useful enough to debug failed transfers without exposing Apple Music user tokens or private playlist data.

## Phase 4: Product Polish

- Manual candidate search for review rows. Implemented in the native app, with privacy-minimized quality feedback.
- Saved transfer history. Implemented locally on-device with open, refresh, individual delete, and clear-all controls.
- Duplicate protection for repeated Inbox imports and existing-playlist updates. Implemented using Apple catalog IDs and ISRCs; duplicate checks stay on-device and only aggregate counts are logged.
- Better confidence scoring and match cache.
- Smart Refresh for public Spotify playlists without Spotify OAuth: detect additions/removals from saved links, present a clear diff, and update Apple Music only after explicit confirmation. Product and architecture proposal: [smart-refresh-product-spec.md](./smart-refresh-product-spec.md).
- Next major product step: optional Spotify OAuth together with batch import. Connect once, select multiple public/private playlists plus Liked Songs or saved albums, then process them through a resumable queue with independent results. Keep the public-link path available without login.
- Full unattended synchronization only after Smart Refresh proves useful. Removal, ordering, user edits, background reliability, and conflict behavior need explicit product rules.
- Do not build batch as a separate pasted-link queue first; its value is materially stronger when paired with Spotify library selection through optional OAuth.
- Freemium usage limits.
- Analytics and crash reporting.
- One-time pass or low-cost purchase flow.

## Phase 5: Public Website, SEO, and Ads

Goal: make `playlistxfer.com` discoverable and monetizable without slowing down the transfer tool.

Status: launched and operational. The production site has a focused transfer landing page, canonical guide and editorial pages, trust/legal pages, GA4 plus first-party funnel analytics, production monitoring, and a public App Store link.

Recommended scope:

- Keep the static landing page on Cloudflare Pages so normal page views do not wake the API.
- Add durable content pages for search intent:
  - `How it works`
  - `FAQ`
  - `Spotify to Apple Music transfer guide`
  - `Contact`
  - stronger `Privacy` and `Terms`
- Add structured data for the web app and FAQ pages.
- Add `robots.txt`, `sitemap.xml`, canonical URLs, Open Graph tags, and branded metadata.
- Add AdSense verification only after the trust pages exist.
- Keep the first ad placement away from auth, progress, and match review.
- Track search traffic, preview starts, analyze starts, and completed transfers as separate funnel events.

Guardrails:

- Search/ads should not wake the transfer API on page load.
- Ad scripts should be deferred and should not block the import form.
- SEO copy should be honest: "public Spotify playlist links" and "review before creating" are safer promises than "any playlist instantly."
- The production app should continue working if ads fail to load.

Current SEO and analytics operations:

- Branded 1200x630 Open Graph image and App Store download link are part of the public site.
- Google Search Console owns the verified production property. The eight-URL sitemap was successfully resubmitted and read on 2026-10-16; resubmit it after meaningful canonical-page updates and inspect canonical URLs rather than retired redirects.
- `GA_MEASUREMENT_ID` is configured in production. `playlist_transfer_completed` is the stable GA4 key event, and the saved `PlaylistXfer web transfer funnel` exploration tracks the visit-to-transfer path by device category. First-party D1 events remain the operational source of truth when GA4 is blocked.
- AdSense belongs only on substantive editorial pages, never in the transfer, authorization, progress, review, error, contact, or legal flows.

Post-indexing editorial consolidation (implemented August 17, 2026):

- Follow the detailed implementation and migration plan in [web-guide-consolidation-spec.md](./web-guide-consolidation-spec.md).
- Baseline captured before consolidation: 0 Search clicks, 7 indexed pages, and 10 not-indexed pages in the verified URL-prefix property.
- Reduced the sitemap from 17 public URLs to 8 stronger canonical pages; quality and clear intent matter more than the raw page count.
- Made `/guides` the authoritative product manual and merged `/spotify-to-apple-music`, `/how-it-works`, and `/faq` into anchored sections.
- Folded `/public-vs-private-spotify-playlists` and `/spotify-playlist-not-loading` into the `/guides` readiness and troubleshooting sections.
- Folded `/spotify-to-apple-music-missing-songs` and `/after-spotify-to-apple-music-transfer` into the `/guides` recovery and verification sections.
- Keep matching methodology, the large-playlist guide, About, Contact, Privacy, and Terms as distinct pages while each continues to provide a separate purpose. Internal test ledgers and incident reports are not public product content.
- Permanent 301 redirects, canonical links, internal links, `llms.txt`, sitemap entries, and safe guide analytics were updated together; no retired URL returns a 404.
- After any canonical-page update, verify production and resubmit the sitemap in Search Console. Request a new AdSense review only after Google can crawl the consolidated guide and redirects.

## Phase 6: AI and Agent Distribution

Goal: make PlaylistXfer easy for ChatGPT, Gemini, Claude, Perplexity, and other agents to discover, explain, preview, analyze, and hand users off to the product after the iOS app is solid.

Why this is post-iOS:

- Agents can create demand, but the conversion moment is still a human approving Apple Music access.
- A user who discovers the app through an agent needs a trusted destination that works beautifully on mobile.
- Publishing an API too early can create support load before the consumer funnel is stable.

Recommended AI-facing assets:

- Add `/llms.txt` with a concise product summary, safe usage guidance, and canonical links.
- Add `/openapi.json` for agent-safe endpoints.
- Add an agent transfer-intent API that returns a match summary and user completion link.
- Add `/spotify-to-apple-music` as a plain-language guide agents can quote and link to.
- Add JSON-LD structured data for:
  - `SoftwareApplication`
  - `FAQPage`
  - `HowTo`
- Add docs for "Using PlaylistXfer from an agent" in the repo.
- Add referral and partner attribution so agent handoffs can be measured and monetized without misleading users.
- Add a handoff URL pattern:

```text
https://playlistxfer.com/?playlist=<encoded Spotify playlist URL>
```

Agent-safe API scope:

- Allow agents to validate/preview a public Spotify playlist link.
- Allow agents to start an analysis job only with an anonymous session id.
- Allow agents to poll analysis job status.
- Return match summaries, not Apple Music user credentials.
- Never expose Apple Music user tokens to agents.
- Never let an unattended agent create or modify a user's Apple Music library.

Recommended OpenAPI endpoints:

- `GET /health`
- `GET /api/agent/capabilities`
- `POST /api/agent/transfer-intents`
- `GET /api/agent/transfer-intents/{id}`
- `POST /api/spotify/public-playlist-preview`
- `POST /api/transfers/analyze-public-job`
- `GET /api/jobs/{jobId}`

Do not expose as an agent action yet:

- `POST /api/apple-music/user-token`
- `POST /api/transfers/create-public-job`
- any endpoint that writes to Apple Music without the user being present in the browser/app

Ideal assistant behavior:

- If a user asks "how do I transfer this Spotify playlist to Apple Music?", the assistant should explain the flow and link to PlaylistXfer.
- If the user provides a public Spotify playlist URL, the assistant may preview/analyze it when possible.
- For final creation, the assistant should send the user to PlaylistXfer with the playlist prefilled so the user can review matches and authorize Apple Music directly.

Example agent handoff:

```text
I can help you preview the playlist, but Apple Music creation needs your permission.
Open this link to review matches and create the playlist:
https://playlistxfer.com/?playlist=https%3A%2F%2Fopen.spotify.com%2Fplaylist%2F...
```

Success metrics:

- Agent referral visits.
- Transfer intents created by agents.
- Prefilled playlist URL visits.
- Preview starts from agent referrals.
- Analyze starts from agent referrals.
- Completed transfers from agent referrals.
- Premium starts, affiliate clicks, and revenue by partner id.
- Support tickets caused by agent-generated instructions.

Detailed plan: [Agent API and Monetization Strategy](agent-api-monetization.md).

## Phase 7: Expansion

- Android app after the iOS funnel works.
- YouTube Music support.
- Deezer support.
- Batch multi-playlist transfer.
- Family migration flow.
- Background sync and recurring transfer jobs.

## Kill criteria

Stop or pivot if:

- API restrictions make acquisition too fragile.
- Match quality is too low to earn trust.
- Support cost overwhelms free-tier economics.
- App store approval becomes unstable.
