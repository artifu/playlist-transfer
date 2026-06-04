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
import { requireSessionId, sessionIdFromRequest, SESSION_HEADER } from "./session.js";
import { getPublicSpotifyPlaylist } from "./spotify-public.js";
import {
  analysisLimitFromBody,
  analyzeTrack,
  analyzeSpotifyPlaylist,
  createApplePlaylistFromMatches,
  playlistAnalysisMetadata,
  serializeAnalysis,
  serializeAnalysisItem,
  serializedAnalysisFromItems,
  slicePlaylistForAnalysis,
  transferReportFromSerializedAnalysis
} from "./transfer.js";

const ANALYSIS_CHUNK_SIZE = 2;

const ALLOWED_EVENTS = new Set([
  "apple_connect_started",
  "apple_connect_succeeded",
  "apple_connect_failed",
  "apple_disconnect_succeeded",
  "preview_started",
  "preview_succeeded",
  "preview_failed",
  "analysis_started",
  "analysis_succeeded",
  "analysis_failed",
  "review_decision_succeeded",
  "review_decision_failed",
  "transfer_create_started",
  "transfer_create_succeeded",
  "transfer_create_failed"
]);

const SAFE_EVENT_PROPERTY_KEYS = new Set([
  "appleConnected",
  "analysisLimit",
  "candidateIndex",
  "durationMs",
  "errorCategory",
  "errorMessage",
  "hasDeveloperToken",
  "host",
  "itemIndex",
  "matchRate",
  "missingCount",
  "path",
  "playlistId",
  "playlistSource",
  "readableTracks",
  "readyCount",
  "reviewAction",
  "reviewCount",
  "totalTracks",
  "transferId",
  "withIsrcCount"
]);

function routePath(request) {
  return new URL(request.url).pathname;
}

function transferInputFromBody(body) {
  return body.input ?? body.playlistUrl ?? body.playlistId ?? "";
}

function noStoreJson(status, payload) {
  return jsonResponse(status, payload);
}

function scrubEventString(value) {
  return String(value ?? "")
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/spotify:playlist:[A-Za-z0-9]+/gi, "spotify:playlist:[id]")
    .replace(/[A-Za-z0-9_-]{80,}/g, "[redacted]")
    .slice(0, 240);
}

function safeEventScalar(value) {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return scrubEventString(value);
  return null;
}

function safeEventProperties(rawProperties) {
  if (!rawProperties || typeof rawProperties !== "object" || Array.isArray(rawProperties)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(rawProperties)
      .filter(([key]) => SAFE_EVENT_PROPERTY_KEYS.has(key))
      .map(([key, value]) => [key, safeEventScalar(value)])
      .filter(([, value]) => value !== null)
  );
}

async function sessionHash(sessionId, salt = "playlist-transfer-v1") {
  const normalizedSessionId = String(sessionId || "").trim();
  if (!normalizedSessionId) return null;

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${salt}:${normalizedSessionId}`)
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
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

function analysisProgress(completed, total) {
  return Math.min(95, Math.round(10 + (completed / Math.max(total, 1)) * 85));
}

function createAnalyzeState(input, limit, playlist, analysisPlaylist) {
  return {
    mode: "cloudflare-chunked-analysis-v1",
    input,
    limit,
    playlist: {
      id: playlist.id,
      name: playlist.name
    },
    playlistExtra: playlistAnalysisMetadata(playlist, analysisPlaylist.tracks.length),
    tracks: analysisPlaylist.tracks,
    items: [],
    nextIndex: 0
  };
}

function enqueueAnalyzeJobRun(context, jobId, sessionId) {
  const url = new URL(`/api/jobs/${encodeURIComponent(jobId)}/run`, context.request.url);
  const promise = fetch(url.toString(), {
    method: "POST",
    headers: {
      [SESSION_HEADER]: sessionId
    }
  }).catch((error) => {
    console.error("analysis_chunk_enqueue_failed", error);
  });

  if (typeof context.waitUntil === "function") {
    context.waitUntil(promise);
  }
}

async function initializeChunkedAnalyzeJob(context, job, body) {
  const input = transferInputFromBody(body);
  const limit = analysisLimitFromBody(body);

  try {
    await updateJob(context.env, job, {
      status: "running",
      phase: "Reading public Spotify playlist",
      progress: 4
    });

    const playlist = await getPublicSpotifyPlaylist(input);
    const analysisPlaylist = slicePlaylistForAnalysis(playlist, limit);
    const state = createAnalyzeState(input, limit, playlist, analysisPlaylist);

    await updateJob(context.env, job, {
      phase: `Matching Apple Music (0/${analysisPlaylist.tracks.length})`,
      progress: 10,
      completed: 0,
      total: analysisPlaylist.tracks.length,
      playlistName: playlist.name,
      originalTotalItems: playlist.totalItems,
      result: state
    });

    enqueueAnalyzeJobRun(context, job.id, job.sessionId);
  } catch (error) {
    await updateJob(context.env, job, {
      status: "error",
      phase: "Analysis failed",
      progress: 100,
      error: errorMessage(error)
    });
  }
}

async function completeChunkedAnalyzeJob(env, job, state) {
  const items = state.items.filter(Boolean);
  const serializedAnalysis = serializedAnalysisFromItems(
    state.playlist,
    items,
    state.playlistExtra
  );
  const transfer = await createTransfer(env, {
    sessionId: job.sessionId,
    input: state.input,
    analysisLimit: state.limit,
    analysis: serializedAnalysis
  });

  await updateJob(env, job, {
    status: "complete",
    phase: "Analysis complete",
    progress: 100,
    completed: items.length,
    total: items.length,
    result: transfer
  });
}

async function continueChunkedAnalyzeJob(context, request, jobId) {
  const sessionId = requireSessionId(request);
  const job = await findJob(context.env, jobId, sessionId);

  if (!job) {
    return noStoreJson(404, {
      error: true,
      message: "Job not found."
    });
  }

  if (job.status !== "running") {
    return noStoreJson(200, serializeJob(job));
  }

  const state = job.result;
  if (state?.mode !== "cloudflare-chunked-analysis-v1") {
    throw new Error("This job cannot be resumed by the Cloudflare chunk runner.");
  }

  try {
    const apple = createAppleMusicClient(context.env);
    let processed = 0;

    while (state.nextIndex < state.tracks.length && processed < ANALYSIS_CHUNK_SIZE) {
      const index = state.nextIndex;
      const track = state.tracks[index];
      state.nextIndex += 1;
      processed += 1;

      if (!track) continue;

      const result = await analyzeTrack(track, apple);
      state.items[index] = serializeAnalysisItem(result, index);
      state.tracks[index] = null;
    }

    const completed = state.items.filter(Boolean).length;

    if (state.nextIndex >= state.tracks.length) {
      await completeChunkedAnalyzeJob(context.env, job, state);
      return noStoreJson(200, serializeJob(job));
    }

    await updateJob(context.env, job, {
      phase: `Matching Apple Music (${completed}/${state.tracks.length})`,
      progress: analysisProgress(completed, state.tracks.length),
      completed,
      total: state.tracks.length,
      result: state
    });

    enqueueAnalyzeJobRun(context, job.id, job.sessionId);
    return noStoreJson(202, serializeJob(job));
  } catch (error) {
    await updateJob(context.env, job, {
      status: "error",
      phase: "Analysis failed",
      progress: 100,
      error: errorMessage(error)
    });
    return noStoreJson(200, serializeJob(job));
  }
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
  const job = await createJob(context.env, "public-analysis", sessionId);
  await initializeChunkedAnalyzeJob(context, job, body);
  return noStoreJson(202, serializeJob(job));
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

async function handleJobStatus(context, request, jobId) {
  const sessionId = requireSessionId(request);
  const job = await findJob(context.env, jobId, sessionId);

  if (!job) {
    return noStoreJson(404, {
      error: true,
      message: "Job not found."
    });
  }

  if (job.status === "running" && job.result?.mode === "cloudflare-chunked-analysis-v1") {
    return continueChunkedAnalyzeJob(context, request, jobId);
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

async function handleUsageEvent(env, request) {
  let body = {};
  try {
    body = await readJsonBody(request);
  } catch {
    // Analytics should not block product flows.
  }

  const event = String(body.event ?? "unknown").trim();
  console.log(JSON.stringify({
    logType: "playlist_transfer_event",
    event: ALLOWED_EVENTS.has(event) ? event : "unknown",
    anonymousSession: await sessionHash(sessionIdFromRequest(request), env.TRANSFER_API_ANALYTICS_SALT),
    observedAt: new Date().toISOString(),
    properties: ALLOWED_EVENTS.has(event) ? safeEventProperties(body.properties) : {}
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
      return handleUsageEvent(context.env, request);
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

    const jobRunMatch = path.match(/^\/api\/jobs\/([^/]+)\/run$/);
    if (method === "POST" && jobRunMatch) {
      return await continueChunkedAnalyzeJob(context, request, decodeURIComponent(jobRunMatch[1]));
    }

    const jobMatch = path.match(/^\/api\/jobs\/([^/]+)$/);
    if (method === "GET" && jobMatch) {
      return await handleJobStatus(context, request, decodeURIComponent(jobMatch[1]));
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
