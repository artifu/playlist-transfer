# PlaylistTransfer Transfer API

This folder is the app-ready backend track for PlaylistTransfer.

The local demo in `tools/playlist-preview-server.mjs` stays intact as the visual product lab. This API subproject keeps provider orchestration, Apple Music session handling, transfer jobs, and JSON routes in a separate place so it can grow into a homesite or mobile backend without destabilizing the demo.

## Run Locally

```bash
npm run dev:transfer-api
```

The server defaults to:

```text
http://127.0.0.1:8791
```

You can override the host or port:

```bash
TRANSFER_API_PORT=8792 node apps/transfer-api/server.mjs
```

If you change TypeScript files in `src/`, run `npm run build` before starting this API so `dist/` is current.

## Current Scope

- Public Spotify playlist preview.
- Public Spotify playlist analysis against Apple Music catalog search.
- Apple Music MusicKit user-token handoff for playlist creation.
- Background job polling for long-running analysis and creation.
- Product-friendly JSON errors.

## Why This Is Separate From The Demo

The demo is intentionally messy in a useful way: it combines HTML, CSS, browser state, fixtures, and API calls so we can move fast on product feel.

The transfer API is intentionally narrower: it exposes app-facing JSON routes and keeps stateful backend concerns away from the UI prototype. That makes it a better foundation for a future homesite, mobile app, ad-supported landing flow, or deployable API.
