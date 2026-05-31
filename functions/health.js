const DEFAULT_TRANSFER_API_URL = "https://playlist-transfer-api.onrender.com";

export function onRequest(context) {
  const nativeApiConfigured = Boolean(context.env.PLAYLIST_TRANSFER_DB);

  return new Response(
    JSON.stringify({
      ok: true,
      host: "cloudflare-pages",
      apiMode: nativeApiConfigured ? "cloudflare-native" : "render-proxy",
      nativeApiConfigured,
      hasAppleDeveloperToken: Boolean(context.env.APPLE_MUSIC_DEVELOPER_TOKEN),
      transferApiUrl: context.env.TRANSFER_API_URL || DEFAULT_TRANSFER_API_URL
    }),
    {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8"
      }
    }
  );
}
