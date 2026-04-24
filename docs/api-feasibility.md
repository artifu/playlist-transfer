# API Feasibility

## Purpose

This document summarizes the practical feasibility of building the first version of PlaylistTransfer with official Spotify and Apple Music APIs.

Primary question:

Can we realistically ship an MVP that transfers playlists from Spotify to Apple Music and clearly reports unmatched tracks?

## Short answer

Yes, with important caveats.

The MVP is technically feasible with official APIs, but the viability depends heavily on:

- Spotify app access constraints
- Apple Music authentication complexity
- catalog mismatches between services
- platform-review and policy interpretation

The biggest conclusion is this:

A Spotify to Apple Music MVP is plausible, but it should be built as a narrow, carefully scoped product rather than a broad “all services” migration platform.

## Bottom-line recommendation

Proceed with a Spotify to Apple Music MVP only if the product is designed around these realities:

- Spotify is the most policy-sensitive dependency
- Apple Music write flows are possible, but auth is more complex than Spotify
- unmatched-track reporting must be a first-class feature
- backend orchestration is strongly recommended
- feasibility should be proven with a technical spike before full build-out

## Feasibility verdict

### Spotify playlist read

Feasible: `Yes`

Reason:

Spotify’s Web API supports playlist retrieval through official playlist endpoints.

Relevant official references:

- `GET /playlists/{playlist_id}`
- `GET /playlists/{playlist_id}/items`

Sources:

- [Spotify Get Playlist](https://developer.spotify.com/documentation/web-api/reference/get-playlist)
- [Spotify Get Playlist Items](https://developer.spotify.com/documentation/web-api/reference/get-playlists-items)
- [Spotify Playlists Concept](https://developer.spotify.com/documentation/web-api/concepts/playlists)

### Apple Music catalog search

Feasible: `Yes`

Reason:

Apple Music API supports catalog search and song lookup, including storefront-aware searching and ISRC-based lookup.

Sources:

- [Apple Music API Overview](https://developer.apple.com/documentation/applemusicapi/)
- [Search](https://developer.apple.com/documentation/applemusicapi/search)
- [Get Multiple Catalog Songs by ISRC](https://developer.apple.com/documentation/applemusicapi/get-multiple-catalog-songs-by-isrc)
- [Storefronts and Localization](https://developer.apple.com/documentation/applemusicapi/storefronts_and_localization)

### Apple Music playlist creation

Feasible: `Yes`

Reason:

Apple provides official endpoints to create a user library playlist and add tracks to it.

Sources:

- [Create a New Library Playlist](https://developer.apple.com/documentation/applemusicapi/create-a-new-library-playlist)
- [Add Tracks to a Library Playlist](https://developer.apple.com/documentation/applemusicapi/add-tracks-to-a-library-playlist)

### End-to-end Spotify -> Apple Music transfer

Feasible: `Yes, but with meaningful execution risk`

Reason:

The individual building blocks exist. The main risks are not “missing APIs” but rather:

- Spotify developer restrictions
- Apple Music auth and user-token handling
- inconsistent catalog matching across services
- operational complexity for larger playlists

## Spotify feasibility

## What Spotify clearly allows

Spotify’s Web API supports:

- OAuth-based authorization
- reading playlist metadata
- reading playlist items
- creating and modifying playlists for Spotify users

Relevant sources:

- [Authorization](https://developer.spotify.com/documentation/web-api/concepts/authorization)
- [Get Playlist](https://developer.spotify.com/documentation/web-api/reference/get-playlist)
- [Get Playlist Items](https://developer.spotify.com/documentation/web-api/reference/get-playlists-items)
- [Create Playlist](https://developer.spotify.com/documentation/web-api/reference/create-playlist)
- [Add Items to Playlist](https://developer.spotify.com/documentation/web-api/reference/add-items-to-playlist)

For this product, the main Spotify need is reading playlists, not writing them.

## Spotify policy signal for transfer tools

Spotify’s developer policy explicitly says developers must not enable transfer of Spotify data to another service, except to enable a user to transfer their personal data or the metadata of the user’s playlists to another service.

That is a helpful signal for this product category.

Source:

- [Spotify Developer Policy](https://developer.spotify.com/policy)

Important interpretation:

This appears to support playlist migration use cases when the transfer is about the user’s own playlist metadata.
That said, policy interpretation is still a risk area and should not be treated as blanket immunity.

## Biggest Spotify risk: 2026 Development Mode changes

Spotify introduced significant Development Mode restrictions in February 2026.

Key points from the official migration guide:

- new Development Mode apps require the app owner to have Spotify Premium
- new apps are limited to 1 client ID per developer
- new apps are limited to 5 users per app
- existing apps with larger footprints may be grandfathered

Source:

- [February 2026 Web API Dev Mode Changes](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide)

### What this means in practice

For an early prototype, this is manageable.
For a consumer product, this is potentially a major go-to-market blocker unless the app can move beyond Development Mode under Spotify’s approval path.

This is the single biggest external risk for the project.

## Spotify playlist access caveat

Spotify’s current `Get Playlist Items` reference says the endpoint is only accessible for playlists owned by the current user or playlists the user collaborates on, and returns `403` otherwise.

Source:

- [Get Playlist Items](https://developer.spotify.com/documentation/web-api/reference/get-playlists-items)

Important inference:

The old assumption that any public playlist could be read freely is no longer safe.
For MVP planning, assume the clean supported path is:

- the user authenticates with Spotify
- the app reads playlists the user owns or collaborates on

Do not rely on unauthenticated or broad public-playlist ingestion as a core product assumption.

## Spotify data model implications

Spotify playlist responses now emphasize `items` rather than the older `tracks` structure in newer docs and migration guidance.

Source:

- [February 2026 migration guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide)

Implication:

The implementation should target current `items` semantics, not old examples based on deprecated fields.

## Apple Music feasibility

## What Apple clearly allows

Apple Music API supports:

- catalog access
- personalized library access with user authorization
- playlist creation in the user’s library
- adding tracks to a user library playlist

Sources:

- [Apple Music API Overview](https://developer.apple.com/documentation/applemusicapi/)
- [Create a New Library Playlist](https://developer.apple.com/documentation/applemusicapi/create-a-new-library-playlist)
- [Add Tracks to a Library Playlist](https://developer.apple.com/documentation/applemusicapi/add-tracks-to-a-library-playlist)

## Apple Music auth model

Apple uses:

- a `developer token`
- a `music user token` for user-specific requests

User-specific library operations require the music user token.

Source:

- [User Authentication for MusicKit](https://developer.apple.com/documentation/applemusicapi/user_authentication_for_musickit)

## Platform-specific Apple auth implications

### iOS

Strong fit.

Apple says MusicKit automatically manages the Music User Token for Apple platforms.
That makes iOS a favorable environment for the first-party Apple Music write path.

Source:

- [User Authentication for MusicKit](https://developer.apple.com/documentation/applemusicapi/user_authentication_for_musickit)

### Web

Also viable.

Apple says MusicKit on the Web automatically manages the Music User Token for web apps.

Source:

- [User Authentication for MusicKit](https://developer.apple.com/documentation/applemusicapi/user_authentication_for_musickit)

### Android

Viable, but more complex.

Apple states automatic Music User Token management is not available on Android, and points developers to MusicKit for Android authentication flows. Apple’s Android docs also expose token-related types such as `TokenProvider` and `TokenResult`.

Sources:

- [User Authentication for MusicKit](https://developer.apple.com/documentation/applemusicapi/user_authentication_for_musickit)
- [MusicKit for Android overview](https://developer.apple.com/musickit/)
- [Android MusicKit overview](https://developer.apple.com/musickit/android/overview-summary.html)
- [TokenProvider](https://developer.apple.com/musickit/android/com/apple/android/sdk/authentication/TokenProvider.html)
- [TokenResult](https://developer.apple.com/musickit/android/com/apple/android/sdk/authentication/TokenResult.html)

### Product implication

If the team wants the lowest-friction first implementation, `web + iOS` is friendlier than Android.
If the launch must be simultaneous on iOS and Android, the Apple side of Android auth deserves its own spike.

## Apple storefront and search implications

Apple’s catalog and search are storefront-based, and content varies by region.

Sources:

- [Storefronts and Localization](https://developer.apple.com/documentation/applemusicapi/storefronts_and_localization)
- [Get a Storefront](https://developer.apple.com/documentation/applemusicapi/get_a_storefront)

Implication:

Matching logic must be region-aware.
A transfer done for a US user may have different outcomes than for a user in another storefront.

This matters directly for unmatched-track reporting.

## Matching feasibility

## Can tracks be matched reliably?

Answer: `partially, but not perfectly`

This is not an API availability problem. It is a catalog equivalence problem.

Typical challenges:

- title punctuation differences
- featuring text differences
- live/remaster/deluxe variants
- regional availability differences
- explicit/clean version mismatches
- local files or unavailable tracks from Spotify playlists
- multiple Apple results for one ISRC or one search query

## What helps matching

A practical matching pipeline can use:

1. normalized title + artist search
2. album and duration as tie-breakers
3. ISRC when available
4. storefront-aware catalog search
5. confidence scores and fallback review states

Apple’s ISRC endpoint is especially useful where Spotify track metadata includes a usable ISRC.

Source:

- [Get Multiple Catalog Songs by ISRC](https://developer.apple.com/documentation/applemusicapi/get-multiple-catalog-songs-by-isrc)

## Product implication

A 100 percent automatic match rate should not be assumed.
The product must be designed around graceful imperfection.

That is why unmatched reporting is not optional.
It is part of the core value proposition.

## Can the app show unmatched tracks cleanly?

Yes.

This does not require extra provider support beyond:

- successful retrieval of source playlist items
- deterministic recording of match attempts and results

The unmatched report should be generated from the app’s own transfer pipeline.

Recommended unmatched fields:

- source track title
- source primary artist
- source album if present
- source Spotify URL/URI if present
- reason code
- search query used
- retry status

## Reason codes worth storing

Recommended examples:

- `no_apple_results`
- `low_confidence_match`
- `storefront_unavailable`
- `spotify_local_file`
- `spotify_metadata_incomplete`
- `apple_write_failed`

## MVP architecture implication

A backend is strongly recommended.

Why:

- Spotify OAuth handling is cleaner
- Apple developer-token management is safer
- transfer state and retries need persistence
- matching benefits from caching
- CSV export is easier to generate centrally
- quotas and freemium logic are easier to enforce

## Best candidate MVP shapes

### Option A: web app first

Pros:

- Apple Music on the web handles user token automatically
- faster iteration
- easier internal testing
- cheaper initial build

Cons:

- mobile packaging comes later
- product story is less app-native than a mobile-first launch

### Option B: iOS first

Pros:

- strongest Apple Music integration path
- cleaner Apple-side token handling
- natural audience for Apple Music destination users

Cons:

- narrows initial market
- Android delayed

### Option C: simultaneous iOS + Android mobile launch

Pros:

- biggest immediate market story

Cons:

- most complex path
- Android Apple Music auth adds extra work
- higher implementation and QA burden early

## Recommended path

Start with either:

- `web first`, then mobile
or
- `iOS first`, then Android

Do not force simultaneous cross-platform parity before the API spike is complete.

## Key blockers and severity

### Blocker 1: Spotify app restrictions

Severity: `High`

Why:

Spotify’s 2026 Development Mode limits can constrain real consumer rollout.

### Blocker 2: Apple Music Android auth complexity

Severity: `Medium`

Why:

The API is available, but Android requires more careful token handling.

### Blocker 3: catalog mismatch quality

Severity: `High`

Why:

This affects user trust directly.

### Blocker 4: policy and review interpretation

Severity: `Medium to High`

Why:

The category seems allowed in principle, but dependency on third-party policy is never fully stable.

## What the MVP should assume

The MVP should assume:

- the user authenticates with Spotify
- the app reads only supported user-accessible playlists
- the destination user has Apple Music access
- some tracks will fail to match
- the app must show exact misses
- the app will need backend orchestration

## What the MVP should not assume

The MVP should not assume:

- unrestricted access to arbitrary public Spotify playlists
- perfect automatic cross-catalog matching
- easy Android parity on day one
- frictionless scale without Spotify approval considerations

## Suggested spike plan

The next technical spike should answer these with live tests:

1. Can we read a user-owned Spotify playlist end to end with current auth rules?
2. Can we extract enough metadata to build a good Apple search query?
3. What percentage of tracks match using simple normalization?
4. How much does ISRC improve the match rate?
5. Can we create an Apple Music playlist and add matched tracks reliably?
6. What are the real failure modes for unmatched items?
7. Is web or iOS the cleanest first launch surface?

## Recommended implementation order

1. Spotify auth and playlist ingestion
2. Apple Music auth and storefront retrieval
3. search + match scoring pipeline
4. playlist creation + add tracks
5. transfer log and unmatched report
6. CSV export
7. freemium limits and monetization hooks

## Final recommendation

The project is technically viable enough to continue.

However, it is not yet proven enough to jump straight into full production build.

The clearest next move is:

- run a narrow API spike
- measure real match quality
- validate Spotify rollout constraints
- choose `web-first` or `iOS-first`
- keep unmatched reporting at the center of the MVP

## Practical conclusion

If the question is:

"Can we build a real Spotify to Apple Music transfer MVP with official APIs?"

The answer is:

`Yes, probably.`

If the question is:

"Can we assume the business and scaling path is straightforward?"

The answer is:

`No.`

The technical path exists.
The ecosystem constraints are the real challenge.
