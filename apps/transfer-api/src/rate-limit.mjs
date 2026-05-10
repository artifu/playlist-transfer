import { sendJson } from "./http.mjs";
import { sessionIdFromRequest } from "./sessions.mjs";

const DEFAULT_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const DEFAULT_RATE_LIMIT_MAX = 240;
const buckets = new Map();

function numberFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function rateLimitWindowMs() {
  return numberFromEnv("TRANSFER_API_RATE_LIMIT_WINDOW_MS", DEFAULT_RATE_LIMIT_WINDOW_MS);
}

function rateLimitMax() {
  return numberFromEnv("TRANSFER_API_RATE_LIMIT_MAX", DEFAULT_RATE_LIMIT_MAX);
}

function rateLimitDisabled() {
  return process.env.TRANSFER_API_RATE_LIMIT_DISABLED === "1";
}

function forwardedIp(request) {
  const forwardedFor = String(request.headers["x-forwarded-for"] ?? "").split(",")[0].trim();
  return forwardedFor || request.socket?.remoteAddress || "unknown";
}

function rateLimitKey(request) {
  const sessionId = sessionIdFromRequest(request);
  return sessionId ? `session:${sessionId}` : `ip:${forwardedIp(request)}`;
}

function sweepExpiredBuckets(now) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function enforceApiRateLimit(request, response) {
  if (rateLimitDisabled()) return true;

  const now = Date.now();
  const windowMs = rateLimitWindowMs();
  const maxRequests = rateLimitMax();

  if (windowMs <= 0 || maxRequests <= 0) return true;

  const key = rateLimitKey(request);
  const existing = buckets.get(key);
  const bucket = existing && existing.resetAt > now
    ? existing
    : {
        count: 0,
        resetAt: now + windowMs
      };

  bucket.count += 1;
  buckets.set(key, bucket);

  if (bucket.count <= maxRequests) {
    if (buckets.size > 1000) sweepExpiredBuckets(now);
    return true;
  }

  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  sendJson(response, 429, {
    error: true,
    message: "Too many requests. Please wait a moment and try again.",
    retryAfterSeconds
  });
  return false;
}
