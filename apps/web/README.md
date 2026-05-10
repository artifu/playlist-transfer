# PlaylistTransfer Web

This is the clean product web shell for PlaylistTransfer.

It intentionally lives outside the local demo:

- `tools/playlist-preview-server.mjs` remains the visual/engineering lab.
- `apps/transfer-api` owns JSON routes and transfer orchestration.
- `apps/web` is the user-facing web product track that talks to the API.

## Run Locally

Start the Transfer API in one terminal:

```bash
npm run dev:transfer-api
```

Start the web app in another terminal:

```bash
npm run dev:web
```

Open:

```text
http://127.0.0.1:8792
```

The web server proxies `/api/*` to the Transfer API at `http://127.0.0.1:8791` by default.

Override the API target when needed:

```bash
TRANSFER_API_URL=http://127.0.0.1:8791 npm run dev:web
```

## Product Flow

1. Paste a public Spotify playlist link.
2. Preview readable public playlist metadata.
3. Analyze Apple Music matches through a background job.
4. Review low-confidence candidates.
5. Connect Apple Music only when creating the playlist.
6. Create from ready or user-approved tracks only.
7. Show a receipt with transferred and skipped counts.

The app stores an anonymous session id and the latest `transferId` in `localStorage`, then restores the match report from the Transfer API after refresh, tab close, or API restart. Review decisions are saved server-side in local SQLite and scoped to that anonymous session, not only in browser memory.

Current local storage keys:

- `playlist-transfer:anonymous-session-id`
- `playlist-transfer:last-transfer-id`

## Notes

- There is no demo fixture button in this app.
- Creation is still protected by Apple Music authorization at the final step.
- The current web app is dependency-free on purpose so it can evolve before we commit to React, React Native, or native UI.
