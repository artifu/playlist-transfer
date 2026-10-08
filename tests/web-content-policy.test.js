import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const publicDir = new URL("../apps/web/public/", import.meta.url);
const adsenseLoader = "pagead2.googlesyndication.com/pagead/js/adsbygoogle.js";

const editorialPages = [
  "how-playlist-matching-works.html",
  "transferring-large-spotify-playlists.html"
];

const adFreePages = [
  "404.html",
  "about.html",
  "contact.html",
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
    assert.match(html, /<script defer src="\/analytics\.js(?:\?[^\"]+)?"><\/script>/, `${fileName} should load analytics`);
  }

  const sitemap = await readFile(new URL("sitemap.xml", publicDir), "utf8");
  const expectedRoutes = [
    "/guides",
    "/how-playlist-matching-works",
    "/transferring-large-spotify-playlists"
  ];

  for (const route of expectedRoutes) {
    assert.match(sitemap, new RegExp(`<loc>https://playlistxfer\\.com${route}</loc>`));
  }
});

test("structured data on content pages is valid JSON", async () => {
  for (const fileName of [...editorialPages, "guides.html", "index.html"]) {
    const html = await readFile(new URL(fileName, publicDir), "utf8");
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];

    assert.ok(blocks.length > 0, `${fileName} should include structured data`);
    for (const [, json] of blocks) {
      assert.doesNotThrow(() => JSON.parse(json), `${fileName} structured data should parse`);
    }
  }
});

test("retired guide routes permanently redirect to consolidated sections", async () => {
  const redirects = await readFile(new URL("_redirects", publicDir), "utf8");
  const sitemap = await readFile(new URL("sitemap.xml", publicDir), "utf8");
  const expectedRedirects = new Map([
    ["/after-spotify-to-apple-music-transfer", "/guides#after-transfer"],
    ["/faq", "/guides#faq"],
    ["/how-it-works", "/guides#how-it-works"],
    ["/public-vs-private-spotify-playlists", "/guides#before-you-start"],
    ["/spotify-playlist-not-loading", "/guides#troubleshooting"],
    ["/spotify-to-apple-music", "/guides#start"],
    ["/spotify-to-apple-music-missing-songs", "/guides#missing-songs"],
    ["/playlist-transfer-test-results", "/guides"],
    ["/spotify-to-apple-music-match-report-example", "/guides"]
  ]);

  for (const [route, destination] of expectedRedirects) {
    assert.match(redirects, new RegExp(`^${route} ${destination.replace("#", "\\#")} 301$`, "m"));
    assert.doesNotMatch(sitemap, new RegExp(`<loc>https://playlistxfer\\.com${route}</loc>`));
  }
});

test("consolidated guide exposes one clear manual and valid anchors", async () => {
  const html = await readFile(new URL("guides.html", publicDir), "utf8");
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(([, id]) => id));
  const fragments = [...html.matchAll(/href="#([^"]+)"/g)].map(([, id]) => id);

  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.equal((html.match(/<details>/g) || []).length, 10);
  assert.match(html, /Move a Spotify playlist to Apple Music/);
  assert.match(html, /"@type": "HowTo"/);
  assert.match(html, /"@type": "FAQPage"/);
  assert.deepEqual(fragments.filter((id) => !ids.has(id)), []);
});

test("Cloudflare Pages has a real noindex 404 instead of a homepage fallback", async () => {
  const html = await readFile(new URL("404.html", publicDir), "utf8");

  assert.match(html, /<meta name="robots" content="noindex,follow"/);
  assert.match(html, /404 · Page not found/);
  assert.doesNotMatch(html, new RegExp(adsenseLoader.replaceAll(".", "\\.")));
});

test("homepage stays focused on starting a transfer", async () => {
  const html = await readFile(new URL("index.html", publicDir), "utf8");

  assert.match(html, /data-publisher-content/);
  assert.match(html, /Share a Spotify playlist or song\. PlaylistXfer finds its Apple Music matches and converts it for you\./);
  assert.match(html, /Preview my playlist/);
  assert.match(html, /Complete transfer guide/);
  assert.doesNotMatch(html, /Production audit/);
  assert.doesNotMatch(html, /46-versus-340/);
  assert.doesNotMatch(html, /Production test results/);
  assert.doesNotMatch(html, /Evidence before access/);
  assert.doesNotMatch(html, /Three stages, with a clear boundary/);
  assert.doesNotMatch(html, /Review mode/);
  assert.doesNotMatch(html, /Faster test/);
  assert.doesNotMatch(html, /Quick test/);
});

test("match report uses customer language and hides backend source diagnostics", async () => {
  const script = await readFile(new URL("app.js", publicDir), "utf8");

  assert.match(script, /We are unsure about/);
  assert.match(script, /We did not find a match for/);
  assert.match(script, /No match found/);
  assert.doesNotMatch(script, /Source: \$\{esc\(data\.playlist\.source\)\}/);
  assert.doesNotMatch(script, /need a quick look/);
  assert.doesNotMatch(script, /Will not transfer/);
  assert.doesNotMatch(script, /Any match/);
  assert.doesNotMatch(script, /free-tier/);
  assert.doesNotMatch(script, /Sending the playlist to the matcher/);
  assert.doesNotMatch(script, /Developer token missing/);
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
