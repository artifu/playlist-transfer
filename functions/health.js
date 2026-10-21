const DEFAULT_TRANSFER_API_URL = "https://playlist-transfer-api.onrender.com";
const HEALTH_PROBE_TIMEOUT_MS = 15_000;
const APPLE_MUSIC_TOKEN_WARNING_MS = 14 * 24 * 60 * 60 * 1000;

function decodeJwtPayload(token) {
  const payload = String(token ?? "").split(".")[1];
  if (!payload) return null;

  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

export function appleMusicDeveloperTokenHealth(token, now = Date.now()) {
  if (!String(token ?? "").trim()) {
    return { ok: false, status: "missing", expiresAt: null, expiresInDays: null };
  }

  const payload = decodeJwtPayload(token);
  const expiresAtMs = Number(payload?.exp) * 1000;
  if (!Number.isFinite(expiresAtMs)) {
    return { ok: false, status: "invalid", expiresAt: null, expiresInDays: null };
  }

  const remainingMs = expiresAtMs - now;
  const expiresAt = new Date(expiresAtMs).toISOString();
  const expiresInDays = Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));

  if (remainingMs <= 0) {
    return { ok: false, status: "expired", expiresAt, expiresInDays: 0 };
  }

  if (remainingMs <= APPLE_MUSIC_TOKEN_WARNING_MS) {
    return { ok: true, status: "expiring", expiresAt, expiresInDays };
  }

  return { ok: true, status: "valid", expiresAt, expiresInDays };
}

function sanitizedProbeError(error) {
  if (error?.name === "TimeoutError" || error?.name === "AbortError") return "timeout";
  return "unreachable";
}

async function probeTransferApi(baseUrl, fetchImpl) {
  if (!baseUrl) return null;

  let url;
  try {
    url = new URL("/health", baseUrl);
  } catch {
    return { ok: false, status: null, error: "invalid_url" };
  }

  const startedAt = Date.now();
  try {
    const response = await fetchImpl(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(HEALTH_PROBE_TIMEOUT_MS)
    });
    let payload;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    return {
      ok: response.ok && payload?.ok !== false,
      status: response.status,
      latencyMs: Date.now() - startedAt
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      error: sanitizedProbeError(error),
      latencyMs: Date.now() - startedAt
    };
  }
}

export async function buildHealthResponse(env, fetchImpl = fetch) {
  const nativeApiConfigured = Boolean(env.PLAYLIST_TRANSFER_DB);
  const hasAppleDeveloperToken = Boolean(env.APPLE_MUSIC_DEVELOPER_TOKEN);
  const appleMusicDeveloperToken = nativeApiConfigured
    ? appleMusicDeveloperTokenHealth(env.APPLE_MUSIC_DEVELOPER_TOKEN)
    : { ok: true, status: "not_required", expiresAt: null, expiresInDays: null };
  const primaryUrl = env.TRANSFER_API_URL || DEFAULT_TRANSFER_API_URL;
  const fallbackUrl = env.TRANSFER_API_FALLBACK_URL || null;
  const distinctFallbackUrl = fallbackUrl && new URL(fallbackUrl).origin !== new URL(primaryUrl).origin
    ? fallbackUrl
    : null;

  const [primary, fallback] = await Promise.all([
    probeTransferApi(primaryUrl, fetchImpl),
    probeTransferApi(distinctFallbackUrl, fetchImpl)
  ]);

  const configurationOk = !nativeApiConfigured || appleMusicDeveloperToken.ok;
  const ingestionAvailable = Boolean(primary?.ok || fallback?.ok);
  const ok = configurationOk && ingestionAvailable;
  const degraded = appleMusicDeveloperToken.status === "expiring" || !primary?.ok;
  const status = !ok ? "unhealthy" : degraded ? "degraded" : "healthy";
  const body = {
    ok,
    status,
    host: "cloudflare-pages",
    apiMode: nativeApiConfigured ? "cloudflare-native" : "render-proxy",
    nativeApiConfigured,
    hasAppleDeveloperToken,
    dependencies: {
      appleMusicDeveloperToken,
      spotifyIngestionPrimary: primary,
      spotifyIngestionFallback: fallback
    }
  };

  return new Response(JSON.stringify(body), {
    status: ok ? 200 : 503,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

export function onRequest(context) {
  return buildHealthResponse(context.env);
}
