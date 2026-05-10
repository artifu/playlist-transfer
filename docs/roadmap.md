# Roadmap

Last reviewed: 2026-05-10

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

## Phase 2: MVP Product

- Spotify to Apple Music only.
- Public-link ingestion as the primary path.
- Guided Spotify fallback when public-link ingestion fails.
- Apple Music authorization at create time.
- Clean transfer receipt.
- Unmatched-track export.
- First hosted API deployment.
- First mobile app shell after the API contract is stable.

## Phase 3: Polish

- Manual candidate search for review rows.
- Saved transfer history if users ask for it.
- Better confidence scoring and match cache.
- Support private Spotify playlists where allowed.
- Freemium usage limits.
- Analytics and crash reporting.
- One-time pass or low-cost purchase flow.

## Phase 4: Expansion

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
