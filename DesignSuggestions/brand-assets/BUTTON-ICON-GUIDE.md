# PlaylistXfer — App Icon & Button Assets

Vectorized final icon package: **two overlapping records** (source disc + destination disc), on an off-white / cream background. This is the approved direction — dark discs floating on a light, elegant background instead of a dark panel.

---

## 1. The mark

Two dark vinyl discs (source, left — destination, right), each with a colored spindle label: sage green on the left (source/Spotify side), dusty pink on the right (destination/Apple Music side). They sit on a warm light background so the dark discs read clearly with no competing dark-on-dark contrast.

| Token | Hex | Use |
|---|---|---|
| Background — **paper** *(primary)* | `#FAF7F0` | Default background for the icon, in every context |
| Background — **cream** *(alt)* | `#EFE6D8` | Optional warmer alternate, e.g. seasonal/marketing variant |
| Disc body | `#2a262f` → `#050507` (radial gradient) | Fixed, do not recolor |
| Source label (left disc) | `#4E8F6C` (sage green) | Fixed |
| Destination label (right disc) | `#E2637F` (dusty pink) | Fixed |
| Monochrome label (both, mono variant) | `#14120F` (ink) | Used only in the `mono` files |

---

## 2. File manifest

```
brand-assets/
├── svg/
│   ├── icon-appicon-square-paper.svg     ← MASTER for all app-icon exports (paper bg)
│   ├── icon-appicon-square-cream.svg     ← same, cream bg alternate
│   ├── icon-preview-rounded.svg          ← rounded-corner version, DOCS/MARKETING ONLY
│   ├── icon-mono.svg                     ← single-color labels, flat/stamp use
│   └── mark-only-transparent.svg         ← discs only, no background, tightly cropped
└── png/
    ├── paper/icon-{size}.png             ← full size ramp, paper bg, square corners
    ├── cream/icon-{size}.png             ← 1024 / 512 / 180, cream bg
    ├── mono/icon-{size}.png              ← 1024 / 512 / 180, monochrome
    └── rounded-preview/icon-{size}.png   ← 1024 / 512 / 180, rounded corners (docs only)
```

Sizes in `png/paper/`: `1024, 512, 192, 180, 167, 152, 120, 87, 80, 76, 60, 40, 32, 29, 20, 16`.

---

## 3. ⚠️ Important — square corners vs. rounded corners

**iOS and Android apply their own corner mask to app icons.** If you hand them a pre-rounded PNG, you'll get double-rounded or misaligned corners.

- **For Xcode's `AppIcon.appiconset`, Android `mipmap`, and the web `apple-touch-icon`: always use the files in `png/paper/` (or `png/cream/`).** These are square, full-bleed, no baked-in corner radius. The OS/browser rounds them automatically.
- **`icon-preview-rounded.svg` / `png/rounded-preview/` are for documentation only** — READMEs, marketing pages, App Store screenshots mockups, anywhere you want to *show* what the rounded icon looks like without an OS doing the masking for you. **Never ship these to an actual icon slot.**

---

## 4. Where each size goes

| Size (px) | Platform slot |
|---|---|
| 1024 | iOS App Store listing icon (Xcode `AppIcon.appiconset`, "App Store" slot) |
| 512 | Android Play Store listing icon / general fallback |
| 192 | Android adaptive icon (legacy), PWA manifest `icon-192` |
| 180 | iOS Home Screen @3x, `apple-touch-icon.png` (web) |
| 167 | iPad Pro Home Screen @2x |
| 152 | iPad Home Screen @2x |
| 120 | iPhone Home Screen @2x, Spotlight @3x |
| 87 | iPhone Settings @3x |
| 80 | Spotlight @2x |
| 76 | iPad Home Screen @1x |
| 60 | iPhone Home Screen @1x (base) |
| 40 | Spotlight @1x / @2x base |
| 32 | Web favicon (standard) |
| 29 | Settings @1x |
| 20 | Notification icon |
| 16 | Web favicon (small / browser tab) |

If your build tool (Expo/Fastlane/Xcode 14+ single-size icon) only wants **one** master, use `png/paper/icon-1024.png` — the tool will generate the rest.

---

## 5. What to use where (quick answers for common asks)

- **"App icon" (home screen)** → `png/paper/icon-1024.png` into the App Store slot; let Xcode/your build tool generate the rest, or use the pre-rendered sizes above.
- **Favicon for a companion website** → `png/paper/icon-32.png` + `icon-16.png`, or just point `<link rel="icon">` at `svg/icon-appicon-square-paper.svg` (modern browsers render SVG favicons directly, and it stays crisp at any size).
- **`apple-touch-icon`** → `png/paper/icon-180.png`. Square corners — Safari rounds it.
- **A button/badge inside the app UI that references the brand** (e.g. "Open in PlaylistXfer" button, share sheet)** → `svg/mark-only-transparent.svg`, scaled to whatever size the button needs. It has no background, so it drops cleanly onto any button color.
- **Single-color contexts** (App Store black-and-white requirement docs, letterhead, watermark) → `svg/icon-mono.svg` or `png/mono/`.
- **Splash screen / loading state** → `svg/mark-only-transparent.svg`, since a splash screen usually already has its own full-bleed background color.

---

## 6. Do not

- Don't recolor the discs themselves (the dark gradient body) — only the background (paper/cream) and the two label dots are brand-color slots.
- Don't add a drop shadow behind the icon when placing it in an `AppIcon.appiconset` — Apple renders its own.
- Don't use `icon-preview-rounded.svg` in any real icon slot (see §3).
- Don't stretch `mark-only-transparent.svg` non-uniformly — it's designed at a fixed aspect ratio (two circles kissing); squashing it will look off.

---

## 7. Regenerating other sizes

All PNGs were rasterized from the two square SVG masters (`icon-appicon-square-paper.svg` / `-cream.svg`). If you need a size not included, re-export directly from the SVG — it's fully vector, no quality loss at any size. Any SVG-to-PNG tool (`sharp`, `resvg`, Figma export, or a browser canvas) will do; the file is self-contained (no external fonts or assets).
