# End-to-End Validation

## Summary

The first full `Spotify -> Apple Music` technical spike has been validated against a real playlist.

The spike successfully:

- authenticated with Spotify through OAuth
- read a user-owned Spotify playlist through the Spotify Web API
- authenticated Apple Music requests with a developer token and music user token
- searched the Apple Music catalog
- matched Spotify tracks to Apple Music catalog songs
- created an Apple Music playlist
- added matched songs to that playlist
- generated local transfer artifacts

## Test run

Playlist:

- Spotify playlist name: `Daily Test`
- Spotify playlist ID: `6NwrTvQmJgGK9TVgJOkQtp`

Result:

- total tracks: `50`
- initial matched tracks: `49`
- initial unmatched tracks: `1`
- initial match rate: `98%`
- improved matched tracks: `50`
- improved unmatched tracks: `0`
- improved match rate: `100%`
- Apple playlist created: `p.o1mRu2273qa`

Generated artifacts:

- `artifacts/report.json`
- `artifacts/report.csv`
- `artifacts/unmatched.json`

## Important platform finding

Spotify-generated playlists such as `Daily Mix` are not reliable playlist inputs for this API flow.

The original `Daily Mix` URL returned `404` through the playlist endpoint.
A public playlist not owned by the authenticated account returned `403` for playlist items.

The flow succeeded after the songs were copied into a normal playlist owned by the authenticated Spotify account.

Current working assumption:

- user-owned Spotify playlists are the supported path for the MVP
- arbitrary public playlist links are a product risk and need a separate investigation

## Unmatched investigation

The single unmatched source track was:

- title: `November Rain - B&H Version`
- artist: `Ghetto Blaster Ltd.`
- album: `Bossa N' Roses`
- Spotify ISRC: `ARF410600521`
- Spotify track ID: `2sO2B8YGt8Bi9p3tgmSdlC`

Manual Apple Music inspection suggests the track may exist as:

- title: `November Rain [B&H Version]`
- album: `Bossa N Roses`

Likely causes:

- Apple search did not return the correct candidate in the first result set
- the Apple catalog version may have different artist metadata
- punctuation differences between `- B&H Version` and `[B&H Version]` may have lowered fallback matching
- the current pipeline only searches one query shape per track

After adding candidate diagnostics, the failed search term was:

```text
November Rain - B&H Version Ghetto Blaster Ltd.
```

Apple returned an unrelated `Ghetto Bla$ter` candidate instead of the album track.
This supports adding multiple query shapes such as title + album and title-only fallback.

After adding multiple query shapes, the track matched successfully by ISRC:

- Apple song ID: `202560053`
- Apple title: `November Rain (B&H Version)`
- Apple artist: `Gheto Blaster Ltd.`
- Apple album: `Bossa N Roses`
- Apple ISRC: `ARF410600521`

This confirms the miss was a search-recall problem, not a catalog availability problem.

## Matching follow-ups

Useful next improvements:

- save Apple search candidates in `report.json` for every track
- try multiple query shapes per track
- search by album + title when title + artist fails
- add bracket/parenthesis/version normalization
- add manual review output with closest candidates
- optionally search the user's Apple Music library before catalog search

## Product follow-ups

There are two major product questions after this validation.

### 1. Match quality and repair flow

The product should explain misses and help users fix them.

Near-term product work:

- show unmatched tracks clearly
- show closest Apple Music candidates
- allow manual candidate selection
- retry transfer after manual fixes
- preserve `matched`, `unmatched`, and `needs review` as separate states

### 2. Clean app experience

The current credential-heavy setup is only acceptable for a local spike.

A real app should:

- use Spotify OAuth in-app
- use MusicKit authorization in-app
- hide developer tokens and private keys behind backend infrastructure
- support user-owned Spotify playlists first
- explain unsupported public/generated playlists clearly

The harder open question is whether arbitrary Spotify links can be supported under current Spotify API restrictions.
That needs a dedicated platform investigation before it becomes a product promise.
