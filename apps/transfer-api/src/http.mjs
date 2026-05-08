import { HttpError } from "../../../dist/lib/http.js";

export function errorMessage(error) {
  if (!(error instanceof HttpError)) {
    return error instanceof Error ? error.message : String(error);
  }

  if (error.url.includes("api.spotify.com") && error.status === 403) {
    return "Spotify refused access to this playlist's tracks. The connected account likely needs to own the playlist or be a collaborator.";
  }

  if (error.url.includes("api.spotify.com") && error.status === 404) {
    return "Spotify could not find this playlist through the Web API. Generated playlists such as Daily Mix may not be available as normal playlist resources.";
  }

  if (error.url.includes("api.spotify.com") && error.status === 401) {
    return "Spotify authentication failed. Re-run npm run spotify:auth to refresh the local token.";
  }

  if (error.url.includes("api.music.apple.com") && error.status === 401) {
    return "Apple Music authentication failed. Reconnect Apple Music, then try again.";
  }

  if (error.url.includes("api.music.apple.com") && error.status === 403) {
    return "Apple Music refused this library write. Reconnect Apple Music with an account that can create playlists, then try again.";
  }

  if (error.url.includes("api.music.apple.com") && error.status === 429) {
    return "Apple Music rate limited the analysis. Wait a moment and try again.";
  }

  return error.message;
}

export function statusForError(error) {
  if (!(error instanceof HttpError)) return 400;
  return error.status >= 500 ? 502 : error.status;
}

export async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const text = Buffer.concat(chunks).toString("utf8").trim();
  return text ? JSON.parse(text) : {};
}

export function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

export function sendHtml(response, html) {
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(html);
}
