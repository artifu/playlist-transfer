# PlaylistTransfer — Design Guidelines

> Hi-fi mobile design language for an iOS app that transfers Spotify playlists to Apple Music. This doc is the canonical reference for engineers and AI assistants implementing the product.

---

## 1. Product voice

PlaylistTransfer is a **trustworthy crate-digger**, not a SaaS dashboard. The user is handing us their music — that's personal — and we're making a technically complex thing feel simple, safe, and a little bit fun.

Tone: **calm, confident, music-literate.** Numbers are concrete ("47 tracks"), copy is short, never cute for the sake of it.

| ✅ Do | ❌ Don't |
|---|---|
| "We found 87 tracks. Ready to match." | "Awesome! Let's go! 🎉" |
| "2 tracks won't transfer." | "Whoops! Some bumps in the road…" |
| "Nothing's transferred yet." | "All set!" (when nothing has happened) |
| "Live version not on Apple Music — studio version found" | "Match issue. Tap to fix." |

**Show the work.** Always tell the user what we found, what we'll do, and what won't happen.

---

## 2. Visual direction

**Studio Light is the production direction.** Near-white background, pure white cards, cool grays — Apple-Music-leaning so it feels native to that audience — but the italic Fraunces display serif (in playlist names, hero numerals, screen titles) keeps the "music culture" warmth so it never reads as a generic SaaS dashboard.

**Late Night is reserved as a dark-mode alternate** for a future release. Token set is preserved in `tokens.jsx → THEMES.night` so it can be wired in later without restructuring.

| Theme | Status | Use it for |
|---|---|---|
| **Studio Light** | **Primary — ship this** | Default app experience |
| **Late Night** | Reserved | Future dark-mode toggle, late-night listeners |

Both share **structural** semantics — only background, ink, and lines change. Accent palette (green source, red dest) is identical so the product reads the same in either mode.

---

## 3. Color tokens

Tokens are semantic, not literal. Use the semantic name everywhere; theme switches the resolution.

```
bg          page background
bgElev      raised cards, list backgrounds
bgInset     pressed-in surfaces (input fields, dividers, captions)

ink         primary text, primary buttons
inkSoft     body text
inkMuted    labels, metadata, captions

line        hairline borders
lineStrong  prominent borders, dashed dividers

source      Spotify-coded green — source indicator, "ready" status
sourceSoft  green tinted background

dest        Apple-coded red/pink — destination, primary action on transfer
destSoft    red tinted background

accent      brand red — used in gradients, hero hits
warn        review status (mustard / ochre)
danger      missing status (deep red)
```

### Theme — Studio Light (primary)
| Token | Value |
|---|---|
| `bg` | `#FBFBFD` |
| `bgElev` | `#FFFFFF` |
| `bgInset` | `#F2F2F5` |
| `ink` | `#0B0B0D` |
| `inkSoft` | `#3A3A3D` |
| `inkMuted` | `#86868B` |
| `line` | `rgba(11,11,13,0.08)` |
| `lineStrong` | `rgba(11,11,13,0.14)` |
| `source` | `#1DB954` |
| `dest` | `#FA243C` |
| `accent` | `#FA243C` |
| `warn` | `#B86A1F` |
| `danger` | `#D43A2F` |

### Theme — Late Night (reserved alternate)
| Token | Value |
|---|---|
| `bg` | `#0A090C` |
| `bgElev` | `#141318` |
| `bgInset` | `#1C1A21` |
| `ink` | `#F5F2EC` |
| `inkSoft` | `#B8B2A6` |
| `inkMuted` | `#6F6A5E` |
| `source` | `#3DDC84` |
| `dest` | `#FF4E6A` |
| `accent` | `#E8B84A` |
| `warn` | `#E8B84A` |
| `danger` | `#FF6B5C` |

### Color rules
- **Source = green = Spotify side.** Ready status, "from" indicators, success counts.
- **Dest = red = Apple side.** Primary destination CTA on transfer screens, "to" indicators.
- Never put green and red text adjacent — they're for tags and accents, not body.
- Don't use raw Spotify or Apple brand colors anywhere outside source/dest semantic.

---

## 4. Typography

Two type families: a **display serif** (italic by default) and a **body sans**. Mono for labels and metadata.

### Type ramp (px)
| Style | Size | Line | Weight | Use |
|---|---|---|---|---|
| `display` | 36–76 | 1.05 | Display 500, italic | Hero numbers, screen titles, playlist names |
| `title` | 28 | 1.15 | Display | Card titles |
| `h1` | 22 | 1.25 | 700 sans | Section heads in dense screens |
| `h2` | 17 | 1.30 | 600 sans | Card sub-titles |
| `body` | 15 | 1.40 | 400 sans | Body copy |
| `small` | 13 | 1.35 | 500 sans | Secondary metadata |
| `micro` | 11 | 1.30 | 600 mono, UPPER, tracking 0.04 | Eyebrows, labels |
| `mono` | 13 | 1.30 | 500 mono | URLs, technical strings |

### Rules
- **Display type is italic by default** — gives the warm/editorial feel. This is the brand's signature.
- **Mono only for labels** ("STEP 2 OF 3", "PUBLIC SPOTIFY PLAYLIST"). Never body copy.
- Playlist names always in display italic — like a record label.
- Numerics in stat tiles use display type at large size (signature look).

---

## 5. Spacing & geometry

| Token | px |
|---|---|
| `xs` | 4 |
| `sm` | 8 |
| `md` | 12 |
| `lg` | 16 |
| `xl` | 24 |
| `xxl` | 32 |
| `huge` | 48 |

### Radii
- Cards: `16px`
- Big cards: `22px`
- Buttons: `999px` (full pill)
- Album art: `4px` for 32–56px, `6px` for ≥80px

### Shadow
Soft, layered: `0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(11,11,13,0.06)` for cards. Big surfaces use a longer drop. Studio Light avoids harsh edges — it's airy, not clinical.

---

## 6. Components

### Album-art placeholder (`Sleeve`)
- Linear gradient from a deterministic 3-color palette indexed off a seed
- Vinyl peeks out the right edge — signature element keeping the music metaphor present even with no real art
- Sizes: 32, 38, 42, 44, 52, 56, 80, 104, 160, 180

### Big sleeve (`BigSleeve`)
- Used on Preview and Success — 104–240px
- Gradient + concentric "sun arc" overlays for that mixtape-cover feel

### Service mark (`ServiceMark`)
- Small 13–18px disc indicating Spotify (green circle, soundwave glyph) or Apple (red rounded square, note glyph)
- Used inline next to playlist names, in CTAs, in source→dest transitions
- **Original mark, not a brand logo** — never copy real Spotify/Apple lockups

### Status pill (`StatusPill`)
- Three states: `ready` / `review` / `missing`
- Mono text, UPPER, tinted background, small dot indicator

### Track row (`TrackRow`)
- Sleeve + title + artist · album + status pill
- Tap-to-expand reveals the Apple Music candidate (or "no match" reason) with Approve / See alternatives buttons
- Compact mode: 38px sleeve, 10px vertical padding

### Stat tile (`StatTile`)
- Mono UPPER label + giant display numeral + optional sub-label
- Used in 3-up groupings on Match Report
- Numeric uses semantic color (source/warn/danger)

### Buttons
- Full-width pill, 54px tall
- Variants: `primary` (ink), `source` (green), `dest` (red), `ghost`, `soft`
- Always paired with a leading icon for primary actions

### Progress
- 8px pill bar with hairline border
- Label above with mono percentage on the right
- Use `dest` color during transfer (we're moving toward Apple Music)

---

## 7. Screen anatomy

12 screens across 3 groups:

### Core flow
| # | Screen | Job | Primary CTA |
|---|---|---|---|
| 0 | Onboarding | Connect Apple Music | "Connect Apple Music" (dest) |
| 1 | Paste link | Capture URL, build trust | "Transfer to Apple Music" (ink) |
| 2 | Preview | Confirm we read the playlist | "Analyze Matches" (ink) |
| 3 | Match Report | **Make outcome legible** | "Create Apple Music Playlist" (dest) |
| 4 | Transferring | Make a wait feel productive | (ghost: "Run in background") |
| 5 | Success | Celebrate + hand off | "Open in Apple Music" (dest) |

### Supporting
| # | Screen | Notes |
|---|---|---|
| 6 | Alternatives sheet | Bottom sheet over Match Report. Shows original Spotify track + 4 Apple candidates with confidence %, radio-pick the right match. |
| 7 | History | List of past transfers with success/fail counts, tap to inspect. Sticky "New transfer" CTA at bottom. |
| 8 | Settings | Account card (gradient hero), Transfer behavior, Appearance, About, Account (with destructive disconnect action). |

### Error states
| Kind | Trigger | Recovery |
|---|---|---|
| Invalid link | Pasted URL isn't a Spotify playlist | Show what they pasted struck through; "Try a different link" |
| Private playlist | Playlist exists but isn't public | Explain we need public access; link to the help steps |
| Network | Couldn't reach Spotify | Retry button; reassures nothing was transferred |

### Match Report — the make-or-break screen
This is where users decide to trust us. Required elements, in order:

1. **Hero %** — display numeral, the headline number
2. **Plain-language summary** — "We matched 41 of 47 tracks confidently. 4 need a quick look. 2 won't transfer."
3. **3 stat tiles** — Ready / Review / Missing (semantic colors)
4. **Filter chips** — All / Needs review / Missing / Ready
5. **Grouped lists, in this order:** Needs Review (top), Won't Transfer, Ready (collapsed)
6. **Sticky CTA footer** with the actual transfer count: "Tapping Create will transfer N tracks to Apple Music."

Never auto-collapse Review or Missing. Those are the trust-critical rows.

---

## 8. Microcopy patterns

### Trust statements
End every committal step with a calm reassurance:
- Paste screen: *"Move public Spotify playlists into Apple Music — tracks, order, all of it."*
- Preview: *"Nothing's transferred yet. We'll show you matches first."*
- Match Report footer: *"Tapping Create will transfer 45 tracks to Apple Music."*
- Network error: *"Nothing was transferred."*

### Status reasons
Always explain *why* a track is in review or missing:
- ✅ "Live version not on Apple Music — studio version found"
- ✅ "Demo version unavailable — found album cut"
- ✅ "No confident match — track is a bootleg not in Apple Music catalog"
- ❌ "Match issue"
- ❌ "Error"

### Numbers
Always concrete: "47 tracks", "3 hr 12 min", "1:42 elapsed". Never "many", "a few", "some".

---

## 9. Motion

Light hand. Approved motions:

1. **Track row expand** — height auto, 200ms ease-out
2. **Progress bar fill** — 400ms ease-out as `value` updates
3. **Album art shuffle (transfer screen)** — stack of sleeves rotates and translates, ~600ms per swap, infinite during transfer
4. **Bottom sheet** — slide up from below with backdrop fade, 280ms ease-out

Avoid: bouncy springs, parallax on scroll, full-screen transitions. The aesthetic is editorial print, not gamified app.

---

## 10. iOS specifics

- iPhone 14/15 Pro frame: `402 × 874`
- Top safe area: `60–70px` padding-top in screen content
- Bottom safe area: `32px` padding-bottom on CTAs
- Status bar tint: dark in Studio Light, light in Late Night
- No tab bar in v1 — single linear flow with Settings/History accessible from the home screen

---

## 11. Files

| File | Role |
|---|---|
| `PlaylistTransfer Designs.html` | Main canvas — open in browser to view all screens |
| `tokens.jsx` | Theme tokens (Studio Light + Late Night), spacing, type ramp, mock data |
| `components.jsx` | Reusable primitives: Sleeve, ServiceMark, Card, Button, TrackRow, StatTile, Vinyl, Progress |
| `screens.jsx` | Core flow (Onboarding, Paste, Preview, Match, Progress, Success) |
| `screens-extra.jsx` | Supporting (Alternatives, History, Settings) + Error states |
| `app.jsx` | Design canvas + Tweaks panel wiring |
| `ios-frame.jsx` | iOS device frame (status bar, home indicator) |
| `design-canvas.jsx` | Pan/zoom canvas |
| `tweaks-panel.jsx` | Live theme/font/density toggles |

To work from these designs in production: read `tokens.jsx` and `components.jsx` first — they're the single source of truth for the visual language. Screens are reference implementations, not production code.

---

## 12. What's still open

Flag for next round:

- Reverse direction (Apple Music → Spotify)
- Multi-playlist queue / batch transfer
- Free tier / paywall surfaces, if applicable
- Empty state for History (first-run)
- Late Night theme refinements + dark-mode toggle wiring
