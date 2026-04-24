# Product PRD

## Product summary

PlaylistTransfer is a mobile-first app that migrates playlists between music platforms, beginning with Spotify to Apple Music.

The first wedge is simple:

- user pastes or opens a Spotify playlist
- app reads tracks
- app finds Apple Music equivalents
- app creates a new Apple Music playlist
- app shows every track that failed to match

## Problem

Users want to switch music services, but playlists are sticky. Existing tools often feel expensive, limited, or opaque when tracks fail to transfer.

## Goal

Make playlist switching cheap, transparent, and reliable.

## Target users

- people moving from Spotify to Apple Music
- users testing a new streaming subscription
- families consolidating onto Apple One
- music collectors with many curated playlists

## Jobs to be done

- "Move my playlist without rebuilding it by hand"
- "Tell me what failed so I can fix it"
- "Let me try before I pay"

## MVP scope

In scope:

- Spotify playlist URL import
- Apple Music authentication
- automated track matching
- playlist creation in Apple Music
- unmatched-track report
- CSV export for unmatched tracks
- basic migration history

Out of scope for MVP:

- collaborative playlist sync
- recurring sync jobs
- social features
- desktop apps
- every streaming platform on day one

## Success metrics

- playlist import completion rate
- per-track match rate
- time to completed transfer
- free-to-paid conversion
- day-7 retention
- support tickets per 100 transfers

## UX principles

- make the import path obvious
- never hide failed matches
- let users retry or fix misses quickly
- show progress on large playlists
- keep the first successful transfer under 3 minutes for a normal playlist

## Key screens

- landing/onboarding
- import playlist screen
- match review screen
- transfer results screen
- unmatched tracks screen
- upgrade/paywall screen
- settings and account connections

## Main user flow

1. User selects source service and destination service.
2. User authorizes required accounts.
3. User imports a playlist.
4. System matches tracks in the destination catalog.
5. User reviews summary and unmatched items.
6. User starts transfer.
7. System creates playlist and adds matched tracks.
8. User sees final report and can export misses.

## Risks

- third-party API changes
- token/auth complexity on iOS and Android
- catalog differences lowering perceived quality
- ad-heavy experience hurting trust
- poor economics if free users are costly to serve

## Strategic note on ads

Ads are viable, but the app should not feel spammy during the transfer flow.

Recommended approach:

- no ad interruptions during the critical transfer progress step
- use rewarded ads or interstitials between transfers, not during them
- reserve subscription for power users and ad-free experience
