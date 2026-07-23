import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const publicDir = new URL("../apps/web/public/", import.meta.url);
const adsenseLoader = "pagead2.googlesyndication.com/pagead/js/adsbygoogle.js";

const editorialPages = [
  "how-it-works.html",
  "how-playlist-matching-works.html",
  "public-vs-private-spotify-playlists.html",
  "spotify-playlist-not-loading.html",
  "spotify-to-apple-music.html",
  "spotify-to-apple-music-missing-songs.html"
];

const adFreePages = [
  "about.html",
  "contact.html",
  "faq.html",
  "guides.html",
  "index.html",
  "privacy.html",
  "terms.html"
];

test("AdSense loader is limited to substantive editorial articles", async () => {
  for (const fileName of editorialPages) {
    const html = await readFile(new URL(fileName, publicDir), "utf8");
    assert.match(html, new RegExp(adsenseLoader.replaceAll(".", "\\.")), `${fileName} should load AdSense`);
  }

  for (const fileName of adFreePages) {
    const html = await readFile(new URL(fileName, publicDir), "utf8");
    assert.doesNotMatch(html, new RegExp(adsenseLoader.replaceAll(".", "\\.")), `${fileName} should remain ad-free`);
  }
});

test("homepage preserves AdSense ownership verification without loading ads", async () => {
  const html = await readFile(new URL("index.html", publicDir), "utf8");

  assert.match(html, /name="google-adsense-account" content="ca-pub-8103940626356369"/);
});

test("all public pages retain analytics bootstrap and the editorial routes are indexed", async () => {
  for (const fileName of [...editorialPages, ...adFreePages]) {
    const html = await readFile(new URL(fileName, publicDir), "utf8");
    assert.match(html, /<script defer src="\/config\.js"><\/script>/, `${fileName} should load public config`);
    assert.match(html, /<script defer src="\/analytics\.js"><\/script>/, `${fileName} should load analytics`);
  }

  const sitemap = await readFile(new URL("sitemap.xml", publicDir), "utf8");
  const expectedRoutes = [
    "/guides",
    "/how-playlist-matching-works",
    "/public-vs-private-spotify-playlists",
    "/spotify-playlist-not-loading",
    "/spotify-to-apple-music",
    "/spotify-to-apple-music-missing-songs"
  ];

  for (const route of expectedRoutes) {
    assert.match(sitemap, new RegExp(`<loc>https://playlistxfer\\.com${route}</loc>`));
  }
});

test("structured data on content pages is valid JSON", async () => {
  for (const fileName of [...editorialPages, "faq.html", "guides.html", "index.html"]) {
    const html = await readFile(new URL(fileName, publicDir), "utf8");
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];

    assert.ok(blocks.length > 0, `${fileName} should include structured data`);
    for (const [, json] of blocks) {
      assert.doesNotThrow(() => JSON.parse(json), `${fileName} structured data should parse`);
    }
  }
});
