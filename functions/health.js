const DEFAULT_TRANSFER_API_URL = "https://playlist-transfer-api.onrender.com";

export function onRequest(context) {
  return new Response(
    JSON.stringify({
      ok: true,
      host: "cloudflare-pages",
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
