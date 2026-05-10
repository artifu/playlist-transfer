# App API Contract

Last reviewed: 2026-05-08

This is the first app-facing contract between `apps/web`, the future mobile app, and `apps/transfer-api`.

The local web app currently reaches these routes through its same-origin proxy, but the contract is owned by the Transfer API.

## Base Flow

1. `GET /api/apple-music/session`
2. `POST /api/spotify/public-playlist-preview`
3. `POST /api/transfers/analyze-public-job`
4. Poll `GET /api/jobs/:id`
5. Persist the returned `transferId` locally.
6. Restore with `GET /api/transfers/:id` after refresh or tab close.
7. Save review edits with `PATCH /api/transfers/:id/items/:itemIndex`.
8. `POST /api/apple-music/user-token`
9. `POST /api/transfers/:id/create-job`
10. Poll `GET /api/jobs/:id`

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

When complete, the job result is a saved transfer report and includes:

```json
{
  "transferId": "...",
  "transfer": {
    "id": "...",
    "status": "analyzed",
    "input": "https://open.spotify.com/playlist/...",
    "analysisLimit": 50
  },
  "playlist": {},
  "summary": {},
  "items": []
}
```

Clients should store `transferId` locally so refresh/back/tab close can restore the report from the Transfer API.

## Saved Transfer

### `GET /api/transfers/:id`

Returns the saved transfer report for restoration.

Current local persistence uses SQLite at `data/playlist-transfer.sqlite` by default. A production deployment should move the same model to managed durable storage with user/session ownership.

### `PATCH /api/transfers/:id/items/:itemIndex`

Saves a review decision server-side and returns the updated transfer report.

Approve the suggested candidate:

```json
{
  "action": "approve"
}
```

Skip a track:

```json
{
  "action": "skip"
}
```

Choose another returned candidate:

```json
{
  "action": "use-candidate",
  "candidateIndex": 1
}
```

## Create Job

### `POST /api/transfers/:id/create-job`

Creates an Apple Music playlist from confident or user-approved matches.

Request:

```json
{}
```

When complete, the job result includes `createdApplePlaylistId`.

## Review Semantics

The current review model is server-side for saved transfers:

- `matched`: ready to transfer.
- `needs_review`: not transferred unless the user approves or selects a candidate.
- `unmatched`: not transferred.

The next backend milestone should add user/session ownership, cleanup policy, and a deployable managed database.
