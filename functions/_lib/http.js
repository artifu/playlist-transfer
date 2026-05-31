export function jsonResponse(status, payload, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders
    }
  });
}

export async function readJsonBody(request) {
  const text = (await request.text()).trim();
  return text ? JSON.parse(text) : {};
}

export function errorMessage(error) {
  if (!(error instanceof Error)) return String(error);

  if (error.message.includes("api.music.apple.com") && error.message.includes("HTTP 401")) {
    return "Apple Music authentication failed. Reconnect Apple Music, then try again.";
  }

  if (error.message.includes("api.music.apple.com") && error.message.includes("HTTP 403")) {
    return "Apple Music refused this library write. Reconnect Apple Music with an account that can create playlists, then try again.";
  }

  if (error.message.includes("api.music.apple.com") && error.message.includes("HTTP 429")) {
    return "Apple Music rate limited the analysis. Wait a moment and try again.";
  }

  if (error.name === "TimeoutError") {
    return "The provider request timed out. Try again in a moment or use a smaller playlist.";
  }

  return error.message;
}

export function statusForError(error) {
  const message = errorMessage(error);
  if (message.includes("rate limited")) return 429;
  if (message.includes("authentication failed")) return 401;
  if (message.includes("refused")) return 403;
  if (message.includes("not found")) return 404;
  return 400;
}

