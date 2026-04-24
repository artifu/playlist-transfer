# Backend Preview

## Purpose

This repo now includes a minimal local backend for inspecting Spotify playlist contents through the same OAuth credentials used by the transfer spike.

The goal is to make the next product question concrete:

Can the connected Spotify account read this playlist, and what track metadata does the Web API return?

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

## API endpoints

### `GET /health`

Returns:

```json
{
  "ok": true
}
```

### `POST /api/spotify/playlist-preview`

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
2. backend parses the playlist ID
3. backend checks whether the connected account can read it
4. app either shows tracks or explains why the link is unsupported

This avoids promising arbitrary public-link support before the platform behavior is fully understood.
