# Backend Preview

## Purpose

This repo now includes a minimal local backend for inspecting Spotify playlist contents and analyzing Apple Music matches.

The goal is to make the next product question concrete:

Can we read this playlist from a public Spotify link, when do we need the authenticated Web API, and how well does either path match against Apple Music?

## Run locally

```bash
npm run dev:api
```

Then open:

```text
http://127.0.0.1:8790
```

The browser page accepts either:

- a full Spotify playlist URL
- a raw Spotify playlist ID

It can run four actions:

- `Preview Public`: reads the public Spotify embed page without Spotify OAuth
- `Analyze Public`: reads the public Spotify embed page, then searches Apple Music
- `Analyze Public` in the MVP UI runs as a background job and polls progress while tracks are matched
- `Create Apple Playlist`: reads the public Spotify link, searches Apple Music, then creates a playlist from confident matches
- `Preview API`: reads the playlist through the authenticated Spotify Web API
- `Analyze API`: reads the playlist through the authenticated Spotify Web API, then searches Apple Music

The public actions are the most interesting product path because they do not require a Spotify account connection.

The API actions still matter as a documented fallback when Spotify's public web surface changes or blocks a playlist.

## API endpoints

### `GET /health`

Returns:

```json
{
  "ok": true
}
```

### `POST /api/spotify/playlist-preview`

Authenticated Spotify Web API preview.

Request:

```json
{
  "input": "https://open.spotify.com/playlist/6NwrTvQmJgGK9TVgJOkQtp"
}
```

Response:

```json
{
  "playlist": {
    "id": "6NwrTvQmJgGK9TVgJOkQtp",
    "name": "Daily Test",
    "description": "",
    "totalItems": 50
  },
  "tracks": [
    {
      "spotifyTrackId": "...",
      "isrc": "...",
      "name": "...",
      "artists": ["..."],
      "album": "...",
      "durationMs": 123000
    }
  ]
}
```

### `POST /api/spotify/public-playlist-preview`

Public link preview. This endpoint does not use `.env` Spotify credentials and does not require Spotify user OAuth.

The preferred public path reads the Spotify embed page, extracts the anonymous embed session, then asks Spotify's public web client endpoint for the full playlist rows and per-track metadata. If that path fails, the extractor falls back to track-like metadata embedded in the public page.

Request:

```json
{
  "input": "https://open.spotify.com/playlist/4fQ8a2Pg2llDd76J9a5WzH"
}
```

Response:

```json
{
  "playlist": {
    "id": "4fQ8a2Pg2llDd76J9a5WzH",
    "name": "Rockabye Baby: Lullaby Covers",
    "description": "Read from Spotify public embed session metadata and public web endpoints without Spotify user OAuth.",
    "totalItems": 494,
    "source": "spotify-public-spclient",
    "limitations": [
      "Uses Spotify public embed session metadata and an internal public web endpoint",
      "Duplicate Spotify track IDs are removed for safer Apple Music playlist creation",
      "Rows without Spotify track IDs and tracks with unreadable metadata are skipped",
      "Spotify may change this public web surface"
    ]
  },
  "tracks": [
    {
      "spotifyTrackId": "...",
      "isrc": "...",
      "name": "...",
      "artists": ["..."],
      "album": "...",
      "durationMs": 123000
    }
  ]
}
```

### `POST /api/transfers/analyze`

Authenticated Spotify Web API analysis.

Request:

```json
{
  "input": "https://open.spotify.com/playlist/6NwrTvQmJgGK9TVgJOkQtp"
}
```

Response:

```json
{
  "playlist": {
    "id": "6NwrTvQmJgGK9TVgJOkQtp",
    "name": "Daily Test",
    "totalItems": 50
  },
  "summary": {
    "matchedCount": 50,
    "unmatchedCount": 0,
    "needsReviewCount": 0,
    "matchRate": 1
  },
  "items": [
    {
      "index": 1,
      "status": "matched",
      "source": {},
      "confidence": 1,
      "reason": "isrc",
      "appleCandidate": {},
      "candidateCount": 5,
      "candidates": []
    }
  ]
}
```

The local backend caps the returned `candidates` list per item for UI performance. `candidateCount` preserves how many Apple Music candidates were considered.

### `POST /api/transfers/analyze-public`

Public link analysis. This endpoint reads Spotify tracks from public metadata, then uses Apple Music credentials to search for matches.

Request:

```json
{
  "input": "https://open.spotify.com/playlist/6NwrTvQmJgGK9TVgJOkQtp"
}
```

The response shape matches `POST /api/transfers/analyze`, with an added `playlist.source` and `playlist.limitations`.

### `POST /api/transfers/analyze-public-job`

Starts the same public-link analysis as a background job and returns immediately.

Request:

```json
{
  "input": "https://open.spotify.com/playlist/6NwrTvQmJgGK9TVgJOkQtp",
  "limit": 50
}
```

Response:

```json
{
  "id": "...",
  "status": "queued",
  "phase": "Queued",
  "progress": 0,
  "completed": 0,
  "total": 0
}
```

Poll progress:

```text
GET /api/jobs/<job-id>
```

When `status` becomes `complete`, the job response includes `result` with the same shape as `POST /api/transfers/analyze-public`.

Current note:

- `Analyze Matches` can be slow on large playlists because it performs multiple Apple Music searches per track.
- The local MVP UI analyzes the first `50` tracks by default so large-playlist testing stays interactive.
- The request accepts `limit` or `analysisLimit` when testing larger batches, capped at `500`.
- Apple Music analysis uses bounded track concurrency, stops searching a track once an ISRC match is found, and caches catalog searches in-process for faster retries.
- Public Spotify playlist reads are cached in-process by playlist ID, so the normal `Preview -> Analyze` path reuses the full public import result.
- A production version should use background jobs, progress updates, caching, or a tighter search strategy.
- Public analysis has higher confidence when the `spotify-public-spclient` path works because that path can include ISRC, album, artist, and duration metadata.
- Public analysis has lower confidence when it falls back to `spotify-public-embed`, because the embed-only metadata does not include ISRC and often does not include album metadata.

### `POST /api/transfers/create-public`

Public link transfer. This endpoint reads a public Spotify playlist, analyzes Apple Music matches, then creates an Apple Music playlist from confident matches only.

Request:

```json
{
  "input": "https://open.spotify.com/playlist/6NwrTvQmJgGK9TVgJOkQtp"
}
```

The response shape matches `POST /api/transfers/analyze-public`, with two added fields:

```json
{
  "createdApplePlaylistId": "p.abc123",
  "createdFromConfidenceThreshold": 0.8
}
```

Important behavior:

- matches with confidence `>= 0.8` are added to Apple Music
- the local MVP UI creates from the selected analysis size, not always the entire playlist
- low-confidence `needs_review` matches are shown in the report but not written
- unmatched tracks are shown in the report but not written
- no Apple Music playlist is created when there are zero confident matches
- this endpoint writes to the signed-in Apple Music user's library

### `POST /api/transfers/create-public-job`

Starts public playlist creation as a background job and returns immediately. The MVP UI uses this endpoint so playlist creation shows progress instead of looking frozen after the confirmation dialog.

Request:

```json
{
  "input": "https://open.spotify.com/playlist/6NwrTvQmJgGK9TVgJOkQtp",
  "limit": 50,
  "analysis": {}
}
```

If `analysis` is provided, the job creates from the already-reviewed match report instead of re-running Apple Music matching. Poll with:

```text
GET /api/jobs/<job-id>
```

When `status` becomes `complete`, the job response includes `result.createdApplePlaylistId`.

## Expected failure modes

### `403`

Spotify refused access to the playlist's tracks.

Most likely causes:

- the connected account does not own the playlist
- the connected account is not a collaborator
- the playlist is public in the app but not readable by this app/user through the Web API

### `404`

Spotify could not find the playlist through the Web API.

Most likely causes:

- the playlist ID is wrong
- the playlist is generated/personalized, such as a `Daily Mix`
- the playlist is not exposed as a normal playlist resource

## Product implication

This preview backend is the first step toward a clean app flow.

Near-term product behavior should be:

1. user pastes a Spotify playlist link
2. backend tries public extraction first
3. app shows tracks without asking for Spotify login when possible
4. app analyzes Apple Music matches before creating a destination playlist
5. app creates from confident matches only
6. if public extraction fails, app guides the user to make or copy the Spotify playlist into a public playlist and retry
7. later, app can offer manual text, CSV, or Spotify data import as a final fallback

This keeps the dream flow alive while avoiding a brittle promise that every Spotify link will always work.
