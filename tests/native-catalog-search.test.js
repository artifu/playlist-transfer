import assert from "node:assert/strict";
import test from "node:test";

import { handleNativeApiRequest } from "../functions/_lib/native-api.js";

test("native catalog search returns safe Apple Music candidates", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "api.music.apple.com");
    assert.equal(url.searchParams.get("term"), "Heroes David Bowie");
    assert.equal(url.searchParams.get("types"), "songs");
    assert.equal(url.searchParams.get("limit"), "10");

    return new Response(JSON.stringify({
      results: {
        songs: {
          data: [{
            id: "apple-heroes",
            attributes: {
              name: "Heroes",
              artistName: "David Bowie",
              albumName: "Heroes",
              durationInMillis: 367000,
              isrc: "GBAYE7700087",
              url: "https://music.apple.com/us/song/apple-heroes",
              artwork: {
                url: "https://example.com/{w}x{h}.jpg"
              }
            }
          }]
        }
      }
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  const request = new Request("https://playlistxfer.com/api/apple-music/catalog-search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-playlisttransfer-session": "ios-1234567890abcdef"
    },
    body: JSON.stringify({
      term: "Heroes David Bowie",
      limit: 10
    })
  });

  const response = await handleNativeApiRequest({
    request,
    env: {
      APPLE_MUSIC_DEVELOPER_TOKEN: "developer-token",
      APPLE_MUSIC_STOREFRONT: "us"
    }
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(payload.results, [{
    id: "apple-heroes",
    name: "Heroes",
    artistName: "David Bowie",
    albumName: "Heroes",
    durationMs: 367000,
    isrc: "GBAYE7700087",
    url: "https://music.apple.com/us/song/apple-heroes",
    artworkUrl: "https://example.com/300x300.jpg"
  }]);
});

test("native catalog search requires an anonymous session", async () => {
  const response = await handleNativeApiRequest({
    request: new Request("https://playlistxfer.com/api/apple-music/catalog-search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ term: "Heroes David Bowie" })
    }),
    env: {
      APPLE_MUSIC_DEVELOPER_TOKEN: "developer-token"
    }
  });

  assert.equal(response.status, 400);
});
