# App API Contract

Last reviewed: 2026-05-08

This is the first app-facing contract between `apps/web`, the future mobile app, and `apps/transfer-api`.

The local web app currently reaches these routes through its same-origin proxy, but the contract is owned by the Transfer API.

## Base Flow

1. `GET /api/apple-music/session`
2. `POST /api/spotify/public-playlist-preview`
3. `POST /api/transfers/analyze-public-job`
4. Poll `GET /api/jobs/:id`
5. Optional review edits happen client-side for now.
6. `POST /api/apple-music/user-token`
7. `POST /api/transfers/create-public-job`
8. Poll `GET /api/jobs/:id`

## Apple Music Session

### `GET /api/apple-music/session`

Returns whether the API has an Apple developer token and whether the current process has a Music User Token.

Important product behavior:

- Apple catalog matching needs a developer token.
- Apple playlist creation needs a user token.
- The UI should ask for Apple Music authorization as late as possible, ideally when the user taps create.

### `POST /api/apple-music/user-token`

Stores a MusicKit user token in the current Transfer API process.

Request:

```json
{
  "userToken": "...",
  "storefront": "us"
}
```

## Spotify Preview

### `POST /api/spotify/public-playlist-preview`

Reads a public Spotify playlist link without Spotify OAuth.

Request:

```json
{
  "input": "https://open.spotify.com/playlist/..."
}
```

Response includes playlist metadata and normalized source tracks.

## Analyze Job

### `POST /api/transfers/analyze-public-job`

Starts a background match-analysis job.

Request:

```json
{
  "input": "https://open.spotify.com/playlist/...",
  "limit": 50
}
```

Initial response:

```json
{
  "id": "...",
  "kind": "public-analysis",
  "status": "queued",
  "phase": "Queued",
  "progress": 0
}
```

Poll the job until `status` is `complete` or `error`.

## Create Job

### `POST /api/transfers/create-public-job`

Creates an Apple Music playlist from confident or user-approved matches.

Request:

```json
{
  "input": "https://open.spotify.com/playlist/...",
  "limit": 50,
  "analysis": {
    "playlist": {},
    "summary": {},
    "items": []
  }
}
```

When complete, the job result includes `createdApplePlaylistId`.

## Review Semantics

The current review model is client-side:

- `matched`: ready to transfer.
- `needs_review`: not transferred unless the user approves or selects a candidate.
- `unmatched`: not transferred.

The next backend milestone should persist these decisions server-side with stable transfer IDs.
