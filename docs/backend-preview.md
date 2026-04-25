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
      "candidates": []
    }
  ]
}
```

### `POST /api/transfers/analyze-public`

Public link analysis. This endpoint reads Spotify tracks from public embed metadata, then uses Apple Music credentials to search for matches.

Request:

```json
{
  "input": "https://open.spotify.com/playlist/6NwrTvQmJgGK9TVgJOkQtp"
}
```

The response shape matches `POST /api/transfers/analyze`, with an added `playlist.source` and `playlist.limitations`.

Current note:

- `Analyze Matches` can be slow on large playlists because it performs multiple Apple Music searches per track.
- A production version should use background jobs, progress updates, caching, or a tighter search strategy.
- Public analysis has higher confidence when the `spotify-public-spclient` path works because that path can include ISRC, album, artist, and duration metadata.
- Public analysis has lower confidence when it falls back to `spotify-public-embed`, because the embed-only metadata does not include ISRC and often does not include album metadata.

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
4. if public extraction fails, app asks for Spotify connection or offers manual import
5. app analyzes Apple Music matches before creating a destination playlist

This keeps the dream flow alive while avoiding a brittle promise that every Spotify link will always work.
