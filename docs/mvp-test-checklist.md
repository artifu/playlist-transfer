# MVP Test Checklist

Use this checklist before a demo, checkpoint commit, or design handoff.

## Local Server

1. Start the local MVP server.

```bash
npm run dev:api
```

2. Confirm the health endpoint.

```bash
curl -s http://127.0.0.1:8790/health
```

Expected:

```json
{"ok":true}
```

3. Open the MVP UI.

```text
http://127.0.0.1:8790
```

## Public Spotify Import

1. Paste a normal public Spotify playlist URL.
2. Click `Preview public link`.
3. Confirm the playlist title, artwork, track count, and first tracks render.
4. Confirm album thumbnails render when Spotify exposes artwork.
5. Confirm missing artwork uses the fallback sleeve.

## Apple Music Matching

1. Click `Analyze matches`.
2. Confirm the UI shows progress instead of appearing frozen.
3. Confirm the match report appears without requiring Apple Music user authorization.
4. Confirm `Ready`, `Needs review`, `Missing`, and `Any match` counts are legible.
5. Approve a review row and confirm it moves into `Ready`.
6. Skip a review row and confirm it moves into `Missing` / `Will not transfer`.
7. Confirm `Create Apple Music playlist` is disabled when there are zero ready tracks.

## Late Apple Music Authorization

1. Use a browser/session without a runtime Apple Music user token when possible.
2. Complete `Preview public link`.
3. Complete `Analyze matches`.
4. Click `Create Apple Music playlist`.
5. Confirm Apple Music authorization is requested only at this point.
6. Click `Not Now` or cancel authorization and confirm nothing is created.
7. Retry `Create Apple Music playlist`, allow access, and confirm creation continues.

## Playlist Creation

1. Confirm the final confirmation dialog explains that only ready tracks are created.
2. Create the Apple Music playlist.
3. Confirm the success receipt appears.
4. Confirm the receipt shows transferred, needs-review-left, not-moved, and Apple playlist ID.
5. Open Apple Music and verify the playlist appears in the user's library.
6. Confirm skipped and unresolved review tracks were not added.

## Demo Mode

1. Open:

```text
http://127.0.0.1:8790/?demo=chaos
```

2. Confirm demo mode cannot create a real Apple Music playlist.
3. Confirm approve/skip actions update the local report counts.
4. Confirm no Spotify or Apple Music writes happen in demo mode.

## Known MVP Limits

- Public Spotify ingestion depends on Spotify public web surfaces that may change.
- Large playlists can still take time to match because each track may require multiple Apple Music searches.
- Runtime Apple Music user tokens are stored only in the local server process.
- The UI currently shows prototype service marks until final designer assets are added.
