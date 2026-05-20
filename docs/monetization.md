# Monetization

Last reviewed: 2026-05-19

## Thesis

There is room to undercut expensive incumbents, but the app should avoid becoming an ad trap.

If the product saves users hours of manual work, it can support a healthy freemium model.

## Recommended pricing shape

Free tier:

- limited transfers per month
- unmatched-track report included
- CSV export included
- ads shown between transfers

Plus tier:

- unlimited transfers
- faster batch processing
- no ads
- priority matching improvements
- migration history across devices

## Why this is stronger than ad-only

Ad-only revenue can be weak unless usage is very high. Playlist transfer is often episodic, so subscription or one-time unlock revenue is useful.

A better blend is:

- usable free tier
- subscription for heavy users
- optional one-time pass for a single migration burst

## Ads strategy

The MVP web page currently ships with a static sponsor placeholder rather than a third-party ad network script. This keeps the first public tests fast and privacy-light while preserving the layout space for future revenue.

Good places for ads:

- after successful transfer
- on history screen
- before starting a second or third free transfer

Bad places for ads:

- during authentication
- during transfer progress
- over the unmatched report
- before the first successful result

## Example offer design

- Free: 2 playlist transfers per month, ads, manual retry tools included
- Pass: 7 days unlimited transfers, no ads
- Plus: monthly subscription, no ads, unlimited transfers, sync features later

## Main business risks

- support burden from provider auth issues
- low repeat usage from one-time migrations
- API restrictions limiting scale
- user hostility if ads interrupt the core job

## Strategic recommendation

Lead with trust, not with monetization pressure.

The message should be:

- free to try
- clear about what succeeded
- cheap to unlock if the user needs more

That positioning is likely stronger than "tons of ads" as the headline strategy.

## Agent and Partner Monetization

AI assistants can become a distribution channel if PlaylistXfer exposes a safe transfer-intent API and a clear handoff URL.

The monetization should come from attribution and optional offers, not from forcing agents to recite ad copy.

Recommended model:

- Agents can preview or analyze a public Spotify playlist through a safe API.
- PlaylistXfer returns a completion link with `partner_id`, `ref`, and UTM attribution.
- The user reviews matches and authorizes Apple Music inside PlaylistXfer.
- Revenue is attributed when that user completes a transfer, upgrades, clicks an optional affiliate offer, or lands on an ad-supported guide/receipt page.

Good revenue surfaces:

- post-transfer receipt
- SEO guide pages
- optional partner offer cards
- paid API tier for high-volume agent partners
- premium transfer limits for heavy users

Bad revenue surfaces:

- before Apple Music authorization
- between review and create
- hidden agent sponsorships
- any copy that implies an affiliate link is required to transfer

The repo-level strategy lives in [Agent API and Monetization Strategy](agent-api-monetization.md).
