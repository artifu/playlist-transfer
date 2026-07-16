# PlaylistXfer App Store Release

Last reviewed: 2026-07-13

This is the working release package for the first public iOS build. The current cream two-record app icon is installed in the app bundle, but final visual sign-off and the final submission click are intentionally deferred until the other release work is complete.

## Release Decisions

- Product name: `PlaylistXfer`
- Version: `1.0`
- Build: `1`
- Minimum OS: iOS 17
- Devices: iPhone only for version 1.0
- Primary category: Music
- Price: Free
- Main bundle id: `com.artifu.playlistxfer`
- Share extension bundle id: `com.artifu.playlistxfer.shareextension`
- Support URL: `https://playlistxfer.com/contact`
- Marketing URL: `https://playlistxfer.com`
- Privacy URL: `https://playlistxfer.com/privacy`

## Store Metadata Draft

### Name

```text
PlaylistXfer
```

### Subtitle

```text
Spotify to Apple Music
```

### Promotional Text

```text
Preview public Spotify playlists and songs, review Apple Music matches, and transfer only the tracks you approve.
```

### Description

```text
Move public Spotify playlists and individual songs into Apple Music without transferring blind.

Paste a Spotify link or share it directly to PlaylistXfer. The app previews the source, searches the Apple Music catalog, and shows exactly what matched before anything is added.

With PlaylistXfer you can:

- Preview public Spotify playlists without signing in to Spotify
- Match playlists and individual songs with the Apple Music catalog
- Review uncertain matches and choose another candidate
- Skip tracks that do not look right
- Create a new Apple Music playlist from approved matches
- Add individual songs to your PlaylistXfer Inbox
- Start from the iOS Share Sheet

Apple Music access is requested only when it is needed to add music. PlaylistXfer does not download audio and does not require a PlaylistXfer account.

An active Apple Music account may be required to add catalog music to your library.

PlaylistXfer is an independent interoperability tool and is not affiliated with, endorsed by, or sponsored by Spotify or Apple.
```

### Keywords

```text
spotify,apple music,playlist,transfer,converter,songs,import,music library,share
```

### Copyright

```text
2026 Arthur Mendes
```

## Screenshot Plan

Capture real iPhone screens after the final icon and last visual pass. Use one consistent public playlist and avoid exposing personal Apple account details.

1. Paste or share a Spotify playlist or song link.
2. Preview the source playlist with artwork and tracks.
3. Show monotonic Apple Music matching progress.
4. Show the match report with ready, review, missing, and candidate selection.
5. Show a successful Apple Music playlist creation receipt.
6. Optional: show the Share Sheet extension handoff.

Suggested screenshot headlines:

```text
Drop in any public Spotify link
See every track before you transfer
Review Apple Music matches clearly
Fix uncertain matches in a tap
Create your playlist when it looks right
Share from Spotify straight to PlaylistXfer
```

## Current Asset Inventory

The approved brand source of truth is the cream two-record designer variant:

```text
DesignSuggestions/brand-assets/png/cream/icon-1024.png
DesignSuggestions/brand-assets/png/cream/icon-180.png
DesignSuggestions/brand-assets/svg/icon-appicon-square-cream.svg
```

Run this whenever the designer exports a new approved logo package:

```bash
npm run brand:sync
npm run brand:check
```

The sync command updates:

```text
apps/ios/PlaylistXfer/Assets.xcassets/AppIcon.appiconset
apps/ios/PlaylistXfer/Assets.xcassets/BrandMark.imageset
apps/web/public/favicon.svg
apps/web/public/apple-touch-icon.png
```

The installed icon uses the approved two-overlapping-records direction from `DesignSuggestions/brand-assets`. The warmer `png/cream` background is used for the current iOS and web builds; `png/paper` remains available as the lighter alternate. Avoid the older `appicon-readable` experiment for shipping unless the design direction changes again.

Raw simulator screenshots for internal review are currently generated in:

```text
artifacts/ios-screenshots/01-home.png
artifacts/ios-screenshots/02-preview.png
artifacts/ios-screenshots/03-matching.png
artifacts/ios-screenshots/04-match-report.png
artifacts/ios-screenshots/05-created.png
```

These screenshots are useful for design review and App Store copy planning. Capture final App Store screenshots from the post-UAT build after the final logo/icon pass.

## App Privacy Data Inventory

Use this inventory to answer App Store Connect's App Privacy questionnaire. Recheck it against the shipping build before publishing the answers.

Collected for app functionality and limited product analytics:

- A random app-generated installation/session identifier stored in `UserDefaults` and sent as an API ownership boundary.
- The submitted public Spotify playlist or song identifier.
- Public playlist and track metadata needed to preview and match the source.
- Match results, aggregate counts, and review decisions retained with the transfer report for about seven days.
- Product interaction events such as preview, analysis, review, and creation success or failure.
- Operational fields such as duration, safe error category/message, app path, and source.

Not collected by the current native app:

- Name, email address, phone number, or physical address.
- Advertising identifier or cross-app tracking data.
- Precise or coarse location.
- Contacts, photos, microphone audio, or health data.
- Spotify credentials.
- Apple Music user tokens in durable database storage.
- Payment information.

Conservative App Store Connect draft:

- Identifiers: app-generated device/session identifier.
- Usage Data: Product Interaction.
- Diagnostics: Other Diagnostic Data.
- User Content: submitted public music link and review choices, because the transfer report is retained temporarily rather than processed only in real time.
- Purposes: App Functionality and Analytics.
- Tracking: No.
- Advertising: No in the iOS 1.0 build.

The identifier is not connected to a PlaylistXfer account or real-world identity. App Store Connect's wording can change, so confirm the linked/not-linked answer against the questionnaire shown during submission.

The shipping app includes `PrivacyInfo.xcprivacy`. It declares no tracking and no collected-data entries in the manifest itself, plus the approved `CA92.1` required-reason entry for the app's own `UserDefaults` access. The App Store Connect privacy questionnaire must still describe the server-side data inventory above; the privacy manifest does not replace that questionnaire.

## App Review Notes Draft

```text
PlaylistXfer transfers public Spotify playlist and song links into Apple Music after showing a match report.

No PlaylistXfer or Spotify account is required. Apple Music authorization is requested only when the reviewer taps the final create/add action.

Suggested test flow:
1. Paste this public Spotify playlist URL:
   https://open.spotify.com/playlist/0h8JNovqXS97ygva27IHfi
2. Tap Preview Spotify Link.
3. Tap Match with Apple Music.
4. Review the ready/review/missing results. An uncertain match can be approved, replaced with another candidate, or skipped.
5. Tap Create Apple Music Playlist and authorize Apple Music if prompted.

The app also includes a Share Extension. Share a public Spotify playlist or song URL from Spotify or Safari, choose PlaylistXfer, then tap Open in PlaylistXfer.

The app does not stream, download, or host audio. It processes public metadata from a user-provided link and writes approved Apple Music catalog items to the reviewer's library. An Apple Music account with library access is required for the final write step; preview and match review work before authorization.
```

## App Store Connect Checklist

- Create the app record with the main bundle id.
- Confirm the Share Extension App ID and provisioning profile are valid.
- Set primary language to English (U.S.).
- Add the metadata above and choose the Music category.
- Complete Content Rights and Age Rating questionnaires honestly.
- Add Privacy, Support, and Marketing URLs.
- Complete and publish App Privacy answers from the final data inventory.
- Add final screenshots and final 1024px icon.
- Confirm the archived app contains `PrivacyInfo.xcprivacy`.
- Archive the Release build and run Xcode validation.
- Upload build `1` to App Store Connect.
- Run an internal TestFlight clean-install test.
- Add the review notes and select the uploaded build.
- Resolve export-compliance questions shown for the build.
- Submit for review.

See `docs/testflight-runbook.md` for the Xcode archive and internal TestFlight flow.

## Final TestFlight Gate

- Fresh install on an iPhone that has never run the development build.
- Paste permission and clipboard suggestion behave consistently.
- Playlist and individual-song links both work.
- Share Extension appears and opens the containing app.
- Matching progress never moves backward.
- Candidate replacement, approval, skip, and restore work.
- Denying Apple Music permission produces a clear recovery path.
- Playlist creation succeeds after authorization.
- No secret, token, full private URL, or personal Apple account data appears in logs.
- Privacy, Terms, Contact, and Support pages load publicly.

## Deferred Until Last

- Final logo approval and any last app icon export.
- Final screenshot capture after the icon/UI pass.
- The actual Submit for Review action.

## Local Release Verification

Completed on 2026-07-13:

- Release archive compilation passed for a generic iOS device.
- Xcode's local store-oriented bundle validation step passed during the archive.
- The archived app contains the current compiled icon assets and privacy manifest.
- The Share Extension is embedded with its production bundle identifier.

Still required in Xcode Organizer: create a signed archive, run `Validate App`, upload to App Store Connect, and complete the clean-install TestFlight gate.
