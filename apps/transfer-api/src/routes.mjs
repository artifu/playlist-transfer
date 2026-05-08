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
  handleGetTransfer,
  handlePatchTransferItem,
  handleStoredTransferCreateJob,
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
          "GET /api/transfers/:id",
          "PATCH /api/transfers/:id/items/:index",
          "POST /api/transfers/:id/create-job",
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

    const transferItemMatch = url.pathname.match(/^\/api\/transfers\/([^/]+)\/items\/(\d+)$/);
    if (method === "PATCH" && transferItemMatch) {
      await handlePatchTransferItem(
        decodeURIComponent(transferItemMatch[1]),
        Number(transferItemMatch[2]),
        request,
        response
      );
      return;
    }

    const transferCreateJobMatch = url.pathname.match(/^\/api\/transfers\/([^/]+)\/create-job$/);
    if (method === "POST" && transferCreateJobMatch) {
      await handleStoredTransferCreateJob(decodeURIComponent(transferCreateJobMatch[1]), response);
      return;
    }

    const transferMatch = url.pathname.match(/^\/api\/transfers\/([^/]+)$/);
    if (method === "GET" && transferMatch) {
      handleGetTransfer(decodeURIComponent(transferMatch[1]), response);
      return;
    }

    sendJson(response, 404, { error: true, message: "Not found" });
  };
}
