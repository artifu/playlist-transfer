# Project History

## Origin

PlaylistTransfer started from a simple practical frustration:

Moving from Spotify to Apple Music should not require manually rebuilding years of playlists or paying for a tool before knowing whether it works.

The initial goal was not to build a full startup stack on day one. It was to answer a narrower and more important question:

Can we reliably transfer a real Spotify playlist into Apple Music, and clearly show what fails to match?

## Early product direction

From the beginning, the project centered on a few strong opinions:

- start with one migration path instead of every platform at once
- prioritize trust and transparency over aggressive monetization
- treat unmatched tracks as a product feature, not an error state
- validate the APIs and matching quality before building a polished app

That led to the first wedge:

- source: Spotify
- destination: Apple Music

## Current phase

The repository is currently in the technical validation phase.

The work so far has focused on:

- product framing
- architecture planning
- API feasibility analysis
- a local TypeScript spike for the transfer pipeline

This stage is intentionally lightweight. The goal is to learn quickly, publish the reasoning clearly, and keep the implementation inspectable.

## What comes next

If the technical spike proves reliable on real playlists, the next steps are:

1. improve matching confidence and reporting quality
2. promote the spike into a lightweight backend service
3. build a mobile app on top of the validated workflow

The longer-term ambition is a trustworthy migration product.
The immediate mission is to prove the core transfer flow in the open.
