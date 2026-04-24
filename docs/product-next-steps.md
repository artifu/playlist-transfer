# Product Next Steps

## Context

The first end-to-end technical spike is working.

The repo can now transfer a real user-owned Spotify playlist to Apple Music, create the Apple Music playlist, and produce local match reports.

That changes the project from "is this possible?" to "how do we make this a clean product?"

## Immediate priorities

### 1. Match quality and review UX

The first validation run exposed a useful matching issue:

- the track existed in Apple Music
- the first Apple search query returned the wrong candidate
- adding multiple query shapes fixed the miss and moved the test playlist from `98%` to `100%` match rate

This means matching quality is not only about scoring. It is also about search recall.

Next work:

- keep saving search candidates for debug
- add a `needs review` state for low-confidence matches
- show closest candidates for unmatched tracks
- allow manual candidate selection before transfer
- preserve a clean audit trail for each transfer item

### 2. Clean app experience

The current setup is intentionally technical:

- local `.env`
- Spotify refresh token helper
- Apple Music developer token helper
- Apple Music user token helper

That is fine for a spike and bad for a consumer product.

A real app should hide this behind:

- Spotify OAuth in the app
- Apple Music authorization through MusicKit
- backend-managed Apple developer tokens
- transfer jobs that run outside the mobile UI
- clear progress and result screens

### 3. Public Spotify link support

The biggest product question is whether the app can accept any Spotify playlist link.

What we know:

- user-owned playlists worked
- a Spotify-generated `Daily Mix` returned `404`
- a public playlist not accessible to the authenticated user returned `403`

Current product-safe promise:

> Transfer playlists from the Spotify account you connect.

Risky promise:

> Paste any Spotify playlist link and transfer it.

The second promise needs a dedicated investigation before it becomes part of the MVP.

## Recommended product flow

1. User pastes a Spotify playlist URL.
2. App extracts the playlist ID.
3. App asks for Spotify login if needed.
4. App checks whether the authenticated user can read the playlist.
5. If readable, app analyzes matches against Apple Music.
6. App shows matched, unmatched, and needs-review items.
7. User confirms transfer.
8. App creates the Apple Music playlist.
9. App shows final report and export options.

## Backend-ready shape

The spike should evolve toward these internal steps:

- `analyzeTransfer`: read Spotify playlist and produce match results
- `reviewTransfer`: allow manual fixes or candidate overrides
- `executeTransfer`: create destination playlist and add matched songs
- `writeReport`: export JSON/CSV artifacts

This maps naturally to a future backend:

- `POST /transfers/analyze`
- `GET /transfers/:id`
- `PATCH /transfers/:id/items/:itemId`
- `POST /transfers/:id/execute`
- `GET /transfers/:id/unmatched.csv`

## Next engineering milestones

### Milestone 1: Stabilize the core

- split analysis from execution
- add playlist URL parsing
- improve error messages for `403` and `404`
- keep transfer artifacts stable

Status:

- transfer analysis and execution are now split
- Spotify playlist URL parsing exists
- a local backend preview can visualize readable Spotify playlist contents

### Milestone 2: Add review semantics

- classify results as `matched`, `needs_review`, or `unmatched`
- include closest candidates in reports
- add manual override data shape

### Milestone 3: Prototype backend

- move provider orchestration into API routes
- keep secrets out of mobile clients
- persist transfer state
- make long-running transfers resumable

### Milestone 4: Mobile app shell

- build the connect/import/analyze/confirm/report flow
- keep ads and monetization out of the critical path until the transfer experience feels trustworthy

## Decision guardrails

- Do not promise arbitrary public Spotify link support until tested.
- Do not add ads before the first transfer experience is clean.
- Do not hide misses; unmatched reporting is the product's trust feature.
- Do not build every provider before the Spotify to Apple Music route is polished.
