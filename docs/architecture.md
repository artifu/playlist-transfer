# Architecture

## Product shape

A practical first version is:

- React Native mobile app for iOS and Android
- backend API for token exchange, playlist reads, matching, and transfer jobs
- Postgres database for users, transfers, and match history
- background worker for large playlist processing

## Why not mobile-only

A pure client app becomes painful because:

- some provider flows need secrets or signed tokens
- retries and progress tracking work better on a backend
- match caching is valuable and reusable across users
- analytics and freemium enforcement are easier server-side

## Recommended stack

Frontend:

- React Native with Expo if allowed by provider SDK requirements
- TypeScript
- native secure storage for session tokens

Backend:

- Node.js + TypeScript
- Fastify or Express
- PostgreSQL
- Redis for queues and caching
- background jobs with BullMQ or equivalent

Infra:

- API hosted on Fly.io, Render, Railway, or AWS
- Postgres hosted managed
- object storage for CSV exports if needed
- analytics and crash reporting from day one

## Service boundaries

### Mobile app

Responsibilities:

- onboarding
- auth initiation
- playlist selection UI
- transfer progress UI
- unmatched report UI
- payments and ad display

### API service

Responsibilities:

- OAuth/token handling
- provider API wrappers
- playlist normalization
- matching pipeline
- transfer orchestration
- subscription and quota checks

### Worker

Responsibilities:

- long-running imports
- destination playlist writes
- retries with backoff
- export generation

## Matching pipeline

1. Normalize title, artist, featuring text, remix markers, and punctuation.
2. Try exact-ish title + primary artist search.
3. Score candidate results.
4. Prefer ISRC when available.
5. Flag low-confidence matches for manual review.
6. Save match outcomes for future reuse.

## Data model outline

- users
- provider_accounts
- transfers
- transfer_items
- playlists
- match_cache
- subscription_state
- usage_events

## API outline

- `POST /auth/spotify/start`
- `POST /auth/apple/start`
- `POST /transfers`
- `GET /transfers/:id`
- `POST /transfers/:id/retry-unmatched`
- `GET /transfers/:id/unmatched.csv`

## Non-functional requirements

- handle playlists with 1,000+ tracks
- idempotent retries
- visible audit trail per transfer
- clear error messages for revoked auth
- privacy-first storage of tokens and playlist data

## Compliance concerns

Validate early:

- Spotify platform terms
- Apple Music API usage rules
- App Store rules around account linking and subscriptions
- ad network rules for music-related apps
