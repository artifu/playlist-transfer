# Public Link Ingestion

## Goal

The most interesting product direction is:

> Paste any Spotify playlist link and create an Apple Music version, ideally without requiring Spotify login.

This document tracks the investigation into whether public Spotify playlist links expose enough metadata to support that flow.

## Why this matters

The official Spotify Web API path works for playlists available to the authenticated Spotify account.

That is useful, but it is not the dream flow.

The dream flow is better:

1. user pastes a Spotify playlist link
2. app reads the public track list without Spotify login
3. user connects Apple Music
4. app creates the Apple Music playlist

If this works reliably, the product can be much easier to try.

## Current known constraints

Validated API behavior:

- a Spotify-generated `Daily Mix` returned `404` through the Web API
- a public playlist not owned by the authenticated account returned `403` for playlist items
- a user-owned copied playlist worked

Apple's official transfer flow appears to share a similar product limitation: it focuses on playlists created by the user.

## Probe command

Run:

```bash
npm run spotify:public-probe -- "https://open.spotify.com/playlist/6NwrTvQmJgGK9TVgJOkQtp"
```

The probe does not use `.env` and does not use OAuth.

It currently tests:

- Spotify oEmbed
- the public open playlist page
- the public embed playlist page

Outputs are written to:

```text
artifacts/public-probe-<playlist-id>.json
```

## Initial findings

The first probes produced an important result:

- Spotify oEmbed exposed title, thumbnail, and iframe URL, but not tracks
- the normal public playlist page did not expose a usable track list
- the public embed playlist page exposed `50` track-like objects

Tested examples:

- `Daily Test`: API-readable user-owned playlist, `50` tracks found from embed page
- `Daily Mix test`: public playlist that returned `403` through the authenticated Web API, `50` tracks found from embed page
- `Daily Mix 1`: generated/personalized playlist that returned `404` through the authenticated Web API, `50` tracks found from embed page

This is the strongest signal so far that a no-Spotify-login ingestion path may be possible.

## Current implementation

The public extractor now lives in:

```text
src/providers/spotify-public.ts
```

It can:

- parse a Spotify playlist URL or playlist ID
- probe oEmbed, the public playlist page, and the public embed page
- extract track-like objects from embedded JSON
- normalize those tracks into the same `SpotifyTrack` shape used by the authenticated API path
- expose a reusable `getPublicSpotifyPlaylist` function for app/backend flows

The CLI wrapper lives in:

```text
src/cli/spotify-public-probe.ts
```

The local preview server also exposes:

- `POST /api/spotify/public-playlist-preview`
- `POST /api/transfers/analyze-public`

This means the repo now has a real no-Spotify-OAuth prototype path, not only a one-off scraper probe.

## Current extracted fields

The public embed path currently yields:

- Spotify track ID, derived from embedded Spotify URI metadata
- track name
- artist names
- duration

It does not currently yield:

- ISRC
- album name

That means the no-login path can probably support Apple Music search, but with less matching confidence than the authenticated Spotify API path.

## What the probe looks for

The probe checks whether public pages expose:

- playlist title
- thumbnail
- embedded JSON-LD
- `__NEXT_DATA__`
- track-like objects
- artist and album metadata

## Decision rule

If the public probe can consistently extract a meaningful track list, we can build a no-Spotify-login ingestion path.

If it cannot, the product should support a layered fallback:

- try public link extraction
- if blocked, ask user to connect Spotify
- if still blocked, explain how to copy the playlist into their account
- optionally accept pasted text or CSV as a manual import

## Product implication

The product promise should not become "any Spotify link works" until this probe succeeds across many playlists.

Safer current promise:

> Paste a Spotify link. If the platform allows us to read it, we transfer it. If not, we show exactly why and offer the next best path.

## Next investigation steps

- run the probe against more playlist types and sizes
- determine whether embed pages expose more than 50 tracks for large playlists
- run Apple Music matching from larger public-extracted playlists
- compare match quality between authenticated API metadata and public embed metadata
- decide whether to add a fallback path for pasted text or CSV when Spotify blocks public extraction
