import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const publicDir = new URL("../apps/web/public/", import.meta.url);
const adsenseLoader = "pagead2.googlesyndication.com/pagead/js/adsbygoogle.js";

const editorialPages = [
  "after-spotify-to-apple-music-transfer.html",
  "how-it-works.html",
  "how-playlist-matching-works.html",
  "public-vs-private-spotify-playlists.html",
  "spotify-playlist-not-loading.html",
  "spotify-to-apple-music.html",
  "spotify-to-apple-music-match-report-example.html",
  "spotify-to-apple-music-missing-songs.html",
  "transferring-large-spotify-playlists.html"
];

const adFreePages = [
  "404.html",
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
  assert.match(html, /name="google-site-verification" content="3F7Qim3-rpeOtRkXc-76GNCaAr4Hf_jLziTY2hmdTno"/);
});

test("support page provides a direct first-party request form", async () => {
  const html = await readFile(new URL("contact.html", publicDir), "utf8");

  assert.match(html, /<h1>PlaylistXfer Support<\/h1>/);
  assert.match(html, /id="support-form"/);
  assert.match(html, /name="replyEmail"/);
  assert.match(html, /Send support request/);
  assert.match(html, /Include an email if you want a direct reply/);
  assert.match(html, /mailto:support@playlistxfer\.com/);
});

test("all public pages retain analytics bootstrap and editorial routes are listed in the sitemap", async () => {
  for (const fileName of [...editorialPages, ...adFreePages]) {
    const html = await readFile(new URL(fileName, publicDir), "utf8");
    assert.match(html, /<script defer src="\/config\.js"><\/script>/, `${fileName} should load public config`);
    assert.match(html, /<script defer src="\/analytics\.js"><\/script>/, `${fileName} should load analytics`);
  }

  const sitemap = await readFile(new URL("sitemap.xml", publicDir), "utf8");
  const expectedRoutes = [
    "/after-spotify-to-apple-music-transfer",
    "/guides",
    "/how-playlist-matching-works",
    "/public-vs-private-spotify-playlists",
    "/spotify-playlist-not-loading",
    "/spotify-to-apple-music",
    "/spotify-to-apple-music-match-report-example",
    "/spotify-to-apple-music-missing-songs",
    "/transferring-large-spotify-playlists"
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

test("Cloudflare Pages has a real noindex 404 instead of a homepage fallback", async () => {
  const html = await readFile(new URL("404.html", publicDir), "utf8");

  assert.match(html, /<meta name="robots" content="noindex,follow"/);
  assert.match(html, /404 · Page not found/);
  assert.doesNotMatch(html, new RegExp(adsenseLoader.replaceAll(".", "\\.")));
});

test("homepage contains substantive visible publisher content", async () => {
  const html = await readFile(new URL("index.html", publicDir), "utf8");
  const publisherContent = html.match(/<section class="homepage-content"[\s\S]*?<\/section>\s*<\/section>/)?.[0] ?? "";
  const words = publisherContent
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  assert.match(html, /data-publisher-content/);
  assert.match(html, /46-versus-340 discrepancy exposed an incomplete playlist preview/);
  assert.ok(words.length >= 400, `homepage publisher content should be substantive, found ${words.length} words`);
});

test("editorial articles are substantive and use unique canonical URLs", async () => {
  const canonicals = new Set();

  for (const fileName of editorialPages) {
    const html = await readFile(new URL(fileName, publicDir), "utf8");
    const article = html.match(/<article[\s\S]*?<\/article>/)?.[0] ?? "";
    const words = article
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z#0-9]+;/gi, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];

    assert.ok(words.length >= 500, `${fileName} should contain at least 500 words, found ${words.length}`);
    assert.ok(canonical, `${fileName} should include a canonical URL`);
    assert.ok(!canonicals.has(canonical), `${fileName} should not duplicate canonical ${canonical}`);
    canonicals.add(canonical);
  }
});
