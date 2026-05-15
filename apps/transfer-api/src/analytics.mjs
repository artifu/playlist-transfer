import { createHash } from "node:crypto";
import { readJsonBody, sendJson } from "./http.mjs";

const ALLOWED_EVENTS = new Set([
  "page_view",
  "apple_connect_started",
  "apple_connect_succeeded",
  "apple_connect_failed",
  "preview_started",
  "preview_succeeded",
  "preview_failed",
  "analysis_started",
  "analysis_succeeded",
  "analysis_failed",
  "review_decision_succeeded",
  "review_decision_failed",
  "transfer_create_started",
  "transfer_create_succeeded",
  "transfer_create_failed"
]);

const SAFE_PROPERTY_KEYS = new Set([
  "appleConnected",
  "analysisLimit",
  "candidateIndex",
  "durationMs",
  "errorCategory",
  "errorMessage",
  "hasDeveloperToken",
  "host",
  "itemIndex",
  "matchRate",
  "missingCount",
  "path",
  "playlistId",
  "playlistSource",
  "readableTracks",
  "readyCount",
  "reviewAction",
  "reviewCount",
  "totalTracks",
  "transferId",
  "withIsrcCount"
]);

function sessionHash(sessionId) {
  const normalizedSessionId = String(sessionId || "").trim();
  if (!normalizedSessionId) return null;

  const salt = process.env.TRANSFER_API_ANALYTICS_SALT || "playlist-transfer-v1";
  return createHash("sha256")
    .update(`${salt}:${normalizedSessionId}`)
    .digest("hex")
    .slice(0, 16);
}

function scrubString(value) {
  return String(value ?? "")
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/spotify:playlist:[A-Za-z0-9]+/gi, "spotify:playlist:[id]")
    .replace(/[A-Za-z0-9_-]{80,}/g, "[redacted]")
    .slice(0, 240);
}

function safeScalar(value) {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return scrubString(value);
  return null;
}

function safeProperties(rawProperties) {
  if (!rawProperties || typeof rawProperties !== "object" || Array.isArray(rawProperties)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(rawProperties)
      .filter(([key]) => SAFE_PROPERTY_KEYS.has(key))
      .map(([key, value]) => [key, safeScalar(value)])
      .filter(([, value]) => value !== null)
  );
}

export async function handleUsageEvent(sessionId, request, response) {
  try {
    const body = await readJsonBody(request);
    const event = String(body.event || "").trim();

    if (!ALLOWED_EVENTS.has(event)) {
      sendJson(response, 400, {
        error: true,
        message: "Unsupported analytics event."
      });
      return;
    }

    const payload = {
      logType: "playlist_transfer_event",
      event,
      anonymousSession: sessionHash(sessionId),
      observedAt: new Date().toISOString(),
      properties: safeProperties(body.properties)
    };

    console.info(JSON.stringify(payload));
    sendJson(response, 202, { ok: true });
  } catch (error) {
    console.warn(JSON.stringify({
      logType: "playlist_transfer_event_error",
      observedAt: new Date().toISOString(),
      message: error instanceof Error ? scrubString(error.message) : scrubString(error)
    }));
    sendJson(response, 202, { ok: true });
  }
}
