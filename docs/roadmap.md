# Roadmap

Last reviewed: 2026-05-19

## Current Position

PlaylistTransfer has moved past technical feasibility. The local product web shell can:

- read public Spotify playlist links without Spotify OAuth when Spotify public surfaces cooperate
- analyze Apple Music catalog matches
- show ready, review, and missing groups
- save review decisions server-side
- request Apple Music access at create time
- create an Apple Music playlist from confident or approved matches

The current local backend uses a small SQLite file for developer convenience. It should stay lightweight on local machines while the production storage target is tested online.

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
- Unmatched-track export.
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
- Full-playlist analysis by default.
- Match report with ready, review, and missing groups.
- Approve suggested match and skip track review actions.
- Create Apple Music playlist only after explicit user confirmation.
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

- Manual candidate search for review rows.
- Saved transfer history if users ask for it.
- Better confidence scoring and match cache.
- Support private Spotify playlists where allowed.
- Freemium usage limits.
- Analytics and crash reporting.
- One-time pass or low-cost purchase flow.

## Phase 5: Public Website, SEO, and Ads

Goal: make `playlistxfer.com` discoverable and monetizable without slowing down the transfer tool.

Status: foundation in progress. The production site now has search-focused static pages for the main Spotify to Apple Music intent, how the matching flow works, FAQ, about, contact, privacy, and terms.

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

Next SEO tasks:

- Add a branded 1200x630 Open Graph image instead of reusing the SVG favicon.
- Add Google Search Console, submit `https://playlistxfer.com/sitemap.xml`, and request indexing for the homepage, guide, how-it-works, and FAQ pages.
- Add lightweight analytics for organic landing-page visits without waking the transfer API.
- Consider AdSense only after Search Console sees indexed pages and the privacy/contact/about pages are stable.

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
