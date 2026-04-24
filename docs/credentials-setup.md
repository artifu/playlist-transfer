# Credentials Setup

This document is the practical setup guide for running the local `Spotify -> Apple Music` spike.

It is intentionally focused on execution, not product strategy.

## Goal

By the end of this setup, the local `.env` file should contain:

- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `SPOTIFY_REFRESH_TOKEN`
- `APPLE_MUSIC_DEVELOPER_TOKEN`
- `APPLE_MUSIC_USER_TOKEN`
- `APPLE_MUSIC_STOREFRONT`
- `APPLE_TEAM_ID`
- `APPLE_KEY_ID`
- `APPLE_MUSIC_PRIVATE_KEY_PATH`
- `SPOTIFY_PLAYLIST_ID`

Once those values are in place, the spike can be run with:

```bash
npm run transfer:dry
```

## Important context

### Spotify

For newly created apps in Spotify `Development Mode`, the app owner must have an active Spotify Premium subscription.

That matters for this repo because we need a valid Spotify developer app in order to perform the OAuth flow and retrieve playlist data through the official Web API.

### Apple Music

Apple Music requires both:

- a `developer token`
- a `music user token`

The developer token identifies the app or developer.
The music user token authorizes access to the Apple Music subscriber's library.

## Step 1: Create the local env file

```bash
cp .env.example .env
```

Open it in your editor of choice:

```bash
open -a TextEdit .env
```

or:

```bash
nano .env
```

## Step 2: Spotify credentials

### What you need

- a Spotify account that can own the developer app
- access to the Spotify Developer Dashboard
- a redirect URI for the OAuth callback

### Values to collect

- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `SPOTIFY_REFRESH_TOKEN`

### Recommended redirect URI

Use this for the local spike:

```text
http://127.0.0.1:8787/callback
```

### Spotify scopes

For the initial read flow, the app should request:

- `playlist-read-private`
- `playlist-read-collaborative`

### Tomorrow checklist for Spotify

1. Log in to the Spotify Developer Dashboard with the Premium account.
2. Create a new app for this project.
3. Save the `Client ID`.
4. Reveal and save the `Client Secret`.
5. Add `http://127.0.0.1:8787/callback` to the app redirect URIs.
6. Run the local auth helper to retrieve the `refresh token`.
7. Paste the values into `.env`.

### Generate the refresh token locally

After `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` are set in `.env`, run:

```bash
npm run spotify:auth
```

Open the printed Spotify authorization URL in your browser. After approval, the helper saves `SPOTIFY_REFRESH_TOKEN` directly into `.env`.

### Notes

- The current repo scaffold already expects a refresh token and uses it to mint access tokens.
- If the Premium account belongs to a different person than the person whose playlist will be tested, confirm that the playlist to transfer is owned by or accessible to the authenticated Spotify user.

## Step 3: Apple Music credentials

### What you need

- access to an Apple Developer account for MusicKit setup
- an Apple Music subscriber account for the user token

### Values to collect

- `APPLE_MUSIC_DEVELOPER_TOKEN`
- `APPLE_MUSIC_USER_TOKEN`
- `APPLE_MUSIC_STOREFRONT`
- `APPLE_TEAM_ID`
- `APPLE_KEY_ID`
- `APPLE_MUSIC_PRIVATE_KEY_PATH`

### Tomorrow checklist for Apple Music

1. Confirm the Apple storefront to use, for example `us`.
2. Create or download the MusicKit `.p8` private key.
3. Add `APPLE_TEAM_ID`, `APPLE_KEY_ID`, and `APPLE_MUSIC_PRIVATE_KEY_PATH` to `.env`.
4. Generate the Apple Music `developer token`.
5. Retrieve the Apple Music `music user token`.
6. Paste all values into `.env`.

### Generate the developer token locally

For the current local setup:

```text
APPLE_TEAM_ID=A2V4NSM2AN
APPLE_KEY_ID=445Z92PQVN
APPLE_MUSIC_PRIVATE_KEY_PATH=./AuthKey_445Z92PQVN.p8
```

Then run:

```bash
npm run apple:developer-token
```

Copy the printed JWT into:

```text
APPLE_MUSIC_DEVELOPER_TOKEN=
```

The `.p8` private key is ignored by git and should never be committed.

### Notes

- For the local Node spike, the hardest part is typically obtaining the `music user token`.
- Once both Apple tokens exist, the rest of the Apple side is straightforward.

### Retrieve the music user token

After `APPLE_MUSIC_DEVELOPER_TOKEN` is set in `.env`, open the helper page:

```bash
npm run apple:user-token
```

Then open the printed local URL in Safari or Chrome.

Then:

1. Confirm the developer token loaded from `.env`.
2. Click `Authorize Apple Music`.
3. Sign in with the Apple Music account.
4. Copy the printed token into `APPLE_MUSIC_USER_TOKEN` in `.env`.

Avoid opening the HTML file directly through `file://`; MusicKit authorization is more reliable from `http://127.0.0.1`.

## Step 4: Playlist input

Add the Spotify playlist ID to `.env`:

```text
SPOTIFY_PLAYLIST_ID=37i9dQZF1E35wsx9iXSyEG
```

The ID is the segment after `/playlist/` in a Spotify playlist URL.

## Step 5: Run the spike

Type-check first:

```bash
npm run check
```

Dry run:

```bash
npm run transfer:dry
```

If the dry run looks good, attempt the real transfer:

```bash
npm run transfer
```

## Expected output

The spike writes these files to `artifacts/` by default:

- `report.json`
- `report.csv`
- `unmatched.json`

## Tomorrow's fastest path

If time is limited, focus on this order:

1. Spotify app setup
2. Spotify refresh token
3. Apple developer token
4. Apple music user token
5. `.env` completion
6. `npm run transfer:dry`

## Decision rule

The spike counts as a success if it can:

- authenticate successfully
- read a real Spotify playlist
- produce meaningful Apple Music matches
- generate a trustworthy unmatched-track report

Playlist creation in Apple Music is important, but it comes after the dry run proves the metadata and matching path.
