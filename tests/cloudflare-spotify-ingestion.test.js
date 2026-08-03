import assert from "node:assert/strict";
import test from "node:test";

import { getSpotifyPlaylistForEnvironment } from "../functions/_lib/spotify-ingestion.js";

const playlistUrl = "https://open.spotify.com/playlist/315j5OaNjSO3C5AifquhBc";

test("Cloudflare ingests a public playlist through one backend request", async () => {
  const tracks = Array.from({ length: 340 }, (_, index) => ({
    spotifyTrackId: String(index).padStart(22, "0"),
    isrc: `TEST${String(index).padStart(8, "0")}`,
    name: `Track ${index + 1}`,
    artists: ["Test artist"]
  }));
  let calls = 0;

  const result = await getSpotifyPlaylistForEnvironment(
    { TRANSFER_API_URL: "https://transfer.example.com" },
    playlistUrl,
    async (input, init) => {
      calls += 1;
      assert.equal(String(input), "https://transfer.example.com/api/spotify/public-playlist-preview");
      assert.equal(init.method, "POST");
      assert.deepEqual(JSON.parse(init.body), { input: playlistUrl });

      return new Response(JSON.stringify({
        playlist: {
          id: "315j5OaNjSO3C5AifquhBc",
          name: "Full test playlist",
          totalItems: 340,
          source: "spotify-public-spclient",
          limitations: []
        },
        tracks
      }), { status: 200 });
    }
  );

  assert.equal(calls, 1);
  assert.equal(result.totalItems, 340);
  assert.equal(result.tracks.length, 340);
});

test("Cloudflare rejects an incomplete backend playlist instead of silently truncating it", async () => {
  await assert.rejects(
    getSpotifyPlaylistForEnvironment(
      { TRANSFER_API_URL: "https://transfer.example.com" },
      playlistUrl,
      async () => new Response(JSON.stringify({
        playlist: { id: "315j5OaNjSO3C5AifquhBc", name: "Broken" },
        tracks: []
      }), { status: 200 })
    ),
    /incomplete playlist/
  );
});
