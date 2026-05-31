import { appleMusicSessionPayload, createAppleMusicClient } from "./apple-music.js";
import {
  applyTransferItemDecision,
  createJob,
  createTransfer,
  findJob,
  findTransfer,
  loadTransferReport,
  markTransferCreated,
  serializeJob,
  updateJob
} from "./d1-storage.js";
import { errorMessage, jsonResponse, readJsonBody, statusForError } from "./http.js";
import { requireSessionId, sessionIdFromRequest } from "./session.js";
import { getPublicSpotifyPlaylist } from "./spotify-public.js";
import {
  analysisLimitFromBody,
  analyzeSpotifyPlaylist,
  createApplePlaylistFromMatches,
  playlistAnalysisMetadata,
  serializeAnalysis,
  slicePlaylistForAnalysis,
  transferReportFromSerializedAnalysis
} from "./transfer.js";

function routePath(request) {
  return new URL(request.url).pathname;
}

function transferInputFromBody(body) {
  return body.input ?? body.playlistUrl ?? body.playlistId ?? "";
}

function noStoreJson(status, payload) {
  return jsonResponse(status, payload);
}

function handleError(error) {
  return noStoreJson(statusForError(error), {
    error: true,
    message: errorMessage(error)
  });
}

async function handlePublicPlaylistPreview(request) {
  const body = await readJsonBody(request);
  const input = transferInputFromBody(body);
  const playlist = await getPublicSpotifyPlaylist(input);

  return noStoreJson(200, {
    playlist: {
      id: playlist.id,
      name: playlist.name,
      description: playlist.description,
      imageUrl: playlist.imageUrl,
      totalItems: playlist.totalItems,
      source: playlist.source,
      limitations: playlist.limitations
    },
    tracks: playlist.tracks
  });
}

async function runAnalyzeJob(env, job, body) {
  const input = transferInputFromBody(body);
  const limit = analysisLimitFromBody(body);

  try {
    await updateJob(env, job, {
      status: "running",
      phase: "Reading public Spotify playlist",
      progress: 4
    });

    const playlist = await getPublicSpotifyPlaylist(input);
    const analysisPlaylist = slicePlaylistForAnalysis(playlist, limit);

    await updateJob(env, job, {
      phase: `Matching Apple Music (0/${analysisPlaylist.tracks.length})`,
      progress: 10,
      completed: 0,
      total: analysisPlaylist.tracks.length,
      playlistName: playlist.name,
      originalTotalItems: playlist.totalItems
    });

    const analysis = await analyzeSpotifyPlaylist(
      analysisPlaylist,
      createAppleMusicClient(env),
      {
        onTrackComplete: ({ completed, total }) => {
          Object.assign(job, {
            phase: `Matching Apple Music (${completed}/${total})`,
            completed,
            total,
            progress: Math.min(95, Math.round(10 + (completed / Math.max(total, 1)) * 85))
          });
        }
      }
    );

    const serializedAnalysis = serializeAnalysis(
      analysis,
      playlistAnalysisMetadata(playlist, analysisPlaylist.tracks.length)
    );
    const transfer = await createTransfer(env, {
      sessionId: job.sessionId,
      input,
      analysisLimit: limit,
      analysis: serializedAnalysis
    });

    await updateJob(env, job, {
      status: "complete",
      phase: "Analysis complete",
      progress: 100,
      result: transfer
    });
  } catch (error) {
    await updateJob(env, job, {
      status: "error",
      phase: "Analysis failed",
      progress: 100,
      error: errorMessage(error)
    });
  }
}

async function runCreateJob(env, job, body) {
  const input = transferInputFromBody(body);
  const limit = analysisLimitFromBody(body);
  const transferId = String(body.transferId ?? "").trim();
  const userToken = String(body.userToken ?? body.musicUserToken ?? "").trim();
  const storefront = String(body.storefront ?? env.APPLE_MUSIC_STOREFRONT ?? "us").trim();

  try {
    let serializedAnalysis = null;

    if (transferId) {
      serializedAnalysis = await loadTransferReport(env, transferId, job.sessionId);
      await updateJob(env, job, {
        status: "running",
        phase: "Using saved transfer review",
        progress: 72,
        completed: serializedAnalysis.items?.length ?? 0,
        total: serializedAnalysis.items?.length ?? 0
      });
    } else if (body.analysis) {
      serializedAnalysis = body.analysis;
      await updateJob(env, job, {
        status: "running",
        phase: "Using reviewed analysis",
        progress: 72,
        completed: serializedAnalysis.items?.length ?? 0,
        total: serializedAnalysis.items?.length ?? 0
      });
    } else {
      await updateJob(env, job, {
        status: "running",
        phase: "Analyzing before creation",
        progress: 4
      });

      const playlist = await getPublicSpotifyPlaylist(input);
      const analysisPlaylist = slicePlaylistForAnalysis(playlist, limit);

      await updateJob(env, job, {
        phase: `Matching Apple Music (0/${analysisPlaylist.tracks.length})`,
        progress: 10,
        completed: 0,
        total: analysisPlaylist.tracks.length,
        playlistName: playlist.name,
        originalTotalItems: playlist.totalItems
      });

      const analysis = await analyzeSpotifyPlaylist(
        analysisPlaylist,
        createAppleMusicClient(env),
        {
          onTrackComplete: ({ completed, total }) => {
            Object.assign(job, {
              phase: `Matching Apple Music (${completed}/${total})`,
              completed,
              total,
              progress: Math.min(82, Math.round(10 + (completed / Math.max(total, 1)) * 72))
            });
          }
        }
      );

      serializedAnalysis = serializeAnalysis(
        analysis,
        playlistAnalysisMetadata(playlist, analysisPlaylist.tracks.length)
      );
    }

    const report = transferReportFromSerializedAnalysis(serializedAnalysis);
    const confidentCount = report.results.filter(
      (result) => result.matched && result.candidate && result.confidence >= 0.8
    ).length;

    await updateJob(env, job, {
      phase: `Creating Apple Music playlist with ${confidentCount} confident matches`,
      progress: 88,
      completed: confidentCount,
      total: confidentCount
    });

    const createdApplePlaylistId = await createApplePlaylistFromMatches({
      apple: createAppleMusicClient(env, { requireUserToken: true, userToken, storefront }),
      playlistName: report.playlistName,
      results: report.results,
      minConfidence: 0.8
    });

    const result = transferId
      ? await markTransferCreated(env, transferId, job.sessionId, createdApplePlaylistId, 0.8)
      : {
          ...serializedAnalysis,
          createdApplePlaylistId,
          createdFromConfidenceThreshold: 0.8
        };

    await updateJob(env, job, {
      status: "complete",
      phase: "Apple Music playlist created",
      progress: 100,
      result
    });
  } catch (error) {
    await updateJob(env, job, {
      status: "error",
      phase: "Playlist creation failed",
      progress: 100,
      error: errorMessage(error)
    });
  }
}

async function createBackgroundJob(context, kind, sessionId, body, runner) {
  const job = await createJob(context.env, kind, sessionId);
  const promise = runner(context.env, job, body);

  if (typeof context.waitUntil === "function") {
    context.waitUntil(promise);
  } else {
    void promise;
  }

  return noStoreJson(202, serializeJob(job));
}

async function handleAnalyzePublicJob(context, request) {
  const sessionId = requireSessionId(request);
  const body = await readJsonBody(request);
  return createBackgroundJob(context, "public-analysis", sessionId, body, runAnalyzeJob);
}

async function handleCreatePublicJob(context, request) {
  const sessionId = requireSessionId(request);
  const body = await readJsonBody(request);
  return createBackgroundJob(context, "public-create", sessionId, body, runCreateJob);
}

async function handleStoredCreateJob(context, request, transferId) {
  const sessionId = requireSessionId(request);
  const body = await readJsonBody(request);
  return createBackgroundJob(
    context,
    "stored-create",
    sessionId,
    {
      ...body,
      transferId
    },
    runCreateJob
  );
}

async function handleJobStatus(env, request, jobId) {
  const sessionId = requireSessionId(request);
  const job = await findJob(env, jobId, sessionId);

  if (!job) {
    return noStoreJson(404, {
      error: true,
      message: "Job not found."
    });
  }

  return noStoreJson(200, serializeJob(job));
}

async function handleGetTransfer(env, request, transferId) {
  const sessionId = requireSessionId(request);
  const transfer = await findTransfer(env, transferId, sessionId);

  if (!transfer) {
    return noStoreJson(404, {
      error: true,
      message: "Transfer not found for this session. It may have expired or was created in another browser session."
    });
  }

  return noStoreJson(200, transfer);
}

async function handlePatchTransferItem(env, request, transferId, itemIndex) {
  const sessionId = requireSessionId(request);
  const body = await readJsonBody(request);
  const transfer = await applyTransferItemDecision(env, transferId, sessionId, Number(itemIndex), body);
  return noStoreJson(200, transfer);
}

async function handleUsageEvent(request) {
  let body = {};
  try {
    body = await readJsonBody(request);
  } catch {
    // Analytics should not block product flows.
  }

  console.log(JSON.stringify({
    logType: "playlist_transfer_event",
    event: String(body.event ?? "unknown").slice(0, 80),
    observedAt: new Date().toISOString()
  }));

  return noStoreJson(202, { ok: true });
}

export function nativeApiIsConfigured(env) {
  return Boolean(env.PLAYLIST_TRANSFER_DB);
}

export async function handleNativeApiRequest(context) {
  const request = context.request;
  const method = request.method || "GET";
  const path = routePath(request);

  try {
    if (method === "GET" && path === "/api/apple-music/session") {
      return noStoreJson(200, appleMusicSessionPayload(context.env));
    }

    if (method === "POST" && path === "/api/apple-music/user-token") {
      const body = await readJsonBody(request);
      const userToken = String(body.userToken ?? body.musicUserToken ?? "").trim();
      if (!userToken) throw new Error("Missing Apple Music user token.");
      return noStoreJson(200, appleMusicSessionPayload(context.env, { hasUserToken: true }));
    }

    if (method === "POST" && path === "/api/events") {
      return handleUsageEvent(request);
    }

    if (method === "POST" && path === "/api/spotify/public-playlist-preview") {
      return await handlePublicPlaylistPreview(request);
    }

    if (method === "POST" && path === "/api/transfers/analyze-public-job") {
      return await handleAnalyzePublicJob(context, request);
    }

    if (method === "POST" && path === "/api/transfers/create-public-job") {
      return await handleCreatePublicJob(context, request);
    }

    const jobMatch = path.match(/^\/api\/jobs\/([^/]+)$/);
    if (method === "GET" && jobMatch) {
      return await handleJobStatus(context.env, request, decodeURIComponent(jobMatch[1]));
    }

    const transferItemMatch = path.match(/^\/api\/transfers\/([^/]+)\/items\/(\d+)$/);
    if (method === "PATCH" && transferItemMatch) {
      return await handlePatchTransferItem(
        context.env,
        request,
        decodeURIComponent(transferItemMatch[1]),
        Number(transferItemMatch[2])
      );
    }

    const transferCreateMatch = path.match(/^\/api\/transfers\/([^/]+)\/create-job$/);
    if (method === "POST" && transferCreateMatch) {
      return await handleStoredCreateJob(context, request, decodeURIComponent(transferCreateMatch[1]));
    }

    const transferMatch = path.match(/^\/api\/transfers\/([^/]+)$/);
    if (method === "GET" && transferMatch) {
      return await handleGetTransfer(context.env, request, decodeURIComponent(transferMatch[1]));
    }

    return noStoreJson(404, {
      error: true,
      message: "Not found"
    });
  } catch (error) {
    return handleError(error);
  }
}
