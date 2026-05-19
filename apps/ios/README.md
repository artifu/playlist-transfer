# PlaylistXfer iOS

This folder contains the native iOS MVP shell for PlaylistXfer.

The first iOS milestone is intentionally narrow:

- accept a public Spotify playlist URL
- preview the playlist through the hosted Transfer API
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
- match report summary
- mobile-first ready/review/missing rows
- native MusicKit playlist creation
- manual candidate selection
- deep link import with `playlistxfer://import?url=<spotify-playlist-url>`
- Share Sheet extension for receiving Spotify links from the iOS share menu

Not implemented yet:

- App Store signing/profile configuration

## Deep link import

The app registers the `playlistxfer` URL scheme. Opening a URL like this will populate the import field and start playlist preview automatically:

```text
playlistxfer://import?url=https%3A%2F%2Fopen.spotify.com%2Fplaylist%2F0h8JNovqXS97ygva27IHfi
```

This is also the handoff used by the iOS Share Extension.

## Share Sheet import

The `PlaylistXferShareExtension` target appears in the iOS share menu for text and web URL shares. It extracts the first supported Spotify playlist URL and opens the main app through the deep link above.

The current flow intentionally asks the user to tap **Open in PlaylistXfer** inside the extension. That keeps the handoff explicit and safer for App Store review than trying to launch the containing app automatically.

To test on device:

1. Build and run `PlaylistXfer` from Xcode.
2. Open Spotify or Safari.
3. Share a public Spotify playlist URL.
4. Choose `PlaylistXfer` in the Share Sheet.
5. Tap **Open in PlaylistXfer**.
6. Confirm the main app opens with the shared playlist already in preview flow.

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
