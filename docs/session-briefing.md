# Session Briefing

## Purpose of this document

This file is meant to help the next agent or working session start fast, with the right context, the right assumptions, and the right priorities.

It is intentionally opinionated and compressed.

The goal is simple:

The next session should be able to hit the ground running.

## Project in one sentence

PlaylistTransfer is a mobile-first playlist migration product focused on making Spotify to Apple Music transfers cheap, transparent, and trustworthy, with unmatched-track reporting as a core feature rather than an afterthought.

## Current state

The project is at the concept and planning stage.

What already exists:

- a project folder
- baseline documentation
- an initial product direction
- a rough architecture recommendation
- a monetization stance
- an MVP roadmap
- a kickoff document

What does not exist yet:

- validated API feasibility memo
- repo scaffold
- implemented app or backend
- tested auth flows
- measured real-world track match rate
- pricing decision

## The core problem

People build playlists over years.
That playlist history creates lock-in.

Switching music services is painful because:

- playlists are hard to rebuild manually
- cross-service catalogs are inconsistent
- failed matches are often hidden or unclear
- existing tools can feel expensive or low-trust

This project exists to reduce that switching pain.

## The sharpest product wedge

Do not start as a universal music migration platform.

Start narrow and useful.

Recommended first route:

- source: Spotify
- destination: Apple Music

Why this is the right starting point:

- clear user pain
- common switching path
- strong consumer intent
- easier product story
- enough technical complexity already without adding more providers

## What makes this product different

The product should not compete only on price.
That is too weak by itself.

The stronger differentiation is:

- genuinely usable free tier
- very clear transfer results
- visible unmatched tracks
- CSV export of misses
- better trust and transparency than incumbents

### Core product promise

"Move your playlist in minutes and see exactly what didn't transfer."

## Product philosophy

These principles should shape every decision.

### 1. Trust before monetization

If something makes the app feel sketchy, it is probably not worth the short-term revenue.

### 2. Never hide failure

Users can tolerate misses.
They will not tolerate silent misses.

### 3. Free must be useful

The free tier should solve a real job, not just tease the product.

### 4. The first success is sacred

The first successful transfer is the trust-building moment.
The UX should optimize for that.

### 5. Start narrow, then expand

Win one migration route before adding more services.

## Product thesis

There appears to be room in the market for a lower-friction, lower-cost, more transparent playlist transfer tool.

The most credible initial version is:

1. user imports a Spotify playlist
2. app analyzes tracks
3. app searches Apple Music equivalents
4. app creates the destination playlist
5. app shows matched and unmatched results
6. app exports misses to CSV if needed

This is enough to create obvious user value.

## Strategic opinion on ads

The idea of using ads is valid, but the app should not feel like an ad machine.

This matters because the user is being asked to trust the app with:

- account connections
- playlist access
- destination library writes

If the experience feels spammy, trust collapses.

### Good ad placement

- after a completed transfer
- on history screens
- before extra free transfers
- as rewarded unlocks

### Bad ad placement

- during login/auth
- during playlist parsing
- during match review
- during transfer progress
- on top of unmatched-track results

### Best monetization posture right now

Use a blended model:

- meaningful free tier
- ads outside the critical path
- optional one-time pass for burst usage
- subscription for heavy users / ad-free experience

## What should be treated as the hero feature

The unmatched-track report.

This is not just a support feature.
It is the trust feature.

That experience should include:

- match rate summary
- full list of unmatched songs
- artist/title details
- likely reason when possible
- CSV export
- future manual retry tools

## Recommended MVP

### In scope

- Spotify playlist URL import
- playlist parsing and normalization
- Apple Music authentication
- Apple Music catalog search
- match scoring
- Apple Music playlist creation
- transfer result summary
- unmatched-track CSV export
- basic transfer history
- freemium limits

### Out of scope

- all providers at once
- desktop apps
- collaborative features
- recurring sync
- social features
- recommendation engine
- fancy AI features unrelated to transfer quality

## Architecture recommendation

Recommended shape:

- React Native mobile app for iOS and Android
- TypeScript backend API
- Postgres database
- queue/worker for transfer jobs
- cache for match reuse and retries

### Why not purely client-side

A backend helps with:

- auth/token flows
- secure handling of secrets and signed tokens
- transfer orchestration
- retries for large playlists
- caching match results
- analytics and monetization enforcement

## Risks that matter most

### API/platform risk

This product depends on third-party ecosystems.

Need early validation of:

- Spotify API access model
- Apple Music auth and library-write flows
- platform review requirements
- rate limits and policy volatility

### Match quality risk

If match quality is poor, the product loses trust quickly.

### Retention risk

Migration is often episodic.
A user may transfer once and leave.

That affects pricing strategy and lifetime value assumptions.

### Support risk

Auth problems and catalog mismatches can generate support overhead fast.

### Trust risk

Over-aggressive monetization can undermine adoption before the app proves value.

## Open strategic questions

These are the big unanswered questions that the next session should keep in view:

1. Can Spotify to Apple Music be supported cleanly enough with official APIs?
2. What real match rate do we get on diverse playlists?
3. What free-tier cap is generous but sustainable?
4. Is a one-time pass better than a monthly subscription for v1?
5. What is the cheapest reliable architecture for launch?
6. How much manual correction should be in MVP versus later?

## Recommended user journey

### First-run experience

1. User understands what the app does immediately.
2. User chooses source and destination.
3. User authorizes required accounts.
4. User imports playlist.
5. User sees analysis summary.
6. User confirms transfer.
7. User sees results with unmatched report.
8. User optionally exports CSV.

### UX priorities

- no confusing auth copy
- clear progress indication
- fast perceived time-to-value
- no hidden failed tracks
- easy exit after success

## Suggested metrics from day one

- playlist import success rate
- transfer completion rate
- average match rate
- unmatched export usage
- time to first successful transfer
- conversion from free to paid/pass
- support incidents per 100 transfers
- cost per successful transfer

## Suggested technical work order

The next session should not start by building the full product.

It should start by reducing uncertainty in the right order.

### Step 1: API feasibility spike

Confirm:

- reading Spotify playlists
- handling auth requirements
- searching Apple Music catalog
- creating Apple Music playlists
- adding tracks successfully
- identifying blockers and edge cases

### Step 2: domain model draft

Define:

- users
- linked provider accounts
- transfers
- transfer items
- playlists
- match results
- usage/quota events

### Step 3: user flow and screen map

Specify:

- onboarding
- import screen
- match review
- progress screen
- results screen
- unmatched report screen
- monetization entry points

### Step 4: implementation scaffold

Create:

- mobile app skeleton
- backend service skeleton
- env handling
- auth placeholders
- transfer job model

### Step 5: proof-of-value path

Aim for a narrow demo that proves:

- real playlist in
- real Apple playlist out
- real unmatched report generated

## Recommended artifacts for the next session

If time allows, the next session should create these in order:

1. `docs/api-feasibility.md`
2. `docs/mvp-user-flow.md`
3. `docs/domain-model.md`
4. `docs/pricing-hypotheses.md`
5. repo scaffold for app/backend

## Working assumptions

Unless disproven, the next session can assume:

- the initial market is consumer, not enterprise
- the first product is mobile-first
- Spotify to Apple Music is the first migration path
- unmatched reporting is a primary feature
- free tier is strategically important
- ads must stay outside the critical transfer path
- backend is worth having even for v1

## Things the next agent should avoid

- do not broaden scope to many providers immediately
- do not assume monetization should be ads-first
- do not bury unmatched tracks in secondary UI
- do not overbuild before API feasibility is checked
- do not treat this like a generic music app
- do not optimize the wrong thing before proving transfers work

## Best immediate next task

Create an `api-feasibility.md` that answers, with concrete evidence:

- what Spotify allows for playlist reads and under what auth constraints
- what Apple Music requires for auth and playlist creation
- what the hardest technical blockers are
- what can realistically be shipped in an MVP

## If the next session needs a one-paragraph handoff

PlaylistTransfer is a mobile-first freemium app concept focused on Spotify to Apple Music playlist migration. The core differentiator is a trustworthy unmatched-track report with CSV export, not just raw transfer capability. The right next move is not broad implementation but a feasibility pass on Spotify and Apple Music APIs, followed by an MVP flow spec and a narrow technical scaffold.
