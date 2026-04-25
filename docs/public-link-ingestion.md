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

The probe does not use `.env` and does not use Spotify user OAuth.

It currently tests:

- Spotify oEmbed
- the public open playlist page
- the public embed playlist page
- the anonymous Spotify embed session against Spotify's public web client endpoints

Outputs are written to:

```text
artifacts/public-probe-<playlist-id>.json
```

## Findings

The first probes produced an important result:

- Spotify oEmbed exposed title, thumbnail, and iframe URL, but not tracks
- the normal public playlist page did not expose a usable track list
- the public embed playlist page exposed track-like objects, but may render only the first page of a larger playlist
- the embed page includes an anonymous session token intended for Spotify's public web/embed client
- that anonymous token can read `spclient.wg.spotify.com/playlist/v2/playlist/<playlist-id>?format=json`
- the `spclient` playlist response can include the full playlist rows, not only the visible embed rows
- the same anonymous token can read per-track metadata from `spclient.wg.spotify.com/metadata/4/track/<track-gid>`

Tested examples:

- `Daily Test`: API-readable user-owned playlist, `50` tracks found from embed page
- `Daily Mix test`: public playlist that returned `403` through the authenticated Web API, `50` tracks found from embed page
- `Daily Mix 1`: generated/personalized playlist that returned `404` through the authenticated Web API, `50` tracks found from embed page
- `Lullaby Renditions...` large public playlist: Spotify app showed `504` rows, embed HTML exposed `100`, and the public `spclient` path returned `504` rows

This is the strongest signal so far that a no-Spotify-login ingestion path is technically possible.

The large-playlist probe found:

- playlist rows: `504`
- unique Spotify track IDs after dedupe: `494`
- metadata responses: `494 / 494`
- duplicate Spotify track IDs removed: `10`

The project intentionally dedupes repeated Spotify track IDs in the public path for now. That gives us a safer first product behavior and avoids creating accidental duplicate rows in Apple Music while the ingestion path is still being hardened.

## Current implementation

The public extractor now lives in:

```text
src/providers/spotify-public.ts
```

It can:

- parse a Spotify playlist URL or playlist ID
- probe oEmbed, the public playlist page, and the public embed page
- extract the anonymous embed session token from `__NEXT_DATA__`
- fetch full playlist rows through Spotify's public web client endpoint when available
- fetch richer per-track metadata through Spotify's public web client metadata endpoint
- fall back to embedded JSON extraction if the public web client path stops working
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

The preferred public `spclient` path currently yields:

- Spotify track ID
- track name
- artist names
- album name
- duration
- ISRC, when present in Spotify metadata

The fallback public embed path currently yields:

- Spotify track ID, derived from embedded Spotify URI metadata
- track name
- artist names
- duration

The fallback embed path does not reliably yield:

- ISRC
- album name

That means the preferred public path can support higher-confidence Apple Music search than the earlier embed-only approach, while the fallback path can still support title/artist matching with lower confidence.

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
- if blocked and the user owns the playlist, guide them to make it public or add it to their profile
- if blocked and the user does not own the playlist, guide them to copy/add it into a new playlist in their own Spotify account, make that playlist public, and share the new link
- optionally accept pasted text, CSV, or Spotify account-data JSON as a later manual import path
- keep Spotify OAuth as a backburner fallback, not the MVP foundation

## Product implication

The product promise should still be careful. The technical path works on the tested playlists, including a 504-row playlist, but it relies on Spotify's public web/embed surface rather than a documented Web API contract.

Safer current promise:

> Paste a Spotify link. If the platform allows us to read it, we transfer it. If not, we show exactly why and offer the next best path.

## Next investigation steps

- run the probe against more playlist types and sizes
- run Apple Music matching from larger public-extracted playlists
- compare match quality between authenticated API metadata and public `spclient` metadata
- cache public metadata lookups so repeated probes do not hammer Spotify's public web endpoints
- add rate-limit/backoff behavior around public metadata fetching
- decide whether to add a fallback path for pasted text or CSV when Spotify blocks public extraction

## Production risk

This path is very attractive for user experience because it avoids Spotify login, but it is not a stable official API integration.

Known risks:

- Spotify can change the embed page structure.
- Spotify can remove or reshape the anonymous session payload.
- Spotify can change, rate-limit, or block the public `spclient` endpoints.
- App-store review or platform policy may require a more conservative fallback if this is considered scraping or undocumented API use.

Recommended product architecture:

1. Try public-link extraction first.
2. If it works, show the playlist preview immediately.
3. Analyze Apple Music matches before writing anything.
4. Create the destination playlist from confident matches only.
5. If public extraction fails, guide the user to make or copy the Spotify playlist into a normal public playlist and retry.
6. Later, offer manual import through pasted text, CSV, or Spotify data export.
7. Keep Spotify OAuth as an optional advanced fallback if the app ever gets approved for broader access.
