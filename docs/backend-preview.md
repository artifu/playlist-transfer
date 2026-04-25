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

The API actions still matter because they provide richer metadata such as ISRC, album, and duration when Spotify allows access.

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

Public link preview. This endpoint does not use `.env` Spotify credentials.

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
    "description": "Read from Spotify public embed metadata without Spotify OAuth.",
    "totalItems": 50,
    "source": "spotify-public-embed",
    "limitations": [
      "No ISRC from public embed metadata",
      "No duration from public embed metadata",
      "Album metadata is often missing",
      "Spotify may change this public page structure"
    ]
  },
  "tracks": [
    {
      "spotifyTrackId": "...",
      "isrc": null,
      "name": "...",
      "artists": ["..."],
      "album": null,
      "durationMs": null
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

- `Analyze Matches` can be slow on 50-track playlists because it performs multiple Apple Music searches per track.
- A production version should use background jobs, progress updates, caching, or a tighter search strategy.
- Public analysis has lower matching confidence because public embed metadata does not include ISRC or duration.

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
2. backend tries the public embed extraction first
3. app shows tracks without asking for Spotify login when possible
4. if public extraction fails, app asks for Spotify connection or offers manual import
5. app analyzes Apple Music matches before creating a destination playlist

This keeps the dream flow alive while avoiding a brittle promise that every Spotify link will always work.
