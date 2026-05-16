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

Not implemented yet:

- native MusicKit authorization
- Apple Music user-token handoff to the API
- playlist creation from the saved transfer report
- manual candidate selection
- App Store signing/profile configuration

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
