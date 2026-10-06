const DEFAULT_TRANSFER_API_URL = "https://playlist-transfer-api.onrender.com";
const HEALTH_PROBE_TIMEOUT_MS = 15_000;

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
  const primaryUrl = env.TRANSFER_API_URL || DEFAULT_TRANSFER_API_URL;
  const fallbackUrl = env.TRANSFER_API_FALLBACK_URL || null;
  const distinctFallbackUrl = fallbackUrl && new URL(fallbackUrl).origin !== new URL(primaryUrl).origin
    ? fallbackUrl
    : null;

  const [primary, fallback] = await Promise.all([
    probeTransferApi(primaryUrl, fetchImpl),
    probeTransferApi(distinctFallbackUrl, fetchImpl)
  ]);

  const configurationOk = !nativeApiConfigured || hasAppleDeveloperToken;
  const ingestionAvailable = Boolean(primary?.ok || fallback?.ok);
  const ok = configurationOk && ingestionAvailable;
  const status = !ok ? "unhealthy" : primary?.ok ? "healthy" : "degraded";
  const body = {
    ok,
    status,
    host: "cloudflare-pages",
    apiMode: nativeApiConfigured ? "cloudflare-native" : "render-proxy",
    nativeApiConfigured,
    hasAppleDeveloperToken,
    dependencies: {
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
