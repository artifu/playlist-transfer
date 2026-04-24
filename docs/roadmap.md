# Roadmap

## Phase 0: validation

- confirm Spotify and Apple Music API constraints
- prototype auth and playlist read/write flows
- measure real-world match rate on 20 sample playlists
- estimate cost per transfer

## Phase 1: MVP

- Spotify to Apple Music only
- mobile app shell
- backend API and queue
- unmatched-track CSV export
- freemium usage limits
- analytics and crash reporting

## Phase 2: polish

- manual fix UI for unmatched tracks
- saved transfer history
- better confidence scoring
- support for private Spotify playlists where allowed
- one-time pass purchase flow

## Phase 3: expansion

- YouTube Music support
- Deezer support
- batch multi-playlist transfer
- family migration flow
- background sync and recurring transfer jobs

## Kill criteria

Stop or pivot if:

- API restrictions make acquisition too fragile
- match quality is too low to earn trust
- support cost overwhelms free-tier economics
- app store approval becomes unstable
