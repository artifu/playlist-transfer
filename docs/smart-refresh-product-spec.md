# Smart Refresh Product Specification

Status: product direction under review; implementation intentionally paused
Last discussed: 2026-07-23
Target: post-1.0 PlaylistXfer release

## Summary

Smart Refresh keeps a completed Spotify-to-Apple-Music transfer useful after the
initial migration. When PlaylistXfer opens, it quietly checks eligible public
Spotify playlists, compares their current contents with the transfer snapshot
stored on the device, and surfaces a clear reviewable diff.

Version 1 is foreground-only:

- no Spotify OAuth
- no background execution
- no push or local notification permission
- no automatic Apple Music writes
- no automatic removal from Apple Music
- no server-side storage of a user's monitored-playlist collection

The defining interaction is:

> Open PlaylistXfer → continue using it immediately → receive a subtle
> "updates available" message when the scan finishes → review and explicitly
> apply additions.

## Product Goals

1. Give PlaylistXfer recurring value without weakening the no-Spotify-login
   positioning.
2. Make completed transfers feel maintainable rather than disposable.
3. Reuse the local transfer history and duplicate-safe update pipeline already
   implemented.
4. Keep startup fast and avoid blocking the primary paste/share flow.
5. Make every Apple Music modification explicit and reversible in intent.
6. Learn whether users value playlist monitoring before investing in iOS
   background refresh, APNs, or server-side monitoring.

## Non-Goals for V1

- exact-time or periodic execution while the app is closed
- private Spotify playlists, Liked Songs, saved albums, or library discovery
- multi-playlist OAuth import
- bidirectional synchronization
- automatic deletion of Apple Music tracks
- automatic reordering of Apple Music playlists
- silently replacing a user's manually corrected match
- system notifications

Spotify OAuth plus batch library import is a separate planned product step.
Background refresh and push notifications are later Smart Refresh phases.

## Eligibility

The app should check only entries that represent a completed playlist transfer.

Eligible:

- source kind is a Spotify playlist
- the public Spotify URL or playlist identifier is still available locally
- a destination Apple Music playlist was successfully created
- the history entry has a usable source-track snapshot
- monitoring is enabled for that transfer

Not eligible:

- individual-song Inbox imports
- previews that were never matched
- failed or abandoned attempts
- transfers whose Apple Music destination was never created
- entries the user deleted from history
- duplicate history entries for the same Spotify playlist

If the same Spotify playlist appears multiple times, the app should monitor one
canonical entry: prefer the newest completed entry with a valid Apple Music
destination.

## Default Monitoring Decision

This remains the main product decision under review.

### Option A: Monitor every history entry

Rejected. It would scan failed attempts, songs, and abandoned links, creating
noise and unnecessary network work.

### Option B: Ask after every transfer

Not recommended. A recurring modal such as "Do you want to monitor this
playlist?" adds friction immediately after a successful action and makes a
simple product feel configurable.

### Option C: Require explicit opt-in

Privacy-conservative, but likely to suppress discovery and make the feature
look less valuable than it is.

### Recommended hybrid

Automatically monitor completed playlist transfers, with transparent controls:

- show one informational message after the user's first completed playlist:
  "We'll check this playlist for updates whenever you open PlaylistXfer."
- do not require a confirmation click
- expose a per-playlist `Watch for updates` toggle
- expose a global `Check completed transfers when app opens` setting
- deleting a history entry stops monitoring it

This is reasonable for V1 because all state remains on the device, checks occur
only while the app is open, and nothing is written to Apple Music without
another explicit action.

## Launch-Time Behavior

The scan must never delay the initial screen.

1. Render the normal import screen immediately.
2. After the app becomes active, start a detached asynchronous refresh
   coordinator.
3. Debounce repeated active events within the same foreground session.
4. Load eligible completed transfers from the local history store.
5. Deduplicate them by Spotify playlist identifier.
6. Skip entries checked recently.
7. Refresh stale entries with bounded concurrency.
8. Persist results as each entry completes.
9. Publish one aggregate UI update after useful changes are available.

Recommended initial policy:

- stale threshold: 12 hours
- maximum concurrent Spotify checks: 2
- maximum eligible entries: the existing 30-entry history cap
- retry individual failures only when the next stale window arrives or the
  user explicitly taps `Try again`

The stale threshold is a product tuning value, not a promise to the user.

## Diff Model

Track identity should use Spotify track ID as the primary key. ISRC may assist
diagnostics but should not replace Spotify identity because two Spotify entries
can legitimately represent different editions.

For each monitored transfer, retain:

- Spotify playlist identifier
- destination Apple Music playlist receipt
- source IDs represented by the last successful Apple Music transfer/update
- latest observed Spotify source IDs
- last successful check date
- last failed check date and safe error category
- pending added source IDs
- pending removed source IDs
- monitoring enabled flag

V1 categories:

- `Added`: present now, absent from the successfully transferred baseline
- `Removed from Spotify`: represented in the baseline, absent now
- `Unchanged`
- `Unavailable`: row exists but Spotify no longer exposes usable metadata

Ordering-only changes are ignored in V1. Reordering Apple Music automatically
would conflict with user edits and requires a separate product decision.

## Update Semantics

The safest V1 behavior is additions-first:

- new Spotify tracks are matched against Apple Music
- the user reviews uncertain or missing matches using the existing review tools
- the user explicitly taps `Update Apple Music playlist`
- duplicate protection runs against the current Apple Music playlist
- only genuinely new approved tracks are appended

Tracks removed from Spotify are informational:

> 2 songs were removed from Spotify. PlaylistXfer left your Apple Music
> playlist unchanged.

V1 must never automatically remove them from Apple Music. The destination may
contain intentional user edits, and removal support is materially riskier than
addition.

## UX Proposal

### Import screen

When no changes exist, show nothing.

When changes exist, place a compact card below the primary input area:

> **Playlist updates available**
> 3 playlists have 12 new songs
> `Review updates`

The card must not cover the input, steal keyboard focus, or interrupt a transfer
already in progress.

### History button

Add a small numeric badge to the existing History control. The number represents
playlists with pending changes, not the number of tracks.

### History screen

Put an `Updates` section above `Recent Transfers`.

Suggested row states:

- `+7 new songs · Review`
- `Up to date · Checked today`
- `Checking…`
- `Couldn't check · Try again`
- `Monitoring off`

Errors remain in History and do not produce global error banners unless every
eligible check fails because the service is broadly unavailable.

### Completed-transfer receipt

After the first completed playlist only:

> **We'll keep an eye on this playlist**
> PlaylistXfer checks for updates when you open the app. Nothing is added
> without your approval.

This is an explanation, not a blocking dialog.

### Per-playlist controls

The history detail or overflow menu should offer:

- `Check for updates`
- `Watch for updates` toggle
- `Open in Apple Music`
- `Delete from history`

### Global control

A lightweight settings area should offer:

- `Check completed transfers when app opens` — default on

Turning it off stops automatic foreground scans but preserves manual
`Check for updates`.

## Notification Strategy

V1 uses in-app notification surfaces only:

- aggregate updates card
- History badge
- Updates section
- optional lightweight in-app banner if the scan finishes after the user has
  navigated away from the import screen

V1 does not request iOS notification permission.

Later phases:

1. `BGAppRefreshTask` for opportunistic checks chosen by iOS.
2. A local notification only when an actual background check finds changes.
3. Optional server-side monitoring plus APNs for more dependable change alerts.

Neither iOS background refresh nor silent push provides exact-time delivery.

## Privacy and Data Boundaries

V1 monitoring remains local:

- public Spotify input and snapshots stay in protected Application Support
- Apple Music playlist contents are read only when the user requests an update
  or duplicate protection needs them
- the list of watched playlists is not uploaded as an account profile
- deleting history deletes its monitoring state

Safe aggregate analytics:

- foreground scan started/completed
- eligible playlist count
- checked/succeeded/failed counts
- changed playlist count
- aggregate added/removed counts
- update review opened
- update applied
- monitoring enabled/disabled
- scan duration and safe failure category

Do not log:

- full Spotify URLs
- playlist names
- Apple Music playlist contents
- track or artist names
- free-form Apple Music search text
- Apple Music user tokens

## Reliability and Performance

- Use the existing public Spotify preview endpoint and its cache.
- Limit concurrent requests to avoid a burst when 30 history entries exist.
- Cancel or deprioritize the scan if the user begins an interactive transfer.
- Never replace current-screen status text with background scan progress.
- Persist each result independently so one bad playlist does not fail the scan.
- Treat offline status as silent deferral, not a user-visible error.
- A Spotify playlist becoming private should produce a calm history state:
  `Can't read this public link right now`.
- A missing/deleted Apple Music destination should be reported only when the
  user attempts to apply an update.

## Instrumentation Questions

The feature should answer:

1. How many active devices have eligible completed playlists?
2. How often does a foreground scan detect real changes?
3. How many users open the update review?
4. How many apply at least one addition?
5. How often does duplicate protection remove all proposed additions?
6. How many users disable monitoring globally or per playlist?
7. Does Smart Refresh increase D7/D28 return usage?

These signals determine whether background refresh and push are worth their
complexity.

## Acceptance Criteria

- App startup remains immediately interactive.
- Only canonical completed playlist transfers are checked.
- Reopening the app repeatedly does not bypass the stale threshold.
- A changed playlist produces an accurate added/removed diff.
- No Apple Music write occurs during scanning.
- Applying additions uses review decisions and duplicate protection.
- Removed Spotify tracks remain in Apple Music.
- Monitoring can be disabled globally and per playlist.
- Deleting history ends monitoring for that playlist.
- Failures remain isolated and retryable.
- Analytics contains aggregates only.

## Rollout Plan

1. Implement behind a local feature flag.
2. Test with unchanged, added, removed, reordered, deleted, and newly private
   public playlists.
3. Measure startup responsiveness with the full 30-entry history cap.
4. Test foreground-session debouncing and offline recovery.
5. Ship to Internal QA.
6. Validate the UX with real changed playlists.
7. Enable for the broader TestFlight group.
8. Decide on background refresh only after foreground usage data is available.

## Open Decisions

The following should be confirmed before implementation:

1. Whether the recommended hybrid default is acceptable:
   completed playlists monitored automatically, with visible opt-out controls.
2. Whether 12 hours is the right initial stale threshold.
3. Whether a user may dismiss a pending change permanently, or only defer it.
4. Whether removed Spotify tracks should eventually support an explicit
   user-confirmed removal flow.

None of these decisions requires Spotify OAuth.
