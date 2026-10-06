import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";

const BASE_URL = process.env.MONITOR_BASE_URL || "https://playlistxfer.com";
const RESULT_PATH = process.env.MONITOR_RESULT_PATH || "/tmp/playlistxfer-monitor-result.json";
const TEST_PLAYLIST_URL = "https://open.spotify.com/playlist/0h8JNovqXS97ygva27IHfi";
const REQUEST_TIMEOUT_MS = 60_000;

async function request(path, init = {}) {
  return fetch(new URL(path, BASE_URL), {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
}

async function jsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function checkHealth() {
  const response = await request("/health", { headers: { Accept: "application/json" } });
  const body = await jsonResponse(response);
  const primary = body?.dependencies?.spotifyIngestionPrimary;
  const fallback = body?.dependencies?.spotifyIngestionFallback;

  return {
    name: "production_health",
    ok: response.ok && body?.ok === true && body?.status === "healthy",
    status: response.status,
    category: body?.status || "invalid_response",
    detail: body?.status === "degraded"
      ? `primary=${primary?.status ?? "unreachable"}; fallback=${fallback?.status ?? "unreachable"}`
      : body?.status || "health response was invalid"
  };
}

async function checkSpotifyPreview() {
  const response = await request("/api/spotify/public-playlist-preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input: TEST_PLAYLIST_URL })
  });
  const body = await jsonResponse(response);
  const valid = Boolean(body?.playlist && Array.isArray(body?.tracks) && body.tracks.length > 0);

  return {
    name: "spotify_preview",
    ok: response.ok && valid,
    status: response.status,
    category: response.ok ? (valid ? "healthy" : "invalid_response") : "request_failed",
    detail: response.ok && valid ? `${body.tracks.length} tracks returned` : "preview did not return a usable playlist"
  };
}

async function checkAppleCatalog() {
  const response = await request("/api/apple-music/catalog-search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-playlisttransfer-session": randomUUID()
    },
    body: JSON.stringify({ term: "The Beatles", limit: 1 })
  });
  const body = await jsonResponse(response);
  const valid = Array.isArray(body?.results) && body.results.length > 0;

  return {
    name: "apple_catalog",
    ok: response.ok && valid,
    status: response.status,
    category: response.ok ? (valid ? "healthy" : "invalid_response") : "request_failed",
    detail: response.ok && valid ? "catalog returned a result" : "catalog search did not return a result"
  };
}

async function safeCheck(check, name) {
  try {
    return await check();
  } catch (error) {
    return {
      name,
      ok: false,
      status: null,
      category: error?.name === "TimeoutError" ? "timeout" : "unreachable",
      detail: "request could not be completed"
    };
  }
}

const checks = await Promise.all([
  safeCheck(checkHealth, "production_health"),
  safeCheck(checkSpotifyPreview, "spotify_preview"),
  safeCheck(checkAppleCatalog, "apple_catalog")
]);
const result = {
  ok: checks.every((check) => check.ok),
  checkedAt: new Date().toISOString(),
  checks
};

await writeFile(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify(result));
if (!result.ok) process.exitCode = 1;
