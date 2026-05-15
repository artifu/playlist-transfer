# PlaylistTransfer

PlaylistTransfer is a music migration product focused on helping users move playlists between streaming services without losing visibility into what did and did not transfer.

It is also being developed as an open, inspectable reference implementation so other builders can understand, reproduce, or adapt the transfer flow by hand.

The current wedge is deliberately narrow:

- source: Spotify
- destination: Apple Music
- priority: technical feasibility first
- hero feature: transparent unmatched-track reporting

## Why this exists

Switching music services is surprisingly painful. People spend years curating playlists, and that history becomes lock-in.

Most transfer tools fail in one of three ways:

- they are too expensive for a one-time migration
- they hide or poorly explain failed matches
- they feel untrustworthy at the exact moment a user must grant account access

PlaylistTransfer is built around a simpler promise:

> Move your playlist in minutes and see exactly what did not make it over.

## Current status

This repository is in the `technical validation` stage.

What exists today:

- product direction and planning docs
- API feasibility notes
- a local TypeScript spike for `Spotify -> Apple Music`
- report generation for matched and unmatched tracks
- an open repository structure meant to be easy to inspect and replicate
- a local mobile-first MVP preview with public Spotify import, Apple Music matching, review decisions, late Apple Music authorization, and playlist creation

What does not exist yet:

- React Native mobile app
- billing, ads, or polished UI
- full retry and manual-correction flows

## Deployable API

The app-ready API lives in `apps/transfer-api`, and the product web shell lives in `apps/web`. The repo includes a Render Blueprint at `render.yaml` for both services.

For the first hosted MVP, use:

- Render Web Service for the Node API.
- Cloudflare Pages for the product web shell.
- Supabase Postgres through the `supabase-rest` storage adapter.
- Optional custom domain such as `playlist.arthurmendes.com` for a real public testing origin.

See [docs/deployment.md](./docs/deployment.md) for setup steps, Supabase schema, Render API settings, Cloudflare Pages settings, and required environment variables.

## Technical spike

The repo includes a local TypeScript spike that validates the core transfer pipeline before we commit to app infrastructure.

Current flow:

1. read a Spotify playlist
2. normalize track metadata
3. search Apple Music for likely matches
4. classify matched and unmatched items
5. optionally create a destination playlist in Apple Music
6. export transfer artifacts for inspection

The implementation lives in `src/` and writes outputs to `artifacts/`.

## Local setup

1. Install dependencies.

```bash
npm install
```

2. Create a local env file.

```bash
cp .env.example .env
```

3. Fill in these values in `.env`.

- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `SPOTIFY_REFRESH_TOKEN`
- `APPLE_MUSIC_DEVELOPER_TOKEN`
- `APPLE_MUSIC_USER_TOKEN` (optional for match analysis; needed for playlist creation unless you connect Apple Music in the local MVP UI)
- `APPLE_MUSIC_STOREFRONT`
- `SPOTIFY_PLAYLIST_ID`

For the full credential checklist and tomorrow's setup flow, see [docs/credentials-setup.md](./docs/credentials-setup.md).

## Run the spike

Dry run, without creating a playlist in Apple Music:

```bash
npm run transfer:dry
```

Real transfer attempt:

```bash
npm run transfer
```

Type-check the project:

```bash
npm run check
```

Run the local playlist preview backend:

```bash
npm run dev:api
```

Then open `http://127.0.0.1:8790`.

The backend includes both public-link and authenticated-API paths. The public path is the current product wedge because it can preview supported Spotify playlist links without Spotify OAuth.

The preferred public-link prototype reads Spotify's public embed session and public web client metadata, so it can handle larger playlists than the visible embed page alone. It falls back to embed-page metadata if the richer public path stops working.

Probe a public Spotify playlist link without OAuth:

```bash
npm run spotify:public-probe -- "https://open.spotify.com/playlist/..."
```

## Outputs

The spike currently generates:

- `artifacts/report.json`
- `artifacts/report.csv`
- `artifacts/unmatched.json`

These files are useful for evaluating match quality and understanding where the current heuristics fall short.

## Open-source posture

This repository is intentionally useful even before a consumer app exists.

The goal is to publish the core transfer logic, constraints, and tradeoffs clearly enough that someone else could:

- inspect how the pipeline works
- reproduce the flow with their own credentials
- adapt the logic for a different product or research spike

If a future mobile app introduces ads, app-store packaging, or paid tiers, this repository should still remain valuable as the transparent technical foundation behind that product direction.

## Repository map

- [docs/product-prd.md](./docs/product-prd.md): product goals, MVP scope, and user flow
- [docs/architecture.md](./docs/architecture.md): recommended system shape for the future app
- [docs/api-feasibility.md](./docs/api-feasibility.md): API feasibility notes and external constraints
- [docs/roadmap.md](./docs/roadmap.md): phased execution plan
- [docs/monetization.md](./docs/monetization.md): monetization options and constraints
- [docs/project-kickoff.md](./docs/project-kickoff.md): initial framing and product thesis
- [docs/project-history.md](./docs/project-history.md): how the project started and what phase it is in
- [docs/credentials-setup.md](./docs/credentials-setup.md): practical setup guide for Spotify and Apple Music credentials
- [docs/e2e-validation.md](./docs/e2e-validation.md): real transfer validation results and follow-up work
- [docs/product-next-steps.md](./docs/product-next-steps.md): next product and engineering priorities after validation
- [docs/backend-preview.md](./docs/backend-preview.md): local backend and browser preview for Spotify playlist contents
- [docs/mvp-test-checklist.md](./docs/mvp-test-checklist.md): repeatable MVP demo and regression checklist
- [docs/release-checklist.md](./docs/release-checklist.md): hosted MVP release, smoke-test, and analytics checklist
- [docs/playlistxfer-launch-roadmap.md](./docs/playlistxfer-launch-roadmap.md): production launch roadmap for `playlistxfer.com`
- [docs/public-link-ingestion.md](./docs/public-link-ingestion.md): investigation into reading public Spotify playlist links without OAuth
- [docs/deployment.md](./docs/deployment.md): hosted API setup with Render and Supabase

## Product principles

- Trust before monetization
- Never hide failed matches
- Make the free experience genuinely useful
- Start narrow and earn the right to expand

## Known constraints

This project depends heavily on third-party APIs and policies.

Key validation areas:

- Spotify development mode restrictions
- Apple Music user-token flows
- storefront-specific catalog differences
- real-world match quality on actual playlists

## Near-term plan

1. Prove the end-to-end transfer on real playlists.
2. Improve match confidence and reporting quality.
3. Deploy the lightweight backend.
4. Build the mobile app on top of the hosted API.

## Contributing

This project is still early, but contributions and feedback are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the current workflow.

## License

[MIT](./LICENSE)
