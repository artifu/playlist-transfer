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

What does not exist yet:

- production backend
- React Native mobile app
- billing, ads, or polished UI
- full retry and manual-correction flows

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
- `APPLE_MUSIC_USER_TOKEN`
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
3. Promote the spike modules into a lightweight backend.
4. Build the mobile app on top of the validated flow.

## Contributing

This project is still early, but contributions and feedback are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the current workflow.

## License

[MIT](./LICENSE)
