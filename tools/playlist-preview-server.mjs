import { createServer } from "node:http";
import { loadAppleMusicConfig, loadSpotifyConfig } from "../dist/config.js";
import { HttpError } from "../dist/lib/http.js";
import { parseSpotifyPlaylistInput } from "../dist/lib/spotify-url.js";
import { AppleMusicClient } from "../dist/providers/apple.js";
import { SpotifyClient } from "../dist/providers/spotify.js";
import { getPublicSpotifyPlaylist } from "../dist/providers/spotify-public.js";
import { analyzeSpotifyPlaylist, analyzeTransfer } from "../dist/transfer/analyze-transfer.js";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 8790);

function createSpotifyClient() {
  const config = loadSpotifyConfig();
  return new SpotifyClient(
    config.spotifyClientId,
    config.spotifyClientSecret,
    config.spotifyRefreshToken
  );
}

function createAppleMusicClient() {
  const config = loadAppleMusicConfig();
  return new AppleMusicClient(
    config.appleMusicDeveloperToken,
    config.appleMusicUserToken,
    config.appleMusicStorefront
  );
}

function matchStatus(result) {
  if (!result.matched) return "unmatched";
  if (result.confidence < 0.8) return "needs_review";
  return "matched";
}

function errorMessage(error) {
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
    return "Apple Music authentication failed. Refresh the developer token and user token, then try again.";
  }

  if (error.url.includes("api.music.apple.com") && error.status === 429) {
    return "Apple Music rate limited the analysis. Wait a moment and try again.";
  }

  return error.message;
}

function statusForError(error) {
  if (!(error instanceof HttpError)) return 400;
  return error.status >= 500 ? 502 : error.status;
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const text = Buffer.concat(chunks).toString("utf8").trim();
  return text ? JSON.parse(text) : {};
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function sendHtml(response, html) {
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(html);
}

async function handlePlaylistPreview(request, response) {
  try {
    const body = await readJsonBody(request);
    const input = body.input ?? body.playlistUrl ?? body.playlistId ?? "";
    const playlistId = parseSpotifyPlaylistInput(input);
    const spotify = createSpotifyClient();
    const playlist = await spotify.getPlaylist(playlistId);

    sendJson(response, 200, {
      playlist: {
        id: playlist.id,
        name: playlist.name,
        description: playlist.description,
        totalItems: playlist.totalItems
      },
      tracks: playlist.tracks
    });
  } catch (error) {
    sendJson(response, statusForError(error), {
      error: true,
      message: errorMessage(error)
    });
  }
}

async function handlePublicPlaylistPreview(request, response) {
  try {
    const body = await readJsonBody(request);
    const input = body.input ?? body.playlistUrl ?? body.playlistId ?? "";
    const playlist = await getPublicSpotifyPlaylist(input);

    sendJson(response, 200, {
      playlist: {
        id: playlist.id,
        name: playlist.name,
        description: playlist.description,
        totalItems: playlist.totalItems,
        source: playlist.source,
        limitations: playlist.limitations
      },
      tracks: playlist.tracks
    });
  } catch (error) {
    sendJson(response, statusForError(error), {
      error: true,
      message: errorMessage(error)
    });
  }
}

async function handleTransferAnalyze(request, response) {
  try {
    const body = await readJsonBody(request);
    const input = body.input ?? body.playlistUrl ?? body.playlistId ?? "";
    const playlistId = parseSpotifyPlaylistInput(input);
    const analysis = await analyzeTransfer({
      spotify: createSpotifyClient(),
      apple: createAppleMusicClient(),
      spotifyPlaylistId: playlistId
    });
    const items = analysis.results.map((result, index) => ({
      index: index + 1,
      status: matchStatus(result),
      source: result.source,
      confidence: result.confidence,
      reason: result.reason,
      appleCandidate: result.candidate,
      searchTerm: result.searchTerm,
      candidates: result.candidates ?? []
    }));

    sendJson(response, 200, {
      playlist: {
        id: analysis.playlistId,
        name: analysis.playlistName,
        totalItems: analysis.results.length
      },
      summary: {
        matchedCount: analysis.matchedCount,
        unmatchedCount: analysis.unmatchedCount,
        needsReviewCount: items.filter((item) => item.status === "needs_review").length,
        matchRate: analysis.matchRate
      },
      items
    });
  } catch (error) {
    sendJson(response, statusForError(error), {
      error: true,
      message: errorMessage(error)
    });
  }
}

async function handlePublicTransferAnalyze(request, response) {
  try {
    const body = await readJsonBody(request);
    const input = body.input ?? body.playlistUrl ?? body.playlistId ?? "";
    const playlist = await getPublicSpotifyPlaylist(input);
    const analysis = await analyzeSpotifyPlaylist(playlist, createAppleMusicClient());
    const items = analysis.results.map((result, index) => ({
      index: index + 1,
      status: matchStatus(result),
      source: result.source,
      confidence: result.confidence,
      reason: result.reason,
      appleCandidate: result.candidate,
      searchTerm: result.searchTerm,
      candidates: result.candidates ?? []
    }));

    sendJson(response, 200, {
      playlist: {
        id: analysis.playlistId,
        name: analysis.playlistName,
        totalItems: analysis.results.length,
        source: playlist.source,
        limitations: playlist.limitations
      },
      summary: {
        matchedCount: analysis.matchedCount,
        unmatchedCount: analysis.unmatchedCount,
        needsReviewCount: items.filter((item) => item.status === "needs_review").length,
        matchRate: analysis.matchRate
      },
      items
    });
  } catch (error) {
    sendJson(response, statusForError(error), {
      error: true,
      message: errorMessage(error)
    });
  }
}

function renderPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PlaylistTransfer Analyzer</title>
  <style>
    body { margin: 0; background: #f4f6f3; color: #171917; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { max-width: 1120px; margin: 0 auto; padding: 32px 20px 56px; }
    header { border-bottom: 1px solid #d8ddd3; padding-bottom: 20px; }
    h1 { margin: 0; font-size: clamp(30px, 5vw, 52px); line-height: 1; }
    p { color: #596156; line-height: 1.5; }
    form { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; margin: 26px 0; }
    input { min-width: 0; border: 1px solid #c7cec2; border-radius: 8px; padding: 13px 14px; font: inherit; background: #fff; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; }
    button { border: 0; border-radius: 8px; padding: 0 18px; min-height: 48px; background: #172019; color: #fff; font-weight: 800; cursor: pointer; }
    button:disabled { opacity: 0.65; cursor: wait; }
    table { width: 100%; border-collapse: collapse; margin-top: 18px; background: #fff; border: 1px solid #d8ddd3; }
    th, td { padding: 11px 12px; border-bottom: 1px solid #e4e8df; text-align: left; vertical-align: top; }
    th { background: #eef2ea; color: #3e463b; font-size: 13px; text-transform: uppercase; }
    td { font-size: 14px; }
    .track { font-weight: 750; }
    .meta, .mono, #status { color: #596156; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
    .badge { display: inline-flex; border-radius: 999px; padding: 4px 9px; font-size: 12px; font-weight: 800; text-transform: uppercase; }
    .matched { background: #dcefd7; color: #245927; }
    .needs_review { background: #fff1c7; color: #7a5600; }
    .unmatched { background: #f8dada; color: #8f1c1c; }
    .error { color: #9b1c1c; }
    @media (max-width: 700px) { form { display: grid; } .actions { display: grid; } table { display: block; overflow-x: auto; } }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Playlist Analyzer</h1>
      <p>Paste a Spotify playlist link to preview public tracks without Spotify OAuth, or compare the authenticated API path.</p>
    </header>
    <form id="form">
      <input id="playlist-input" autocomplete="off" placeholder="https://open.spotify.com/playlist/..." />
      <div class="actions">
        <button type="submit" value="public-preview">Preview Public</button>
        <button type="submit" value="public-analyze">Analyze Public</button>
        <button type="submit" value="api-preview">Preview API</button>
        <button type="submit" value="api-analyze">Analyze API</button>
      </div>
    </form>
    <div id="status"></div>
    <section id="result"></section>
  </main>
  <script>
    const form = document.querySelector("#form");
    const input = document.querySelector("#playlist-input");
    const status = document.querySelector("#status");
    const result = document.querySelector("#result");
    const buttons = [...document.querySelectorAll("button")];
    function esc(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
    function duration(ms) { if (!ms) return ""; const s = Math.round(ms / 1000); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
    function pct(value) { return typeof value === "number" ? Math.round(value * 100) + "%" : ""; }
    function sourceNote(data) {
      const source = data.playlist.source ? "<div class='meta'>Source: " + esc(data.playlist.source) + "</div>" : "";
      const limits = Array.isArray(data.playlist.limitations) && data.playlist.limitations.length ? "<div class='mono'>Limitations: " + esc(data.playlist.limitations.join(" · ")) + "</div>" : "";
      return source + limits;
    }
    function renderPreview(data) {
      const rows = data.tracks.map((track, index) => "<tr><td>" + (index + 1) + "</td><td><div class='track'>" + esc(track.name) + "</div><div>" + esc(track.artists.join(", ")) + "</div></td><td>" + esc(track.album) + "</td><td>" + duration(track.durationMs) + "</td><td class='mono'>" + esc(track.isrc || "") + "</td></tr>").join("");
      result.innerHTML = "<h2>" + esc(data.playlist.name) + "</h2><div class='meta'>" + data.tracks.length + " readable tracks · Spotify ID " + esc(data.playlist.id) + "</div>" + sourceNote(data) + "<table><thead><tr><th>#</th><th>Song</th><th>Album</th><th>Time</th><th>ISRC</th></tr></thead><tbody>" + rows + "</tbody></table>";
    }
    function renderAnalysis(data) {
      const rows = data.items.map((item) => {
        const source = item.source;
        const candidate = item.appleCandidate;
        const apple = candidate ? "<div class='track'>" + esc(candidate.name) + "</div><div>" + esc(candidate.artistName) + "</div><div class='mono'>" + esc(candidate.albumName || "") + "</div>" : "<span class='mono'>No candidate selected</span>";
        return "<tr><td>" + item.index + "</td><td><span class='badge " + esc(item.status) + "'>" + esc(item.status.replaceAll("_", " ")) + "</span></td><td><div class='track'>" + esc(source.name) + "</div><div>" + esc(source.artists.join(", ")) + "</div><div class='mono'>" + esc(source.album || "") + "</div></td><td>" + apple + "</td><td>" + pct(item.confidence) + "</td><td class='mono'>" + esc(item.reason || "") + "</td></tr>";
      }).join("");
      result.innerHTML = "<h2>" + esc(data.playlist.name) + "</h2><div class='meta'>" + data.summary.matchedCount + " matched · " + data.summary.needsReviewCount + " needs review · " + data.summary.unmatchedCount + " unmatched · " + pct(data.summary.matchRate) + " match rate</div>" + sourceNote(data) + "<table><thead><tr><th>#</th><th>Status</th><th>Spotify</th><th>Apple Music Candidate</th><th>Confidence</th><th>Reason</th></tr></thead><tbody>" + rows + "</tbody></table>";
    }
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const value = input.value.trim();
      if (!value) return;
      const action = event.submitter?.value ?? "public-preview";
      buttons.forEach((button) => button.disabled = true);
      status.className = "";
      status.textContent = action.includes("preview") ? "Reading playlist..." : "Analyzing matches...";
      result.innerHTML = "";
      try {
        const endpoints = {
          "public-preview": "/api/spotify/public-playlist-preview",
          "public-analyze": "/api/transfers/analyze-public",
          "api-preview": "/api/spotify/playlist-preview",
          "api-analyze": "/api/transfers/analyze"
        };
        const endpoint = endpoints[action] ?? endpoints["public-preview"];
        const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input: value }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Request failed.");
        status.textContent = action.includes("preview") ? "Playlist loaded." : "Analysis complete.";
        action.includes("preview") ? renderPreview(data) : renderAnalysis(data);
      } catch (error) {
        status.className = "error";
        status.textContent = error instanceof Error ? error.message : String(error);
      } finally {
        buttons.forEach((button) => button.disabled = false);
      }
    });
  </script>
</body>
</html>`;
}

const server = createServer(async (request, response) => {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", `http://${host}:${port}`);

  if (method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (method === "GET" && url.pathname === "/") {
    sendHtml(response, renderPage());
    return;
  }

  if (method === "POST" && url.pathname === "/api/spotify/playlist-preview") {
    await handlePlaylistPreview(request, response);
    return;
  }

  if (method === "POST" && url.pathname === "/api/spotify/public-playlist-preview") {
    await handlePublicPlaylistPreview(request, response);
    return;
  }

  if (method === "POST" && url.pathname === "/api/transfers/analyze") {
    await handleTransferAnalyze(request, response);
    return;
  }

  if (method === "POST" && url.pathname === "/api/transfers/analyze-public") {
    await handlePublicTransferAnalyze(request, response);
    return;
  }

  sendJson(response, 404, { error: true, message: "Not found" });
});

server.listen(port, host, () => {
  console.log(`PlaylistTransfer local preview: http://${host}:${port}`);
});
