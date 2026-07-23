# PlaylistXfer iOS

This folder contains the native iOS MVP shell for PlaylistXfer.

The first iOS milestone is intentionally narrow:

- accept a public Spotify playlist or song URL in the same field
- detect the resource type and preview it through the hosted Transfer API
- analyze Apple Music matches through the hosted Transfer API
- show ready, review, and missing groups on mobile
- keep Apple Music playlist creation behind an explicit user-authorized step

The web demo remains in `apps/web`. This app is a separate product surface that reuses the same hosted API contract.

## Open the app

Open the project in Xcode:

```bash
open apps/ios/PlaylistXfer.xcodeproj
```

Recommended target:

- iOS 17 or newer
- iPhone simulator for the first pass

## API target

The app currently points at:

```text
https://playlistxfer.com
```

That domain proxies `/api/*` requests to the hosted Transfer API. Change `AppConfig.transferAPIBaseURL` if you want to point the app at a local or staging API.

## Current status

Implemented:

- SwiftUI app shell
- public playlist preview
- public playlist analysis job polling
- anonymous session id header
- first-party operational analytics events
- match report summary
- mobile-first ready/review/missing rows
- native MusicKit playlist creation
- single-song import into a reusable `PlaylistXfer Inbox` playlist
- editable Apple Music destination playlist name
- manual candidate selection
- deep link import with `playlistxfer://import?url=<spotify-url>`
- Share Sheet extension for receiving Spotify links from the iOS share menu

Not implemented yet:

- final App Store icon and product-page screenshots
- App Store Connect record, privacy answers, and submission

Release configuration:

- version `1.0` (build `1`)
- iOS 17 or newer
- iPhone-only for the first App Store release
- bundle id `com.artifu.playlistxfer`
- share extension bundle id `com.artifu.playlistxfer.shareextension`

## Deep link import

The app registers the `playlistxfer` URL scheme. Opening a URL like this will populate the import field and start playlist preview automatically:

```text
playlistxfer://import?url=https%3A%2F%2Fopen.spotify.com%2Fplaylist%2F0h8JNovqXS97ygva27IHfi
```

The URL may point to either a Spotify playlist or an individual Spotify track. This is also the handoff used by the iOS Share Extension.

## Share Sheet import

The `PlaylistXferShareExtension` target appears in the iOS share menu for text and web URL shares. It extracts the first supported Spotify playlist or song URL and opens the main app through the deep link above.

iOS decides where PlaylistXfer appears in the Share Sheet. The app can be eligible for Spotify links, but it cannot force itself into the suggested app row. For repeat testing, open `More`, choose `Edit`, and favorite PlaylistXfer so it stays easier to reach.

The current flow intentionally asks the user to tap **Open in PlaylistXfer** inside the extension. That keeps the handoff explicit and safer for App Store review than trying to launch the containing app automatically.

To test on device:

1. Build and run `PlaylistXfer` from Xcode.
2. Open Spotify or Safari.
3. Share a public Spotify playlist or song URL.
4. Choose `PlaylistXfer` in the Share Sheet.
5. Tap **Open in PlaylistXfer**.
6. Confirm the main app opens with the shared Spotify item already in preview flow.

## Individual song flow

There is no separate song-import screen. The app detects `/track/` links in the same field used for playlists, finds the Apple Music catalog equivalent, shows the match, and adds the approved song to a reusable Apple Music playlist named `PlaylistXfer Inbox`.

This keeps the mobile flow one-click friendly while preserving the same review-before-write trust boundary used for full playlists.

## Apple Music creation notes

The native app creates playlists through MusicKit with:

- playlist name
- description
- author display name
- matched Apple Music catalog songs

The app now lets users edit the destination playlist name before creation. The default is:

```text
Original Spotify playlist name (PlaylistXfer)
```

The current MusicKit creation path does not take a custom artwork/cover parameter. Apple Music generates private library playlist artwork itself after creation. A custom cover flow should be treated as a separate follow-up, likely requiring a different Apple Music API path or a designer-led receipt/cover strategy.

## Native analytics

The iOS MVP sends small first-party operational events to the hosted API:

```text
POST /api/events
```

These events reuse the same anonymous session header as the web app and are intended for early reliability and funnel debugging. Current native events cover:

- app opens and first launch
- preview start, success, and failure
- input source such as manual entry, the in-app clipboard button, or the Share Sheet
- Apple Music match analysis start, success, and failure
- review decisions such as approve, candidate selection, skip, and restore
- manual Apple Music catalog searches and exact-match selection
- Apple Music playlist creation start, success, and failure
- updates to an already-created playlist
- aggregate MetricKit diagnostic counts for crashes, hangs, CPU exceptions, and disk-write exceptions

The native app sends safe fields only: host, app path, app/build version, first-launch flag, input source, playlist id, transfer id, aggregate track counts, match rate, duration, aggregate diagnostic counts, error category/message, and catalog identifiers needed to compare the algorithm's suggestion with a user's selected match. Free-form Apple Music search text, track/artist names, MetricKit stack traces, Apple Music user tokens, emails, full Spotify playlist URLs, authorization payloads, and raw user library data are not logged.

Google Analytics or Firebase Analytics can be added later if we want App Store funnel dashboards in GA4. That follow-up requires a Firebase app, `GoogleService-Info.plist`, and a Swift Package dependency, so this MVP keeps analytics lightweight and dependency-free.

Run the production operational report from the repository root:

```bash
npm run analytics:report
```

The report reads the remote D1 database and prints the 28-day event funnel, iOS daily active anonymous devices, input sources, match quality, errors, retention, and 90-day aggregate diagnostics.

## Architecture

```text
PlaylistXferApp.swift
AppConfig.swift
Models/
  TransferModels.swift
Networking/
  TransferAPIClient.swift
ViewModels/
  TransferViewModel.swift
Views/
  ImportView.swift
```

See `docs/ios-mvp-architecture.md` for the product and technical plan.
