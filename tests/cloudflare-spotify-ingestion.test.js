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

test("Cloudflare normalizes a Spotify URL embedded in shared text before proxying", async () => {
  let proxiedInput;
  await getSpotifyPlaylistForEnvironment(
    { TRANSFER_API_URL: "https://transfer.example.com" },
    `Try this one:\nhttps://open.spotify.com/playlist/315j5OaNjSO3C5AifquhBc?si=shared).`,
    async (_input, init) => {
      proxiedInput = JSON.parse(init.body).input;
      return new Response(JSON.stringify({
        playlist: {
          id: "315j5OaNjSO3C5AifquhBc",
          name: "Shared playlist",
          totalItems: 1,
          source: "spotify-public-spclient",
          limitations: []
        },
        tracks: [{ spotifyTrackId: "0000000000000000000000", name: "Track", artists: ["Artist"] }]
      }), { status: 200 });
    }
  );

  assert.equal(
    proxiedInput,
    "https://open.spotify.com/playlist/315j5OaNjSO3C5AifquhBc?si=shared"
  );
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

test("Cloudflare retries one transient upstream timeout", async () => {
  let calls = 0;
  const result = await getSpotifyPlaylistForEnvironment(
    { TRANSFER_API_URL: "https://transfer.example.com" },
    playlistUrl,
    async () => {
      calls += 1;
      if (calls === 1) throw new DOMException("Timed out", "TimeoutError");
      return new Response(JSON.stringify({
        playlist: {
          id: "315j5OaNjSO3C5AifquhBc",
          name: "Recovered playlist",
          totalItems: 1,
          source: "spotify-public-spclient",
          limitations: []
        },
        tracks: [{
          spotifyTrackId: "0000000000000000000000",
          name: "Recovered track",
          artists: ["Test artist"]
        }]
      }), { status: 200 });
    }
  );

  assert.equal(calls, 2);
  assert.equal(result.tracks.length, 1);
});

test("Cloudflare falls back to Render after the primary origin stays unavailable", async () => {
  const calls = [];
  const result = await getSpotifyPlaylistForEnvironment(
    {
      TRANSFER_API_URL: "https://oracle.example.com",
      TRANSFER_API_FALLBACK_URL: "https://render.example.com"
    },
    playlistUrl,
    async (input) => {
      calls.push(String(input));
      if (String(input).startsWith("https://oracle.example.com")) {
        return new Response("temporarily unavailable", { status: 503 });
      }

      return new Response(JSON.stringify({
        playlist: {
          id: "315j5OaNjSO3C5AifquhBc",
          name: "Fallback playlist",
          totalItems: 1,
          source: "spotify-public-spclient",
          limitations: []
        },
        tracks: [{
          spotifyTrackId: "0000000000000000000000",
          name: "Fallback track",
          artists: ["Test artist"]
        }]
      }), { status: 200 });
    }
  );

  assert.deepEqual(calls, [
    "https://oracle.example.com/api/spotify/public-playlist-preview",
    "https://render.example.com/api/spotify/public-playlist-preview"
  ]);
  assert.equal(result.tracks[0].name, "Fallback track");
});

test("Cloudflare falls back to Render when the primary Cloudflare Tunnel is unavailable", async () => {
  const calls = [];
  const result = await getSpotifyPlaylistForEnvironment(
    {
      TRANSFER_API_URL: "https://oracle.example.com",
      TRANSFER_API_FALLBACK_URL: "https://render.example.com"
    },
    playlistUrl,
    async (input) => {
      calls.push(String(input));
      if (String(input).startsWith("https://oracle.example.com")) {
        return new Response("error code: 1033", { status: 530 });
      }

      return new Response(JSON.stringify({
        playlist: {
          id: "315j5OaNjSO3C5AifquhBc",
          name: "Tunnel fallback playlist",
          totalItems: 1,
          source: "spotify-public-spclient",
          limitations: []
        },
        tracks: [{
          spotifyTrackId: "0000000000000000000000",
          name: "Recovered through fallback",
          artists: ["Test artist"]
        }]
      }), { status: 200 });
    }
  );

  assert.deepEqual(calls, [
    "https://oracle.example.com/api/spotify/public-playlist-preview",
    "https://render.example.com/api/spotify/public-playlist-preview"
  ]);
  assert.equal(result.tracks[0].name, "Recovered through fallback");
});

test("Cloudflare does not hide a non-retryable primary response with fallback", async () => {
  let calls = 0;

  await assert.rejects(
    getSpotifyPlaylistForEnvironment(
      {
        TRANSFER_API_URL: "https://oracle.example.com",
        TRANSFER_API_FALLBACK_URL: "https://render.example.com"
      },
      playlistUrl,
      async () => {
        calls += 1;
        return new Response(JSON.stringify({ message: "invalid input" }), { status: 400 });
      }
    ),
    /HTTP 400/
  );

  assert.equal(calls, 1);
});
