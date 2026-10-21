import assert from "node:assert/strict";
import test from "node:test";

import { buildHealthResponse } from "../functions/health.js";

function developerTokenExpiringAt(timestamp) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "ES256" })}.${encode({ exp: Math.floor(timestamp / 1000) })}.signature`;
}

const productionEnv = {
  PLAYLIST_TRANSFER_DB: {},
  APPLE_MUSIC_DEVELOPER_TOKEN: developerTokenExpiringAt(Date.UTC(2050, 0, 1)),
  TRANSFER_API_URL: "https://oracle.example.com",
  TRANSFER_API_FALLBACK_URL: "https://render.example.com"
};

test("health reports degraded when the primary is down and fallback is healthy", async () => {
  const response = await buildHealthResponse(productionEnv, async (input) => {
    if (String(input).startsWith("https://oracle.example.com")) {
      return new Response("error code: 1033", { status: 530 });
    }
    return Response.json({ ok: true });
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.status, "degraded");
  assert.equal(body.dependencies.spotifyIngestionPrimary.ok, false);
  assert.equal(body.dependencies.spotifyIngestionPrimary.status, 530);
  assert.equal(body.dependencies.spotifyIngestionFallback.ok, true);
});

test("health reports unhealthy when no ingestion backend is available", async () => {
  const response = await buildHealthResponse(
    productionEnv,
    async () => new Response("unavailable", { status: 503 })
  );
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.ok, false);
  assert.equal(body.status, "unhealthy");
  assert.equal(body.dependencies.spotifyIngestionPrimary.ok, false);
  assert.equal(body.dependencies.spotifyIngestionFallback.ok, false);
});

test("health reports unhealthy when native Apple Music configuration is missing", async () => {
  const response = await buildHealthResponse(
    { ...productionEnv, APPLE_MUSIC_DEVELOPER_TOKEN: "" },
    async () => Response.json({ ok: true })
  );
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.ok, false);
  assert.equal(body.status, "unhealthy");
});

test("health reports degraded before the Apple Music developer token expires", async () => {
  const response = await buildHealthResponse(
    {
      ...productionEnv,
      APPLE_MUSIC_DEVELOPER_TOKEN: developerTokenExpiringAt(Date.now() + 7 * 24 * 60 * 60 * 1000)
    },
    async () => Response.json({ ok: true })
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.status, "degraded");
  assert.equal(body.dependencies.appleMusicDeveloperToken.status, "expiring");
  assert.equal(body.dependencies.appleMusicDeveloperToken.expiresInDays, 7);
});

test("health reports unhealthy after the Apple Music developer token expires", async () => {
  const response = await buildHealthResponse(
    {
      ...productionEnv,
      APPLE_MUSIC_DEVELOPER_TOKEN: developerTokenExpiringAt(Date.now() - 60_000)
    },
    async () => Response.json({ ok: true })
  );
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.ok, false);
  assert.equal(body.status, "unhealthy");
  assert.equal(body.dependencies.appleMusicDeveloperToken.status, "expired");
});
