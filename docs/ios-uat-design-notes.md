# iOS UAT Design Notes

Last reviewed: 2026-06-08

These notes capture mobile UAT feedback that should shape the next designer pass. The current app is functional, but the match and post-match screens still feel too technical in places.

## Share Sheet

- iOS controls app ordering in the Share Sheet. PlaylistXfer can be eligible and reliable, but it cannot force itself into the suggested app row.
- Users can pin PlaylistXfer manually through `More` / `Edit`, which should be documented later if share import becomes a core acquisition path.
- Product goal: sharing a Spotify playlist into PlaylistXfer should feel like a one-step import, not a debugging path.

## Match Progress

- The progress card should feel stable during long matches.
- Avoid switching between unrelated messages such as "warming" and item counts in a way that feels like the app is changing state.
- Use one clear title, one clear progress indicator, and one concise reassurance for longer playlists.

Suggested direction:

```text
Matching with Apple Music
40 of 46 tracks checked.
Large playlists can take a minute. Keep PlaylistXfer open.
```

## Match Report

- Do not expose technical match reasons such as `isrc` in the consumer UI.
- The user cares whether a track is ready, needs review, or will be left out.
- If match source needs to be shown, use plain language such as "Strong catalog match" or hide it behind a developer/debug view.

## Review Actions

- `Wrong match` looked like a status instead of an action.
- The action should read as a question or correction.

Current quick fix:

```text
Wrong match?
```

Designer pass should explore clearer alternatives:

```text
This is wrong
Choose another match
Leave this out
Not this version
```

## Post-Transfer Screen

- The post-transfer state should feel like a receipt, not a debug report.
- Primary action should be the most reliable next step.
- If Apple Music deep-linking to private library playlists is unreliable, the UI should explain that calmly without long defensive copy.

Suggested hierarchy:

1. Transfer complete.
2. Playlist name.
3. Tracks moved / tracks skipped.
4. Primary action: open Apple Music.
5. Secondary action: copy playlist name.
6. Tertiary action: transfer another playlist.

## Destination Name and Cover

- Users should be able to rename the destination Apple Music playlist before creation.
- Default naming should be clean and predictable: `Original playlist name (PlaylistXfer)`.
- Avoid legacy or awkward suffixes such as `(Transferred from Spotify)`.
- The current native MusicKit creation flow sets playlist name, description, author, and items. It does not expose a custom artwork parameter in the create call used by the app.
- Designer pass should still explore a better perceived cover experience: a nicer in-app transfer receipt, clearer preview artwork, and a future optional custom-cover flow if we later add an API path that supports artwork updates.

## Design Prompt Seed

Use this prompt when asking for the next design pass:

```text
Design a polished iOS match-review and transfer-receipt experience for PlaylistXfer.

Context:
- PlaylistXfer imports public Spotify playlist links into Apple Music.
- Users preview first, match tracks against Apple Music, review uncertain matches, then create the Apple Music playlist.
- The app should feel trustworthy, lightweight, and music-native.

Focus areas:
- A calmer progress state for long Apple Music catalog matching.
- A match report that hides technical metadata like ISRC.
- Clear review actions for "wrong match", "choose another match", and "leave this track out".
- A post-transfer receipt that feels celebratory but still explains skipped tracks.
- An optional destination-name editor before Apple Music creation.
- A visual direction for playlist cover handling, including how to explain Apple Music-generated library artwork.
- Mobile-first layout for one-handed use on iPhone.

Avoid:
- Debug-looking labels.
- Dense tables.
- Overexplaining API limitations.
- Ads or sponsor modules in the critical transfer flow.
```
