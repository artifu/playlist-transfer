# Project Kickoff

## Working title

PlaylistTransfer

## Why this project exists

Switching music services should not mean losing years of playlist curation.

That is the pain point this project is trying to solve.

Most existing playlist-transfer tools feel like one of these:

- too expensive for a simple one-time migration
- not transparent when tracks fail to transfer
- usable only after payment
- functional, but not pleasant or trustworthy

This project is based on a simple belief:

A transfer tool can be cheaper, clearer, and more user-friendly while still becoming a real business.

## Initial thesis

The strongest wedge is not "transfer everything everywhere."

The strongest wedge is:

- start with the highest-friction migration path people actually care about
- make the first transfer feel easy and trustworthy
- show exactly what succeeded and what did not
- give users a usable free tier instead of blocking value behind a paywall

The first recommended path is:

- source: Spotify
- destination: Apple Music

Why this pair:

- it matches a common consumer switching scenario
- Apple Music users are often paying customers already, which increases intent
- playlist migration pain is especially visible here
- the unmatched-track report can become a clear product differentiator

## Product concept

PlaylistTransfer is a mobile-first app for iOS and Android that helps users move playlists from one music service to another.

The first version should do one thing very well:

1. import a Spotify playlist
2. match tracks against Apple Music
3. create the destination playlist
4. show a clean results report
5. export unmatched tracks for manual cleanup

This gives the product a very clear promise:

"Move your playlist in minutes and see exactly what didn't make it over."

## Strategic opportunity

There appears to be room in the market for a more affordable and more transparent option.

The likely opportunity is not simply "be cheaper."
The better opportunity is:

- lower friction to try
- clearer transfer results
- better trust during failure cases
- more useful free tier

That combination is likely more defensible than price alone.

## Freemium angle

The original instinct was to aggressively undercut incumbents and monetize with ads.

That instinct is directionally useful, but it needs refinement.

### What seems right

- there should be a free tier
- the free tier should be genuinely usable
- the app can absolutely undercut expensive incumbents
- ad-supported usage can help expand the top of funnel

### What needs caution

If the app feels like an ad trap, users will not trust it with account permissions and library writes.

This is especially important because the product asks users to:

- connect their music accounts
- let the app inspect playlists
- let the app write into their destination library

That means the product has to feel trustworthy.

### Recommended monetization posture

Use a blended model:

- free tier with meaningful limits
- ads outside the critical path
- optional one-time pass for short migration bursts
- subscription for power users and ad-free usage

### Ads should not appear

- during authentication
- during playlist analysis
- during transfer progress
- on top of unmatched-track review

### Ads can appear

- after a transfer completes
- in history screens
- before starting additional free transfers
- as rewarded unlocks for extra monthly usage

## Core differentiator

The unmatched-track experience should be treated as a first-class feature, not as an error state.

That means the app should:

- show match rate clearly
- list every unmatched song
- explain likely reasons for misses
- let users export CSV
- eventually offer manual correction and retry tools

This is important because users can forgive imperfect catalog matching.
They do not forgive hidden failures.

## User promise

The product should feel:

- simple
- transparent
- trustworthy
- fast enough for real playlists
- cheap enough to try without overthinking it

## Proposed product principles

### 1. Trust before growth

If a growth tactic makes the product feel sketchy, it is probably the wrong tactic.

### 2. Never hide misses

Failed matches must be visible, reviewable, and exportable.

### 3. The first success matters most

The first completed transfer is the moment that earns trust.
Optimize hard for that.

### 4. Free should be useful, not fake

The free tier should solve a real job, not just tease the paid plan.

### 5. Start narrow

Do not launch as a universal music migration suite on day one.
Win one route first.

## MVP definition

### In scope

- Spotify playlist URL import
- playlist parsing and normalization
- Apple Music authentication
- Apple Music search and matching
- destination playlist creation
- matched vs unmatched summary
- unmatched CSV export
- basic transfer history
- freemium limits

### Out of scope

- every music platform
- collaborative playlist sync
- recurring sync jobs
- desktop apps
- social/community features
- overly complex recommendation features

## Recommended technical shape

A practical first architecture is:

- React Native mobile app
- backend API in TypeScript
- Postgres for persistence
- background worker for long-running transfers
- queue and cache layer for retries and match reuse

Why not purely client-side:

- provider auth flows are messy
- token handling is safer server-side
- match caching becomes valuable over time
- large playlists benefit from async jobs and retry orchestration
- quotas, monetization, and analytics are easier to enforce centrally

## Known risks

### Platform/API risk

This business depends heavily on third-party platform access.

Must validate early:

- Spotify API constraints and review requirements
- Apple Music library-write auth complexity
- rate limits and provider policy changes

### Match quality risk

The app lives or dies on perceived transfer quality.

Even if not every track matches, the experience must still feel reliable.

### Retention risk

Playlist migration can be episodic.
That means pure subscription economics may be weak unless the product later expands into sync or ongoing utility.

### Trust risk

If monetization is too aggressive, users may hesitate to connect their accounts.

## Early strategic questions

These questions should guide the next phase of work:

1. Can we reliably support Spotify to Apple Music with official APIs and acceptable approval risk?
2. What real match rate do we achieve on diverse public playlists?
3. What free-tier limit feels generous but still sustainable?
4. Is a one-time pass stronger than a monthly subscription for this category?
5. What is the cheapest architecture that still feels production-grade?

## Suggested success metrics

Track these from the start:

- playlist import success rate
- per-track match rate
- transfer completion rate
- time to first completed transfer
- unmatched export rate
- free-to-paid conversion
- cost per successful transfer
- day-7 and day-30 retention

## Project posture for the next session

The next proper working session should not jump straight into coding the full app.

It should begin with a focused validation pass.

### Session goal

Determine whether the business and technical path is viable enough to justify building the MVP.

### Recommended agenda

1. validate official API capabilities and constraints
2. define exact MVP user flow
3. choose monetization shape for v1
4. choose stack and deployment approach
5. convert risks into concrete spike tasks

## Recommended immediate deliverables

The next documents worth creating are:

- API feasibility memo
- MVP user flow spec
- monetization decision memo
- mobile app screen map
- backend domain model
- launch plan / acquisition hypotheses

## Practical next step

The single best next step is an API feasibility spike focused on:

- reading Spotify playlists
- matching tracks to Apple Music catalog
- creating Apple Music playlists
- identifying hard blockers around auth, quotas, or review rules

If that spike looks good, the project should move into implementation planning.
If not, the idea should pivot early rather than after a large build.

## Summary

This project has a credible wedge:

- real user pain
- understandable value proposition
- clear room for differentiation
- viable freemium positioning if handled carefully

The strongest version of the product is not the loudest or most ad-heavy one.
It is the one users trust enough to hand over their playlists.
