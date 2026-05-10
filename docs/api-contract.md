# App API Contract

Last reviewed: 2026-05-10

This is the first app-facing contract between `apps/web`, the future mobile app, and `apps/transfer-api`.

The local web app currently reaches these routes through its same-origin proxy, but the contract is owned by the Transfer API.

## Base Flow

1. Generate or restore an anonymous client session id.
2. Send `X-PlaylistTransfer-Session: <session-id>` with saved-transfer, job, and Apple user-token requests.
3. `GET /api/apple-music/session`
4. `POST /api/spotify/public-playlist-preview`
5. `POST /api/transfers/analyze-public-job`
6. Poll `GET /api/jobs/:id`
7. Persist the returned `transferId` locally.
8. Restore with `GET /api/transfers/:id` after refresh or tab close.
9. Save review edits with `PATCH /api/transfers/:id/items/:itemIndex`.
10. `POST /api/apple-music/user-token`
11. `POST /api/transfers/:id/create-job`
12. Poll `GET /api/jobs/:id`

## Anonymous Session

The app does not need accounts for the MVP, but saved transfers need ownership. Clients should generate a stable random id and store it locally.

Recommended browser storage:

```text
playlist-transfer:anonymous-session-id
```

Required header:

```http
X-PlaylistTransfer-Session: 7b0e5d64-8d4e-4f2a-bf48-7fb9a7d59d4b
```

This id is not an account, password, or durable identity. It is a lightweight ownership boundary so one anonymous browser or app install cannot read or mutate another anonymous session's transfers or jobs.

Routes that require it:

- `POST /api/apple-music/user-token`
- `GET /api/jobs/:id`
- `POST /api/transfers/analyze-public-job`
- `POST /api/transfers/create-public`
- `POST /api/transfers/create-public-job`
- `GET /api/transfers/:id`
- `PATCH /api/transfers/:id/items/:itemIndex`
- `POST /api/transfers/:id/create-job`

The public preview route intentionally does not require a session because it does not persist user-owned state.

## Apple Music Session

### `GET /api/apple-music/session`

Returns whether the API has an Apple developer token and whether the current process has a Music User Token.

Important product behavior:

- Apple catalog matching needs a developer token.
- Apple playlist creation needs a user token.
- The UI should ask for Apple Music authorization as late as possible, ideally when the user taps create.

### `POST /api/apple-music/user-token`

Stores a MusicKit user token in the current Transfer API process for the current anonymous session. This is intentionally in-memory in the prototype; production should store encrypted tokens or avoid long-lived token storage until the product needs it.

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

Clients should store `transferId` locally alongside the anonymous session id so refresh/back/tab close can restore the report from the Transfer API.

## Saved Transfer

### `GET /api/transfers/:id`

Returns the saved transfer report for restoration.

Current local persistence uses SQLite at `data/playlist-transfer.sqlite` by default. Transfers are scoped by anonymous `session_id`. A production deployment should move the same model to managed durable storage, keep this ownership check, and add retention cleanup.

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

The next backend milestone should add cleanup policy, rate limits, and a deployable managed database.

## Operational Controls

The Transfer API is designed to run locally with lightweight SQLite and move to hosted storage later without changing client behavior.

Current environment knobs:

- `TRANSFER_API_STORAGE_DRIVER`: storage driver name. Defaults to `sqlite`. Supported values: `sqlite`, `supabase-rest`.
- `TRANSFER_API_DB_PATH`: local SQLite path. Defaults to `data/playlist-transfer.sqlite`.
- `SUPABASE_URL`: Supabase project URL when using `supabase-rest`.
- `SUPABASE_SERVICE_ROLE_KEY`: backend-only Supabase service role key when using `supabase-rest`.
- `SUPABASE_TRANSFERS_TABLE`: Supabase transfers table name. Defaults to `transfers`.
- `TRANSFER_API_TRANSFER_RETENTION_DAYS`: anonymous transfer retention window. Defaults to `7`.
- `TRANSFER_API_CLEANUP_INTERVAL_MS`: cleanup loop interval. Defaults to one hour.
- `TRANSFER_API_RATE_LIMIT_WINDOW_MS`: in-memory rate-limit window. Defaults to one minute.
- `TRANSFER_API_RATE_LIMIT_MAX`: maximum API requests per session/IP per window. Defaults to `240`.
- `TRANSFER_API_RATE_LIMIT_DISABLED`: set to `1` to disable local rate limiting.

The rate limiter is intentionally in-memory for the MVP. A multi-instance deployment should replace it with provider-level controls, Redis, Durable Objects, or an equivalent shared limiter.
