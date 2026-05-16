# iOS MVP Architecture

Last reviewed: 2026-05-16

This document defines the first native iOS direction for PlaylistXfer.

The goal is not to rebuild the whole product at once. The goal is to move the working hosted web flow into a native mobile shell while preserving the trust-first transfer behavior.

## Product goal

The iOS MVP should let a user:

1. Paste a public Spotify playlist URL.
2. Preview the playlist before doing any Apple Music work.
3. Analyze Apple Music matches.
4. Review ready, needs-review, and missing tracks.
5. Authorize Apple Music only when they are ready to create.
6. Create a new Apple Music playlist from confident and approved matches.
7. See a clear transfer receipt.

## Current iOS shell

The first native shell lives in:

```text
apps/ios
```

It currently includes:

- SwiftUI app target
- hosted API client
- anonymous session id storage
- public Spotify playlist preview
- public Apple Music match analysis job polling
- mobile match report rendering

It does not yet include:

- native MusicKit authorization
- Apple Music user-token storage through the API
- native playlist creation action
- review-row mutation actions
- App Store signing/profile setup

## Architecture

```text
PlaylistXferApp
  ImportView
    TransferViewModel
      TransferAPIClient
        https://playlistxfer.com/api/*
```

### App layer

`PlaylistXferApp.swift` owns the SwiftUI app entrypoint.

The first screen is `ImportView`, which intentionally mirrors the web MVP:

- import URL input
- preview action
- analyze action
- match report
- Apple Music creation placeholder

### View model layer

`TransferViewModel` owns screen state:

- playlist input
- preview response
- analysis response
- loading/error phase
- derived ready/review/missing item groups

This keeps the SwiftUI view mostly declarative and makes the next MusicKit work easier to add.

### Networking layer

`TransferAPIClient` owns API calls:

- `previewPublicPlaylist(input:)`
- `analyzePublicPlaylist(input:limit:)`
- private job polling

The iOS app sends the same anonymous session header as the web app:

```text
X-PlaylistTransfer-Session
```

The session id is local to the device and generated with an `ios-` prefix.

### API base URL

The app points to:

```text
https://playlistxfer.com
```

That keeps the mobile app aligned with the production domain. Cloudflare Pages proxies `/api/*` to the hosted Transfer API.

For local development, `AppConfig.transferAPIBaseURL` can temporarily point at a local API host.

## Why the backend still matters

The mobile app should not contain Spotify scraping logic, Apple developer-token generation, or long-running matching orchestration.

The backend remains responsible for:

- public Spotify playlist ingestion
- Apple Music catalog search
- match scoring
- transfer persistence
- anonymous job ownership
- future rate limiting and abuse controls

The iOS app is responsible for:

- mobile UX
- user consent
- MusicKit user authorization
- deciding when to preview, analyze, review, and create

## Apple Music plan

The next iOS milestone should add native Apple Music connection.

Recommended flow:

1. User previews and analyzes before Apple login.
2. User taps `Create Apple Music playlist`.
3. If not connected, the app presents Apple Music authorization.
4. The app sends the MusicKit user token to:

```text
POST /api/apple-music/user-token
```

5. The app starts playlist creation with the saved transfer id:

```text
POST /api/transfers/{transferId}/create-job
```

6. The app polls:

```text
GET /api/jobs/{jobId}
```

7. The app renders the final receipt.

## Review-row plan

The web app already supports approving or skipping review rows through:

```text
PATCH /api/transfers/{transferId}/items/{index}
```

The iOS app should add this after MusicKit create works:

- approve suggested
- skip track
- browse other candidates
- use candidate

Manual Apple Music search can come later.

## MVP guardrails

- Full playlist analysis should remain the default.
- Quick/partial analysis can exist later, but should not be the primary path.
- No ads inside the critical preview, analyze, or create progress path.
- No Spotify OAuth unless public-link ingestion becomes unreliable enough to justify the added friction.
- Do not create Apple Music playlists without explicit user confirmation.
- Do not store Apple Music user tokens on-device longer than needed unless the user opts in.

## Validation checklist

For the current shell:

- The Xcode project opens.
- The app builds on an iPhone simulator.
- A known public Spotify playlist previews successfully.
- A known public Spotify playlist analyzes successfully.
- The match report shows ready, review, and missing groups when present.
- Errors are visible and human-readable.

For the next MusicKit milestone:

- Apple Music authorization appears only when the user creates.
- The access dialog shows PlaylistXfer branding/domain.
- Denying access does not create anything.
- Allowing access saves a user token server-side.
- The app can create from a saved transfer id.
- The final receipt matches the web flow.
