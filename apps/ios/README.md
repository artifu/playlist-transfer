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

Not implemented yet:

- Share Sheet extension for receiving Spotify links directly from the iOS share menu
- App Store signing/profile configuration

## Deep link import

The app registers the `playlistxfer` URL scheme. Opening a URL like this will populate the import field and start playlist preview automatically:

```text
playlistxfer://import?url=https%3A%2F%2Fopen.spotify.com%2Fplaylist%2F0h8JNovqXS97ygva27IHfi
```

This is the foundation for the Spotify Share Sheet flow. The next iOS milestone is a Share Extension target that accepts a shared `open.spotify.com/playlist/...` URL and hands it to this deep link flow.

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
