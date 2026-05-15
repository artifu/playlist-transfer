const DEFAULT_TRANSFER_API_URL = "https://playlist-transfer-api.onrender.com";

function transferApiUrl(env) {
  try {
    return new URL(env.TRANSFER_API_URL || DEFAULT_TRANSFER_API_URL);
  } catch {
    return new URL(DEFAULT_TRANSFER_API_URL);
  }
}

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

function proxyHeaders(request) {
  const headers = new Headers(request.headers);
  const incomingUrl = new URL(request.url);

  headers.delete("connection");
  headers.delete("content-length");
  headers.delete("host");

  headers.set("X-Forwarded-Host", incomingUrl.host);
  headers.set("X-Forwarded-Proto", incomingUrl.protocol.replace(":", ""));
  headers.set("X-PlaylistTransfer-Proxy", "cloudflare-pages");

  return headers;
}

export async function onRequest(context) {
  const request = context.request;
  const incomingUrl = new URL(request.url);
  const targetUrl = new URL(incomingUrl.pathname + incomingUrl.search, transferApiUrl(context.env));
  const method = request.method || "GET";

  try {
    const fetchOptions = {
      method,
      headers: proxyHeaders(request),
      redirect: "manual"
    };

    if (method !== "GET" && method !== "HEAD") {
      fetchOptions.body = request.body;
      fetchOptions.duplex = "half";
    }

    const proxied = await fetch(targetUrl, fetchOptions);

    const responseHeaders = new Headers(proxied.headers);
    responseHeaders.delete("content-encoding");
    responseHeaders.delete("content-length");
    responseHeaders.set("Cache-Control", "no-store");

    return new Response(proxied.body, {
      status: proxied.status,
      statusText: proxied.statusText,
      headers: responseHeaders
    });
  } catch (error) {
    return jsonResponse(502, {
      error: true,
      message: "Transfer API did not respond. Try again in a moment.",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}
