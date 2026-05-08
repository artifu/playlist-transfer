import {
  appleMusicSessionPayload,
  handleAppleMusicUserToken
} from "./apple-session.mjs";
import {
  handlePlaylistPreview,
  handlePublicPlaylistPreview,
  handlePublicTransferAnalyze,
  handlePublicTransferAnalyzeJob,
  handlePublicTransferCreate,
  handlePublicTransferCreateJob,
  handleTransferAnalyze
} from "./handlers.mjs";
import { handleJobStatus } from "./jobs.mjs";
import { sendHtml, sendJson } from "./http.mjs";

export function createTransferApiRouter({ host, port, renderHomePage }) {
  return async function routeRequest(request, response) {
    const method = request.method ?? "GET";
    const url = new URL(request.url ?? "/", `http://${host}:${port}`);

    if (method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (method === "GET" && url.pathname === "/api/apple-music/session") {
      sendJson(response, 200, appleMusicSessionPayload());
      return;
    }

    if (method === "POST" && url.pathname === "/api/apple-music/user-token") {
      await handleAppleMusicUserToken(request, response);
      return;
    }

    if (method === "GET" && url.pathname === "/") {
      if (renderHomePage) {
        sendHtml(response, renderHomePage());
        return;
      }

      sendJson(response, 200, {
        name: "PlaylistTransfer Transfer API",
        ok: true,
        endpoints: [
          "GET /health",
          "GET /api/apple-music/session",
          "POST /api/apple-music/user-token",
          "GET /api/jobs/:id",
          "POST /api/spotify/public-playlist-preview",
          "POST /api/transfers/analyze-public-job",
          "POST /api/transfers/create-public-job"
        ]
      });
      return;
    }

    if (method === "GET" && url.pathname.startsWith("/api/jobs/")) {
      handleJobStatus(url.pathname.slice("/api/jobs/".length), response);
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

    if (method === "POST" && url.pathname === "/api/transfers/analyze-public-job") {
      await handlePublicTransferAnalyzeJob(request, response);
      return;
    }

    if (method === "POST" && url.pathname === "/api/transfers/create-public") {
      await handlePublicTransferCreate(request, response);
      return;
    }

    if (method === "POST" && url.pathname === "/api/transfers/create-public-job") {
      await handlePublicTransferCreateJob(request, response);
      return;
    }

    sendJson(response, 404, { error: true, message: "Not found" });
  };
}
