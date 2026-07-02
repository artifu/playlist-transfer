import test from "node:test";
import assert from "node:assert/strict";

import {
  parseSpotifyInput,
  parseSpotifyPlaylistInput,
  parseSpotifyTrackInput
} from "../functions/_lib/spotify-url.js";

test("parses playlist and track URLs through one input parser", () => {
  assert.deepEqual(
    parseSpotifyInput("https://open.spotify.com/playlist/0h8JNovqXS97ygva27IHfi?si=test"),
    { kind: "playlist", id: "0h8JNovqXS97ygva27IHfi" }
  );
  assert.deepEqual(
    parseSpotifyInput("https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl?si=test"),
    { kind: "track", id: "11dFghVXANMlKmJXsNCbNl" }
  );
});

test("parses Spotify URIs and keeps bare IDs backward compatible", () => {
  assert.deepEqual(parseSpotifyInput("spotify:track:11dFghVXANMlKmJXsNCbNl"), {
    kind: "track",
    id: "11dFghVXANMlKmJXsNCbNl"
  });
  assert.equal(parseSpotifyPlaylistInput("0h8JNovqXS97ygva27IHfi"), "0h8JNovqXS97ygva27IHfi");
  assert.equal(parseSpotifyTrackInput("11dFghVXANMlKmJXsNCbNl"), "11dFghVXANMlKmJXsNCbNl");
});

test("specific parsers reject the other Spotify resource type", () => {
  assert.throws(
    () => parseSpotifyPlaylistInput("https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl"),
    /track, not a playlist/
  );
  assert.throws(
    () => parseSpotifyTrackInput("https://open.spotify.com/playlist/0h8JNovqXS97ygva27IHfi"),
    /playlist, not a track/
  );
});
