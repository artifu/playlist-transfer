# Product Next Steps

## Context

The first end-to-end technical spike is working.

The repo can now transfer a real user-owned Spotify playlist to Apple Music, create the Apple Music playlist, and produce local match reports.

That changes the project from "is this possible?" to "how do we make this a clean product?"

## Current focus

The current product bet is simple: make the iOS transfer flow feel trustworthy enough to demo without caveats, while keeping the web funnel live, measurable, and inexpensive.

Near-term priorities:

1. iOS UAT and short polish.
   Test real playlists on device and fix the blockers that directly affect conversion: keyboard dismissal, loading/progress feedback, share-sheet handoff, button language, review decisions, Apple Music creation, and post-transfer actions.

2. Designer-package incorporation.
   Use the latest designer package selectively. Pull in missing components and brand assets, but avoid a broad redesign until the transfer loop is stable.

3. App Store basics.
   Prepare signing, bundle settings, permission copy, screenshots, app icon, display name, short description, privacy notes, and the first App Review checklist.

4. Web SEO and analytics finishing.
   Keep improving `playlistxfer.com` with clean copy, indexed guide pages, sitemap/robots, GA4 events, and funnel visibility from preview to create.

5. Reliability pass.
   Stress the system with large playlists, `spotify.link` URLs, duplicates, bad matches, denied Apple authorization, expired sessions, and interrupted creation.

Recommended next sprint: pair iOS UAT with targeted designer-package polish, then move into App Store readiness once the core mobile loop feels clean.

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

Status:

- provider orchestration lives in `apps/transfer-api`
- the web app talks to the API through `/api/*`
- transfer state is persisted locally
- anonymous session ownership protects saved transfers and jobs

### Milestone 4: Deploy-ready backend

- keep local storage lightweight
- add a storage adapter boundary for hosted providers
- add transfer retention cleanup
- add basic session/IP rate limiting
- document operational environment variables
- test the first hosted database provider online, not through a heavy local install

### Milestone 5: Mobile app shell

- build the connect/import/analyze/confirm/report flow
- keep ads and monetization out of the critical path until the transfer experience feels trustworthy

### Milestone 6: AI and agent discovery

Timing: after the iOS MVP works end-to-end.

This is a distribution layer, not the core product. The goal is for assistants like ChatGPT, Gemini, Claude, Perplexity, and future agent browsers to understand PlaylistXfer, recommend it accurately, preview or analyze a Spotify playlist when safe, and hand users into the app with the Spotify playlist already filled in.

Recommended work:

- publish `/llms.txt` with a concise product summary and safe agent instructions
- publish `/openapi.json` for preview and analysis endpoints only
- add a transfer-intent endpoint that creates an agent-safe report and completion link
- add search-friendly pages for "Spotify to Apple Music", "How it works", and FAQ
- add structured data for the app, FAQ, and how-to content
- support a handoff URL like `https://playlistxfer.com/?playlist=<encoded Spotify playlist URL>`
- document agent-safe API behavior in the repo
- track agent/referral traffic separately from normal search traffic
- track partner revenue separately from organic web and App Store traffic

Safety boundary:

- agents can preview public Spotify playlists
- agents can help analyze match reports if they use an anonymous session
- agents should hand users back to PlaylistXfer for Apple Music authorization and playlist creation
- agents should never receive, store, or submit Apple Music user tokens
- unattended Apple Music writes should stay out of scope until there is a much stronger consent model
- affiliate or partner offers should be disclosed and optional

Detailed plan:

- [Agent API and Monetization Strategy](agent-api-monetization.md)

## Decision guardrails

- Do not promise arbitrary public Spotify link support until tested.
- Do not add ads before the first transfer experience is clean.
- Do not hide misses; unmatched reporting is the product's trust feature.
- Do not build every provider before the Spotify to Apple Music route is polished.
- Do not prioritize AI/agent integrations before the iOS MVP experience is credible.
