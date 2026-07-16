# PlaylistXfer TestFlight Runbook

Last reviewed: 2026-07-13

Use this runbook when the iOS MVP is ready to move from local device testing to TestFlight.

## Current Release Target

- App name: `PlaylistXfer`
- Version: `1.0`
- Build: `1`
- Minimum OS: iOS 17
- Devices: iPhone only
- Main bundle id: `com.artifu.playlistxfer`
- Share Extension bundle id: `com.artifu.playlistxfer.shareextension`
- Production API base: `https://playlistxfer.com`
- Production privacy URL: `https://playlistxfer.com/privacy`
- Production support URL: `https://playlistxfer.com/contact`

## Before Archiving

- Confirm the latest UAT build works on a real iPhone.
- Confirm the app can preview a public Spotify playlist.
- Confirm the app can preview an individual Spotify track link.
- Confirm Apple Music matching completes without progress moving backward.
- Confirm candidate selection, wrong-match skip, and restore actions work.
- Confirm Apple Music permission is requested only when creating/adding music.
- Confirm playlist creation succeeds after Apple Music authorization.
- Confirm the Share Extension appears from the Spotify or Safari share sheet and opens the main app.
- Confirm no Apple Music token, email, full Spotify URL, or raw authorization payload appears in logs.
- Confirm `PlaylistXfer/PrivacyInfo.xcprivacy` is included in the main app target.

## Local Release Preflight

Completed on 2026-07-13 against version `1.0` build `1`:

- `PrivacyInfo.xcprivacy` passes `plutil` validation.
- The manifest declares the approved `CA92.1` reason for the app's own `UserDefaults` session identifier.
- An unsigned generic-device Release archive succeeds.
- The archived app contains the privacy manifest, compiled app icons, and the Share Extension.
- The archived bundle identifiers are `com.artifu.playlistxfer` and `com.artifu.playlistxfer.shareextension`.

This preflight verifies the source package and archive structure. It does not replace signed `Validate App` in Xcode Organizer.

## Xcode Archive Steps

1. Open `apps/ios/PlaylistXfer.xcodeproj`.
2. Select the `PlaylistXfer` scheme, not `PlaylistXferShareExtension`.
3. Select `Any iOS Device (arm64)` or a connected real iPhone.
4. Confirm the main app target and share extension target use the correct Apple Developer team.
5. Confirm the main app target has the Media Library capability.
6. Confirm the share extension target is embedded in the main app.
7. Run `Product > Clean Build Folder`.
8. Run `Product > Archive`.
9. In Organizer, select the new archive and click `Validate App`.
10. If validation passes, click `Distribute App`.
11. Choose `App Store Connect`.
12. Upload the build for TestFlight processing.

If Xcode only shows the share extension scheme:

1. Open the scheme dropdown.
2. Choose `Manage Schemes`.
3. Enable or auto-create the `PlaylistXfer` scheme.
4. Mark `PlaylistXfer` as shared.
5. Select `PlaylistXfer` before running or archiving.

## App Store Connect Setup

Create the app record with:

- Name: `PlaylistXfer`
- Primary language: English (U.S.)
- Bundle ID: `com.artifu.playlistxfer`
- SKU: `playlistxfer-ios-1`
- Primary category: Music
- Pricing: Free

Add:

- Privacy Policy URL: `https://playlistxfer.com/privacy`
- Support URL: `https://playlistxfer.com/contact`
- Marketing URL: `https://playlistxfer.com`
- App description and review notes from `docs/app-store-release.md`
- Final screenshots after the last visual pass
- Final icon after the logo pass is approved

## Internal TestFlight Gate

Run this on a clean TestFlight install, not a development install:

1. Launch the app with an empty clipboard.
2. Paste a public Spotify playlist link.
3. Preview the playlist.
4. Match the playlist against Apple Music.
5. Choose a different candidate on at least one review item if available.
6. Mark one item as wrong and restore it.
7. Create the Apple Music playlist.
8. Open Apple Music and confirm the playlist appears.
9. Return to PlaylistXfer and transfer another playlist.
10. Share a Spotify playlist into PlaylistXfer from the iOS share sheet.
11. Share a Spotify track into PlaylistXfer and add it to the `PlaylistXfer Inbox`.

## Known Review Notes

- PlaylistXfer is not affiliated with Spotify or Apple.
- The MVP does not require Spotify login.
- Preview and match review work before Apple Music authorization.
- Apple Music access is requested only for the final write step.
- Apple Music private library playlists do not always deep-link reliably, so the app provides a clear receipt and playlist name.
- Share Sheet ordering is controlled by iOS. Users can favorite PlaylistXfer from `More > Edit`.
