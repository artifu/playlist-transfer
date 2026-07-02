import test from "node:test";
import assert from "node:assert/strict";

import { analyzeTrack, analyzeTracksOptimized } from "../functions/_lib/transfer.js";

function spotifyTrack(overrides = {}) {
  return {
    spotifyTrackId: "spotify-id",
    isrc: null,
    name: "Test Song",
    artists: ["Test Artist"],
    album: "Test Album",
    durationMs: 180_000,
    ...overrides
  };
}

function appleCandidate(overrides = {}) {
  return {
    id: "apple-id",
    name: "Test Song",
    artistName: "Test Artist",
    albumName: "Test Album",
    durationMs: 180_000,
    isrc: null,
    ...overrides
  };
}

test("batch ISRC matches avoid text search and preserve source order", async () => {
  const calls = { batch: 0, search: 0 };
  const apple = {
    async songsByISRCs(isrcs) {
      calls.batch += 1;
      assert.deepEqual(isrcs, ["AAA111", "BBB222"]);
      return [
        appleCandidate({ id: "apple-b", name: "Second", isrc: "BBB222" }),
        appleCandidate({ id: "apple-a", name: "First", isrc: "aaa111" })
      ];
    },
    async searchSongs() {
      calls.search += 1;
      return [];
    }
  };

  const results = await analyzeTracksOptimized(
    [
      spotifyTrack({ name: "First", isrc: "AAA111" }),
      spotifyTrack({ name: "Second", isrc: "BBB222" })
    ],
    apple
  );

  assert.equal(calls.batch, 1);
  assert.equal(calls.search, 0);
  assert.deepEqual(results.map((result) => result.candidate.id), ["apple-a", "apple-b"]);
  assert.ok(results.every((result) => result.reason === "isrc"));
});

test("exact title and artist stops textual fallback after its first query", async () => {
  let searchCalls = 0;
  const apple = {
    async searchSongs() {
      searchCalls += 1;
      return [appleCandidate()];
    }
  };

  const result = await analyzeTrack(spotifyTrack(), apple);

  assert.equal(searchCalls, 1);
  assert.equal(result.reason, "exact-title-artist");
  assert.equal(result.confidence, 0.96);
});

test("multiple Apple editions with one ISRC prefer the closest Spotify album", async () => {
  const apple = {
    async songsByISRCs() {
      return [
        appleCandidate({ id: "compilation", isrc: "AAA111", albumName: "Summer Hits 2026" }),
        appleCandidate({ id: "single", isrc: "AAA111", albumName: "Test Album - Single" })
      ];
    },
    async searchSongs() {
      throw new Error("Text fallback should not run for an ISRC match.");
    }
  };

  const [result] = await analyzeTracksOptimized(
    [spotifyTrack({ isrc: "AAA111", album: "Test Album" })],
    apple
  );

  assert.equal(result.candidate.id, "single");
  assert.equal(result.reason, "isrc");
});
