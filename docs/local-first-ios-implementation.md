# Local-First iOS Transfer Path

Last updated: 2026-09-06

## Outcome

The iOS app now performs the normal transfer pipeline on the device:

1. Parse a Spotify playlist or song URL, URI, shared message, or short redirect.
2. Read public Spotify embed metadata locally without Spotify OAuth.
3. Verify playlist completeness against Spotify's public playlist manifest.
4. Match tracks locally against the Apple Music catalog with MusicKit.
5. Keep review decisions, manual corrections, history, duplicate prevention, and Apple Music writes on-device.

If local preview, matching, or manual Apple Music search fails, the existing hosted API is called automatically using the same response models. The user does not lose their transfer and the UI does not fork into separate local and remote modes.

## Safety boundaries

- An incomplete local Spotify result is rejected rather than silently truncated.
- The backend remains a recovery mechanism for Spotify surface changes and device/catalog incompatibilities.
- Analytics sends aggregate stage, execution path, duration, counts, and a sanitized fallback error. It does not send full shared URLs, search text, track names, Apple Music user tokens, or library contents.
- `-PlaylistXferRemoteOnly` can be supplied as a launch argument during development or emergency UAT to force the legacy path.

## Current tradeoffs

- Spotify's embed playlist data includes track ID, title, artist text, and duration, but not ISRC or album metadata. Local Apple Music matching therefore uses text and duration unless richer metadata becomes available. The review UI remains the quality backstop.
- Public Spotify surfaces are unofficial and can change. This is why the hosted fallback is intentionally retained.
- Very large or unusual playlists may not be fully represented by Spotify's embed. Completeness verification will route those cases to the hosted path.
- Analytics still uses the hosted event endpoint, but analytics failure never blocks a transfer. The transfer itself can succeed without the PlaylistXfer backend when the local provider calls work.

## Telemetry

The app emits the existing funnel events plus:

- `local_pipeline_succeeded`
- `local_pipeline_failed`
- `remote_fallback_started`
- `remote_fallback_succeeded`
- `remote_fallback_failed`

Safe dimensions are `pipelineStage`, `executionPath`, and `fallbackReason`. The final preview, analysis, and manual-search success events also include `executionPath` as `local`, `remote_fallback`, or `remote_only`.

## Validation completed

- Native iPhoneOS Swift 6 build: passed.
- Full JavaScript/backend suite: 35/35 passed.
- Live Spotify native-ingestion smoke test: Today's Top Hits returned 50 expected and 50 received tracks, in source order.
- MusicKit APIs compile against the installed iOS SDK.

## Required signed-device UAT

Before production submission:

1. Install the new build through internal TestFlight on a device signed into Apple Music.
2. Test one song, a small playlist, a 50-track playlist, a 100+ track playlist, a duplicate-heavy playlist, a shortened `spotify.link`, and malformed input.
3. For each valid input, confirm preview count, match quality, review corrections, playlist creation, and duplicate prevention.
4. Confirm telemetry shows local success for ordinary cases and an intentional fallback case when launched with `-PlaylistXferRemoteOnly` in Xcode.
5. Review fallback rate and local matching quality before external TestFlight promotion.
