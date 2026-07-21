import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const publicRoot = new URL("../apps/web/public/", import.meta.url);

test("landing page keeps one outcome-focused H1 and a preview CTA", async () => {
  const html = await readFile(new URL("index.html", publicRoot), "utf8");

  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.match(html, /Transfer Spotify playlists to Apple Music/);
  assert.match(html, /Preview my playlist/);
  assert.match(html, /data-analytics-cta="homepage_empty_state"/);
});

test("secondary landing inventory is present but ads remain disabled", async () => {
  const html = await readFile(new URL("index.html", publicRoot), "utf8");
  const css = await readFile(new URL("styles.css", publicRoot), "utf8");

  assert.match(html, /No Spotify login required/);
  assert.match(html, /App Store link coming soon/);
  assert.match(html, /data-ad-placement="landing-support"[^>]*hidden/);
  assert.match(css, /\.landing-ad-slot\[hidden\]\s*{\s*display:\s*none;/);
  assert.match(css, /\.fallback-guide\[hidden\]\s*{\s*display:\s*none;/);
});
