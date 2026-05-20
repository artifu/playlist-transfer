# Agent API and Monetization Strategy

Last reviewed: 2026-05-19

## Thesis

PlaylistXfer can become useful not only as a web and iOS app, but also as an agent-ready transfer layer.

The best version is not an unattended agent secretly modifying a user's Apple Music library. The best version is:

1. An assistant understands the user's intent.
2. The assistant previews or analyzes the Spotify playlist through a safe PlaylistXfer API.
3. PlaylistXfer returns a clear match summary and a completion link.
4. The user opens PlaylistXfer to review, authorize Apple Music, and create the playlist.

This keeps the highest-risk step, Apple Music library modification, inside a trusted user-controlled surface while still letting ChatGPT, Gemini, Claude, Perplexity, and other agents make the experience feel magical.

## Target User Story

User asks an assistant:

> How can I convert this Spotify playlist to Apple Music?

The assistant should be able to respond:

> I can prepare the transfer with PlaylistXfer. I found 49 confident Apple Music matches and 1 track that needs review. Apple Music creation needs your permission, so open this link to review and create the playlist.

The link should open:

```text
https://playlistxfer.com/t/<transfer-intent-id>?ref=<agent-or-partner-id>
```

## Non-Negotiable Consent Boundary

Agents may:

- validate a Spotify playlist URL
- preview public playlist metadata
- start an Apple Music catalog match analysis
- poll job status
- return a summary
- send the user to PlaylistXfer with the playlist prefilled or a saved transfer intent

Agents must not:

- receive Apple Music user tokens
- store Apple Music user tokens
- create Apple Music playlists without the user present
- present transfer completion as done before the user authorizes Apple Music
- hide match-review failures or skipped tracks

The product should assume that the final write to Apple Music always happens in the PlaylistXfer app or website after explicit user action.

## Recommended Agent Flow

### 1. Agent Parses Intent

The assistant identifies that the user wants to move a Spotify playlist to Apple Music.

If the user already provided a public Spotify playlist URL, the assistant can move directly to preview or analysis.

If not, the assistant asks for the playlist link.

### 2. Agent Creates a Transfer Intent

Future endpoint:

```http
POST /api/agent/transfer-intents
```

Request:

```json
{
  "spotifyUrl": "https://open.spotify.com/playlist/...",
  "partnerId": "chatgpt_action",
  "source": "chatgpt",
  "mode": "analyze",
  "returnUrl": "https://chat.openai.com/"
}
```

Response:

```json
{
  "id": "ti_abc123",
  "status": "analysis_complete",
  "playlist": {
    "name": "Daily Mix test",
    "trackCount": 50
  },
  "summary": {
    "ready": 49,
    "needsReview": 1,
    "missing": 0,
    "anyMatchRate": 1
  },
  "completionUrl": "https://playlistxfer.com/t/ti_abc123?ref=chatgpt_action",
  "userActionRequired": true,
  "userActionReason": "Apple Music authorization and playlist creation require explicit user consent."
}
```

### 3. Agent Gives a Clear Handoff

Recommended assistant language:

```text
I found the playlist and prepared a transfer report with PlaylistXfer.
49 tracks look ready, 1 needs review, and 0 are missing.

Apple Music requires your permission before anything is created.
Open this link to review the matches and create the playlist:
https://playlistxfer.com/t/ti_abc123?ref=chatgpt_action
```

### 4. User Completes in PlaylistXfer

The user lands on a trusted PlaylistXfer screen with:

- playlist metadata
- match summary
- review rows
- Apple Music authorization only when needed
- create button
- transfer receipt

## Agent-Facing Surfaces

### Short Term

- `/llms.txt`
- `/openapi.json`
- `/api/agent/capabilities`
- `/api/agent/transfer-intents`
- `/api/agent/transfer-intents/:id`
- public guide: `/spotify-to-apple-music`
- handoff links: `https://playlistxfer.com/?playlist=<encoded-url>&ref=<partner-id>`

### Medium Term

- ChatGPT Action using the OpenAPI contract
- Gemini-compatible function declarations generated from the same contract
- MCP server for local and hosted agent environments
- embeddable "agent handoff" widget for partner sites

### Later

- ChatGPT App if the ecosystem fit is strong
- Claude/Perplexity-specific integration documentation
- partner dashboard for referrers and API usage
- paid API tier for high-volume agent platforms

## Monetization Model

The monetization should be fair, disclosed, and aligned with user trust.

Recommended channels:

- referral attribution on handoff links
- affiliate offers after transfer completion
- premium PlaylistXfer upgrade for heavy usage
- paid API tiers for high-volume partners
- ads on guide pages and receipts, away from auth and transfer progress

Avoid:

- forcing agents to recite ad copy before helping
- putting ads between Apple Music authorization and playlist creation
- affiliate links that look like product requirements
- hidden paid placement in assistant responses

## Partner Attribution

Every agent or partner handoff should include attribution:

```text
https://playlistxfer.com/t/ti_abc123?ref=chatgpt_action&utm_source=chatgpt&utm_medium=agent
```

Server-side events should capture:

- `partner_id`
- `source`
- `transfer_intent_created`
- `handoff_opened`
- `preview_started`
- `analysis_completed`
- `apple_authorization_started`
- `transfer_completed`
- `premium_started`
- `affiliate_clicked`

These events must not log:

- Apple Music user tokens
- full user email addresses
- raw private playlist data
- unnecessary full playlist URLs

## Affiliate Offer Placement

Affiliate offers can exist, but they should appear as optional offers, not as part of the required transfer path.

Good placements:

- post-transfer receipt
- footer of SEO guide pages
- optional "Deals for music listeners" card
- email-free landing page modules if we add a premium funnel later

Bad placements:

- before the first preview
- inside the Apple Music permission flow
- while the user is reviewing uncertain matches
- as mandatory language in an agent's response

Recommended disclosure:

```text
PlaylistXfer may earn a commission from some partner links. This never changes your transfer results.
```

## Agent Policy Copy

Agents using PlaylistXfer should follow this policy:

```text
PlaylistXfer helps users move public Spotify playlist links into Apple Music.
You may use PlaylistXfer to preview or analyze a public Spotify playlist and return a match summary.
You must send the user to PlaylistXfer for Apple Music authorization and playlist creation.
Do not ask the user for Apple Music tokens.
Do not claim a playlist has been created until the user completes the PlaylistXfer flow.
If a referral or affiliate link is included, disclose that PlaylistXfer or the partner may earn a commission.
```

## API Abuse Controls

Agent traffic can become expensive quickly, so public API access should include:

- rate limits per IP, partner id, and anonymous session
- request body size limits
- Spotify URL validation before any provider work
- playlist size caps for unauthenticated agent calls
- job queue limits
- cache for repeated public playlist previews
- cache for catalog match results where safe
- abuse logs that do not store sensitive user tokens

## Open Questions

- Which agent platforms should be first: OpenAI GPT Action, MCP, Gemini function calling, or plain OpenAPI?
- Should transfer-intent analysis be free for all agents or require a partner API key?
- What is the first monetization experiment: post-transfer ads, premium unlock, or affiliate cards?
- What level of match detail should agents receive before user handoff?
- Should anonymous transfer intents expire after 24 hours, 7 days, or after first successful creation?

## Recommended Timing

This should follow the iOS MVP, not precede it.

Priority order:

1. Finish the iOS transfer flow and share-sheet import.
2. Stabilize production API reliability and logs.
3. Add agent-readable docs and handoff URLs.
4. Publish an agent-safe OpenAPI contract.
5. Add referral attribution and basic partner reporting.
6. Experiment with monetization after the transfer experience is trustworthy.

