import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeSpotifyInput,
  SpotifyInputError,
  spotifyInputCandidate
} from "../apps/web/public/spotify-input.js";

const playlistId = "0h8JNovqXS97ygva27IHfi";
const trackId = "11dFghVXANMlKmJXsNCbNl";

test("web input normalizes playlist and track URLs without tracking parameters", () => {
  assert.deepEqual(
    normalizeSpotifyInput(`https://open.spotify.com/intl-pt/playlist/${playlistId}?si=secret`),
    { value: `https://open.spotify.com/playlist/${playlistId}`, kind: "playlist" }
  );
  assert.deepEqual(
    normalizeSpotifyInput(`https://open.spotify.com/track/${trackId}?utm_source=test`),
    { value: `https://open.spotify.com/track/${trackId}`, kind: "track" }
  );
});

test("web input extracts Spotify links from share text and punctuation", () => {
  const sharedText = `Listen to this playlist: https://open.spotify.com/playlist/${playlistId}?si=test).`;

  assert.equal(
    spotifyInputCandidate(sharedText),
    `https://open.spotify.com/playlist/${playlistId}?si=test`
  );
  assert.deepEqual(normalizeSpotifyInput(sharedText), {
    value: `https://open.spotify.com/playlist/${playlistId}`,
    kind: "playlist"
  });
});

test("web input accepts Spotify URIs, bare playlist IDs, and redirect links", () => {
  assert.deepEqual(normalizeSpotifyInput(`spotify:track:${trackId}`), {
    value: `spotify:track:${trackId}`,
    kind: "track"
  });
  assert.deepEqual(normalizeSpotifyInput(playlistId), {
    value: playlistId,
    kind: "playlist"
  });
  assert.deepEqual(normalizeSpotifyInput("\u200Bhttps://spotify.link/example\uFEFF"), {
    value: "https://spotify.link/example",
    kind: "redirect"
  });
});

test("web input rejects malformed and non-Spotify URLs with safe codes", () => {
  for (const value of ["not a link", `https://example.com/playlist/${playlistId}`]) {
    assert.throws(
      () => normalizeSpotifyInput(value),
      (error) => error instanceof SpotifyInputError && error.code === "unsupported_spotify_input"
    );
  }
});
