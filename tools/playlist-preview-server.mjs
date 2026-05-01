import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { loadAppleMusicConfig, loadSpotifyConfig } from "../dist/config.js";
import { HttpError } from "../dist/lib/http.js";
import { parseSpotifyPlaylistInput } from "../dist/lib/spotify-url.js";
import { AppleMusicClient } from "../dist/providers/apple.js";
import { SpotifyClient } from "../dist/providers/spotify.js";
import { getPublicSpotifyPlaylist } from "../dist/providers/spotify-public.js";
import { analyzeSpotifyPlaylist, analyzeTransfer } from "../dist/transfer/analyze-transfer.js";
import { createApplePlaylistFromMatches } from "../dist/transfer/create-apple-playlist.js";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 8790);
const DEFAULT_PUBLIC_ANALYSIS_LIMIT = 50;
const MAX_PUBLIC_ANALYSIS_LIMIT = 500;
const JOB_RETENTION_MS = 10 * 60 * 1000;
const jobs = new Map();

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

function serializeAnalysis(analysis, playlistExtra = {}, options = {}) {
  const candidateLimit = options.candidateLimit ?? 3;
  const items = analysis.results.map((result, index) => ({
    index: index + 1,
    status: matchStatus(result),
    source: result.source,
    confidence: result.confidence,
    reason: result.reason,
    appleCandidate: result.candidate,
    searchTerm: result.searchTerm,
    candidateCount: result.candidates?.length ?? 0,
    candidates: (result.candidates ?? []).slice(0, candidateLimit)
  }));

  return {
    playlist: {
      id: analysis.playlistId,
      name: analysis.playlistName,
      totalItems: analysis.results.length,
      ...playlistExtra
    },
    summary: {
      matchedCount: analysis.matchedCount,
      unmatchedCount: analysis.unmatchedCount,
      needsReviewCount: items.filter((item) => item.status === "needs_review").length,
      confidentMatchCount: items.filter((item) => item.status === "matched").length,
      matchRate: analysis.matchRate
    },
    items
  };
}

function transferReportFromSerializedAnalysis(serializedAnalysis) {
  return {
    playlistName: serializedAnalysis.playlist.name,
    playlistId: serializedAnalysis.playlist.id,
    matchedCount: serializedAnalysis.summary.matchedCount,
    unmatchedCount: serializedAnalysis.summary.unmatchedCount,
    matchRate: serializedAnalysis.summary.matchRate,
    results: serializedAnalysis.items.map((item) => ({
      source: item.source,
      matched: item.status !== "unmatched" && Boolean(item.appleCandidate),
      confidence: item.confidence,
      reason: item.reason,
      candidate: item.appleCandidate,
      searchTerm: item.searchTerm,
      candidates: item.candidates ?? []
    }))
  };
}

function numberFromBody(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function analysisLimitFromBody(body) {
  return Math.min(
    numberFromBody(body.limit ?? body.analysisLimit, DEFAULT_PUBLIC_ANALYSIS_LIMIT),
    MAX_PUBLIC_ANALYSIS_LIMIT
  );
}

function slicePlaylistForAnalysis(playlist, limit) {
  const tracks = playlist.tracks.slice(0, limit);

  return {
    ...playlist,
    totalItems: tracks.length,
    tracks
  };
}

function playlistAnalysisMetadata(playlist, analyzedTrackCount) {
  return {
    source: playlist.source,
    limitations: playlist.limitations,
    originalTotalItems: playlist.totalItems,
    analyzedTrackCount,
    partialAnalysis: analyzedTrackCount < playlist.totalItems
  };
}

function createJob(kind) {
  const job = {
    id: randomUUID(),
    kind,
    status: "queued",
    phase: "Queued",
    progress: 0,
    completed: 0,
    total: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    result: null,
    error: null
  };

  jobs.set(job.id, job);
  setTimeout(() => {
    jobs.delete(job.id);
  }, JOB_RETENTION_MS).unref();

  return job;
}

function updateJob(job, patch) {
  Object.assign(job, patch, {
    updatedAt: new Date().toISOString()
  });
}

function serializeJob(job) {
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    phase: job.phase,
    progress: job.progress,
    completed: job.completed,
    total: job.total,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    result: job.result,
    error: job.error
  };
}

async function runPublicTransferAnalyzeJob(job, body) {
  const input = body.input ?? body.playlistUrl ?? body.playlistId ?? "";
  const limit = analysisLimitFromBody(body);

  try {
    updateJob(job, {
      status: "running",
      phase: "Reading public Spotify playlist",
      progress: 4
    });

    const playlist = await getPublicSpotifyPlaylist(input);
    const analysisPlaylist = slicePlaylistForAnalysis(playlist, limit);

    updateJob(job, {
      phase: `Matching Apple Music (0/${analysisPlaylist.tracks.length})`,
      progress: 10,
      completed: 0,
      total: analysisPlaylist.tracks.length,
      playlistName: playlist.name,
      originalTotalItems: playlist.totalItems
    });

    const analysis = await analyzeSpotifyPlaylist(
      analysisPlaylist,
      createAppleMusicClient(),
      {
        onTrackComplete: ({ completed, total }) => {
          updateJob(job, {
            phase: `Matching Apple Music (${completed}/${total})`,
            completed,
            total,
            progress: Math.min(95, Math.round(10 + (completed / Math.max(total, 1)) * 85))
          });
        }
      }
    );

    updateJob(job, {
      status: "complete",
      phase: "Analysis complete",
      progress: 100,
      result: serializeAnalysis(
        analysis,
        playlistAnalysisMetadata(playlist, analysisPlaylist.tracks.length)
      )
    });
  } catch (error) {
    updateJob(job, {
      status: "error",
      phase: "Analysis failed",
      progress: 100,
      error: errorMessage(error)
    });
  }
}

async function runPublicTransferCreateJob(job, body) {
  const input = body.input ?? body.playlistUrl ?? body.playlistId ?? "";
  const limit = analysisLimitFromBody(body);

  try {
    let serializedAnalysis = body.analysis ?? null;

    if (!serializedAnalysis) {
      updateJob(job, {
        status: "running",
        phase: "Analyzing before creation",
        progress: 4
      });

      const playlist = await getPublicSpotifyPlaylist(input);
      const analysisPlaylist = slicePlaylistForAnalysis(playlist, limit);

      updateJob(job, {
        phase: `Matching Apple Music (0/${analysisPlaylist.tracks.length})`,
        progress: 10,
        completed: 0,
        total: analysisPlaylist.tracks.length,
        playlistName: playlist.name,
        originalTotalItems: playlist.totalItems
      });

      const analysis = await analyzeSpotifyPlaylist(
        analysisPlaylist,
        createAppleMusicClient(),
        {
          onTrackComplete: ({ completed, total }) => {
            updateJob(job, {
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
    } else {
      updateJob(job, {
        status: "running",
        phase: "Using reviewed analysis",
        progress: 72,
        completed: serializedAnalysis.items?.length ?? 0,
        total: serializedAnalysis.items?.length ?? 0
      });
    }

    const report = transferReportFromSerializedAnalysis(serializedAnalysis);
    const confidentCount = report.results.filter(
      (result) => result.matched && result.candidate && result.confidence >= 0.8
    ).length;

    updateJob(job, {
      phase: `Creating Apple Music playlist with ${confidentCount} confident matches`,
      progress: 88,
      completed: confidentCount,
      total: confidentCount
    });

    const createdApplePlaylistId = await createApplePlaylistFromMatches({
      apple: createAppleMusicClient(),
      playlistName: report.playlistName,
      results: report.results,
      minConfidence: 0.8
    });

    updateJob(job, {
      status: "complete",
      phase: "Apple Music playlist created",
      progress: 100,
      result: {
        ...serializedAnalysis,
        createdApplePlaylistId,
        createdFromConfidenceThreshold: 0.8
      }
    });
  } catch (error) {
    updateJob(job, {
      status: "error",
      phase: "Playlist creation failed",
      progress: 100,
      error: errorMessage(error)
    });
  }
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
    sendJson(response, 200, serializeAnalysis(analysis));
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
    const limit = analysisLimitFromBody(body);
    const playlist = await getPublicSpotifyPlaylist(input);
    const analysisPlaylist = slicePlaylistForAnalysis(playlist, limit);
    const analysis = await analyzeSpotifyPlaylist(analysisPlaylist, createAppleMusicClient());

    sendJson(response, 200, {
      ...serializeAnalysis(analysis, playlistAnalysisMetadata(playlist, analysisPlaylist.tracks.length))
    });
  } catch (error) {
    sendJson(response, statusForError(error), {
      error: true,
      message: errorMessage(error)
    });
  }
}

async function handlePublicTransferAnalyzeJob(request, response) {
  try {
    const body = await readJsonBody(request);
    const job = createJob("public-analysis");

    runPublicTransferAnalyzeJob(job, body);
    sendJson(response, 202, serializeJob(job));
  } catch (error) {
    sendJson(response, statusForError(error), {
      error: true,
      message: errorMessage(error)
    });
  }
}

async function handlePublicTransferCreateJob(request, response) {
  try {
    const body = await readJsonBody(request);
    const job = createJob("public-create");

    runPublicTransferCreateJob(job, body);
    sendJson(response, 202, serializeJob(job));
  } catch (error) {
    sendJson(response, statusForError(error), {
      error: true,
      message: errorMessage(error)
    });
  }
}

function handleJobStatus(jobId, response) {
  const job = jobs.get(jobId);
  if (!job) {
    sendJson(response, 404, {
      error: true,
      message: "Job not found."
    });
    return;
  }

  sendJson(response, 200, serializeJob(job));
}

async function handlePublicTransferCreate(request, response) {
  try {
    const body = await readJsonBody(request);
    const input = body.input ?? body.playlistUrl ?? body.playlistId ?? "";
    const limit = analysisLimitFromBody(body);
    const playlist = await getPublicSpotifyPlaylist(input);
    const analysisPlaylist = slicePlaylistForAnalysis(playlist, limit);
    const apple = createAppleMusicClient();
    const analysis = await analyzeSpotifyPlaylist(analysisPlaylist, apple);
    const createdApplePlaylistId = await createApplePlaylistFromMatches({
      apple,
      playlistName: analysis.playlistName,
      results: analysis.results,
      minConfidence: 0.8
    });

    sendJson(response, 200, {
      ...serializeAnalysis(analysis, playlistAnalysisMetadata(playlist, analysisPlaylist.tracks.length)),
      createdApplePlaylistId,
      createdFromConfidenceThreshold: 0.8
    });
  } catch (error) {
    sendJson(response, statusForError(error), {
      error: true,
      message: errorMessage(error)
    });
  }
}

function renderMvpPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PlaylistTransfer MVP</title>
  <style>
    :root {
      --ink: #20160f;
      --paper: #fff7e8;
      --card: rgba(255, 252, 242, 0.9);
      --line: rgba(32, 22, 15, 0.14);
      --muted: #796d5f;
      --tomato: #ff5b43;
      --sun: #ffc94a;
      --sage: #b8d889;
      --mint: #dff2c7;
      --blue: #315f72;
      --shadow: 0 24px 70px rgba(77, 48, 23, 0.16);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--ink);
      font-family: "Avenir Next", "Gill Sans", "Trebuchet MS", sans-serif;
      background:
        radial-gradient(circle at 12% 10%, rgba(255, 201, 74, 0.52), transparent 28rem),
        radial-gradient(circle at 88% 6%, rgba(184, 216, 137, 0.65), transparent 26rem),
        linear-gradient(135deg, #fffaf0 0%, #f8ead5 46%, #eef4d4 100%);
      min-height: 100vh;
    }
    body::before {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      background-image:
        linear-gradient(rgba(32, 22, 15, 0.035) 1px, transparent 1px),
        linear-gradient(90deg, rgba(32, 22, 15, 0.035) 1px, transparent 1px);
      background-size: 34px 34px;
      mask-image: linear-gradient(to bottom, black, transparent 84%);
    }
    main { width: min(1160px, calc(100% - 28px)); margin: 0 auto; padding: 24px 0 54px; }
    .hero {
      display: grid;
      grid-template-columns: 1.08fr 0.92fr;
      gap: 20px;
      align-items: stretch;
      margin-top: 10px;
    }
    .panel {
      border: 1px solid var(--line);
      border-radius: 30px;
      background: var(--card);
      box-shadow: var(--shadow);
      backdrop-filter: blur(18px);
    }
    .intro { padding: clamp(24px, 5vw, 52px); position: relative; overflow: hidden; }
    .intro::after {
      content: "";
      position: absolute;
      width: 180px;
      height: 180px;
      right: -54px;
      bottom: -54px;
      border-radius: 999px;
      background: repeating-linear-gradient(45deg, rgba(255, 91, 67, 0.25), rgba(255, 91, 67, 0.25) 10px, transparent 10px, transparent 20px);
    }
    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border: 1px solid rgba(32, 22, 15, 0.16);
      border-radius: 999px;
      padding: 7px 11px;
      background: #fffdf6;
      color: var(--blue);
      font-weight: 800;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      font-size: 12px;
    }
    h1 {
      margin: 18px 0 14px;
      max-width: 780px;
      font-family: Charter, Georgia, serif;
      font-size: clamp(42px, 8vw, 84px);
      line-height: 0.92;
      letter-spacing: -0.06em;
    }
    p { color: var(--muted); line-height: 1.55; }
    .lead { max-width: 650px; font-size: clamp(17px, 2.4vw, 22px); }
    .recipe {
      display: grid;
      gap: 12px;
      padding: 20px;
    }
    .step-card {
      padding: 18px;
      border-radius: 22px;
      background: #fffdf6;
      border: 1px solid var(--line);
    }
    .step-card strong { display: block; font-size: 16px; }
    .step-card span { display: block; margin-top: 4px; color: var(--muted); font-size: 14px; line-height: 1.4; }
    .workspace {
      display: grid;
      grid-template-columns: minmax(0, 0.88fr) minmax(0, 1.12fr);
      gap: 18px;
      margin-top: 18px;
    }
    .import-card { padding: 22px; position: sticky; top: 16px; align-self: start; }
    label { display: block; font-weight: 850; margin-bottom: 10px; }
    .input-row { display: grid; gap: 10px; }
    input {
      width: 100%;
      min-height: 54px;
      border: 1px solid rgba(32, 22, 15, 0.18);
      border-radius: 17px;
      padding: 0 16px;
      font: inherit;
      color: var(--ink);
      background: #fffdf8;
      outline: none;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.8);
    }
    input:focus { border-color: rgba(255, 91, 67, 0.75); box-shadow: 0 0 0 4px rgba(255, 91, 67, 0.14); }
    .button-grid { display: grid; grid-template-columns: 1fr; gap: 10px; margin-top: 14px; }
    .option-row {
      display: grid;
      gap: 8px;
      margin-top: 14px;
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: 18px;
      background: rgba(255, 253, 246, 0.58);
    }
    .option-row label { margin: 0; font-size: 13px; color: var(--blue); }
    select {
      width: 100%;
      min-height: 44px;
      border: 1px solid rgba(32, 22, 15, 0.18);
      border-radius: 14px;
      padding: 0 12px;
      font: inherit;
      font-weight: 800;
      color: var(--ink);
      background: #fffdf8;
    }
    button {
      border: 0;
      border-radius: 17px;
      min-height: 52px;
      padding: 0 16px;
      font: inherit;
      font-weight: 900;
      cursor: pointer;
      color: var(--ink);
      transition: transform 160ms ease, opacity 160ms ease, box-shadow 160ms ease;
    }
    button:hover:not(:disabled) { transform: translateY(-1px); }
    button:disabled { opacity: 0.48; cursor: wait; transform: none; }
    .primary { background: var(--tomato); color: #fffaf1; box-shadow: 0 12px 24px rgba(255, 91, 67, 0.24); }
    .secondary { background: var(--sun); }
    .safe { background: var(--sage); }
    .ghost { background: #fffdf6; border: 1px solid var(--line); color: var(--blue); }
    #status {
      min-height: 24px;
      margin: 14px 0 0;
      font-weight: 800;
      color: var(--blue);
    }
    #status.error { color: #b3271b; }
    .progress-shell {
      display: none;
      margin-top: 12px;
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: 18px;
      background: rgba(255, 253, 246, 0.72);
    }
    .progress-shell.active { display: block; }
    .progress-top {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      color: var(--blue);
      font-size: 13px;
      font-weight: 900;
    }
    .progress-track {
      position: relative;
      height: 12px;
      overflow: hidden;
      margin-top: 9px;
      border-radius: 999px;
      background: rgba(32, 22, 15, 0.09);
    }
    .progress-bar {
      width: 0%;
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, var(--tomato), var(--sun), var(--sage));
      transition: width 260ms ease;
    }
    .progress-detail {
      margin: 8px 0 0;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.35;
    }
    .result-card { padding: 22px; min-height: 460px; }
    .empty {
      min-height: 380px;
      display: grid;
      place-items: center;
      text-align: center;
      color: var(--muted);
      border: 1px dashed rgba(32, 22, 15, 0.18);
      border-radius: 24px;
      background: rgba(255, 255, 255, 0.34);
    }
    .summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 16px 0; }
    .metric {
      padding: 14px;
      border-radius: 18px;
      background: #fffdf6;
      border: 1px solid var(--line);
    }
    .metric b { display: block; font-size: 25px; line-height: 1; }
    .metric span { color: var(--muted); font-size: 12px; font-weight: 850; text-transform: uppercase; letter-spacing: 0.04em; }
    .source-note {
      border-left: 5px solid var(--sage);
      background: rgba(223, 242, 199, 0.55);
      border-radius: 16px;
      padding: 12px 14px;
      color: var(--blue);
      font-weight: 750;
      line-height: 1.4;
    }
    .table-wrap { overflow: auto; border: 1px solid var(--line); border-radius: 22px; margin-top: 16px; background: #fffdf6; }
    table { width: 100%; border-collapse: collapse; min-width: 720px; }
    th, td { padding: 12px 14px; border-bottom: 1px solid rgba(32, 22, 15, 0.09); text-align: left; vertical-align: top; font-size: 14px; }
    th { color: var(--muted); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; background: rgba(255, 201, 74, 0.13); }
    tr:last-child td { border-bottom: 0; }
    .track { font-weight: 900; }
    .meta, .mono { color: var(--muted); }
    .mono { font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 12px; }
    .badge { display: inline-flex; border-radius: 999px; padding: 5px 9px; font-size: 11px; font-weight: 950; text-transform: uppercase; white-space: nowrap; }
    .matched { background: var(--mint); color: #30510f; }
    .needs_review { background: #fff0bc; color: #815806; }
    .unmatched { background: #ffe0db; color: #a53022; }
    .fallback { margin-top: 18px; padding: 22px; }
    .fallback h2, .result-card h2 { margin: 0 0 8px; font-family: Charter, Georgia, serif; font-size: clamp(28px, 4vw, 42px); letter-spacing: -0.04em; }
    .fallback-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 14px; }
    .fallback-card { background: #fffdf6; border: 1px solid var(--line); border-radius: 22px; padding: 16px; }
    .fallback-card b { display: block; margin-bottom: 8px; }
    .fallback-card ol { margin: 0; padding-left: 20px; color: var(--muted); line-height: 1.55; }
    details { margin-top: 16px; }
    summary { cursor: pointer; color: var(--blue); font-weight: 900; }
    .dev-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
    @media (max-width: 860px) {
      main { width: min(100% - 20px, 620px); padding-top: 10px; }
      .hero, .workspace, .fallback-grid { grid-template-columns: 1fr; }
      .recipe { padding: 14px; }
      .import-card { position: static; }
      .summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      h1 { font-size: clamp(42px, 15vw, 72px); }
      .dev-actions { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <div class="panel intro">
        <span class="eyebrow">No Spotify login first</span>
        <h1>Turn a Spotify link into an Apple Music playlist.</h1>
        <p class="lead">Paste a public playlist link, verify what we can read, review Apple Music matches, then create the destination playlist from confident matches only.</p>
      </div>
      <aside class="panel recipe" aria-label="MVP flow">
        <div class="step-card"><strong>1. Import public link</strong><span>Uses Spotify public embed metadata and falls back cleanly if Spotify blocks the link.</span></div>
        <div class="step-card"><strong>2. Match before writing</strong><span>Shows matched, needs review, and unmatched rows before touching Apple Music.</span></div>
        <div class="step-card"><strong>3. Create safely</strong><span>Writes only confident matches. Risky matches stay in the report.</span></div>
      </aside>
    </section>

    <section class="workspace">
      <section class="panel import-card">
        <label for="playlist-input">Spotify playlist link</label>
        <div class="input-row">
          <input id="playlist-input" autocomplete="off" placeholder="https://open.spotify.com/playlist/..." />
        </div>
        <div class="button-grid">
          <button id="preview-public" class="primary">Preview public link</button>
          <button id="analyze-public" class="secondary" disabled>Analyze Apple matches</button>
          <button id="create-public" class="safe" disabled>Create Apple playlist</button>
        </div>
        <div class="option-row">
          <label for="analysis-limit">Analysis size</label>
          <select id="analysis-limit">
            <option value="50" selected>Fast sample: first 50 tracks</option>
            <option value="100">Bigger sample: first 100 tracks</option>
            <option value="500">Full playlist: up to 500 tracks</option>
          </select>
        </div>
        <div id="status"></div>
        <div id="progress-shell" class="progress-shell" aria-live="polite">
          <div class="progress-top">
            <span id="progress-phase">Preparing</span>
            <span id="progress-percent">0%</span>
          </div>
          <div class="progress-track">
            <div id="progress-bar" class="progress-bar"></div>
          </div>
          <p id="progress-detail" class="progress-detail">Waiting to start.</p>
        </div>
        <details>
          <summary>Developer comparison tools</summary>
          <div class="dev-actions">
            <button id="preview-api" class="ghost">Preview API path</button>
            <button id="analyze-api" class="ghost">Analyze API path</button>
          </div>
        </details>
      </section>

      <section class="panel result-card">
        <div id="result" class="empty">
          <div>
            <strong>Paste a link to start.</strong>
            <p>We will show the playlist contents before asking Apple Music to do anything.</p>
          </div>
        </div>
      </section>
    </section>

    <section id="fallback" class="panel fallback" hidden>
      <h2>If Spotify blocks the link</h2>
      <p>The mobile-friendly fallback is not file export. It is helping the user create a public, normal playlist link that can be imported.</p>
      <div class="fallback-grid">
        <div class="fallback-card">
          <b>I own this playlist</b>
          <ol><li>Open it in Spotify.</li><li>Tap the three dots.</li><li>Make it public or add it to profile.</li><li>Share the link again.</li></ol>
        </div>
        <div class="fallback-card">
          <b>Someone shared it with me</b>
          <ol><li>Open it in Spotify.</li><li>Add it to a new playlist in your account.</li><li>Make the new playlist public.</li><li>Share the new link.</li></ol>
        </div>
        <div class="fallback-card">
          <b>Still blocked</b>
          <ol><li>Use Spotify Desktop later.</li><li>Export/copy the track list.</li><li>Import text or CSV in the next product phase.</li></ol>
        </div>
      </div>
    </section>
  </main>

  <script>
    const input = document.querySelector("#playlist-input");
    const status = document.querySelector("#status");
    const result = document.querySelector("#result");
    const fallback = document.querySelector("#fallback");
    const analysisLimit = document.querySelector("#analysis-limit");
    const progressShell = document.querySelector("#progress-shell");
    const progressPhase = document.querySelector("#progress-phase");
    const progressPercent = document.querySelector("#progress-percent");
    const progressBar = document.querySelector("#progress-bar");
    const progressDetail = document.querySelector("#progress-detail");
    const buttons = {
      previewPublic: document.querySelector("#preview-public"),
      analyzePublic: document.querySelector("#analyze-public"),
      createPublic: document.querySelector("#create-public"),
      previewApi: document.querySelector("#preview-api"),
      analyzeApi: document.querySelector("#analyze-api")
    };
    let lastPreview = null;
    let lastAnalysis = null;

    function esc(value) {
      return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
    }
    function duration(ms) {
      if (!ms) return "";
      const seconds = Math.round(ms / 1000);
      return Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
    }
    function pct(value) {
      return typeof value === "number" ? Math.round(value * 100) + "%" : "";
    }
    function setBusy(isBusy, message) {
      Object.values(buttons).forEach((button) => button.disabled = isBusy || button.dataset.locked === "true");
      if (!isBusy) {
        buttons.analyzePublic.disabled = !lastPreview;
        buttons.createPublic.disabled = !lastAnalysis;
      }
      status.className = "";
      status.textContent = message || "";
    }
    function setProgress(job) {
      const progress = Math.max(0, Math.min(100, Number(job.progress || 0)));
      progressShell.classList.add("active");
      progressPhase.textContent = job.phase || "Working";
      progressPercent.textContent = progress + "%";
      progressBar.style.width = progress + "%";
      progressDetail.textContent = job.total
        ? job.completed + " of " + job.total + " tracks processed."
        : "Preparing the playlist and match job.";
    }
    function resetProgress() {
      progressShell.classList.remove("active");
      progressPhase.textContent = "Preparing";
      progressPercent.textContent = "0%";
      progressBar.style.width = "0%";
      progressDetail.textContent = "Waiting to start.";
    }
    async function postJson(endpoint, value, options = {}) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: value, ...options })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Request failed.");
      return data;
    }
    async function startJob(endpoint, value, options = {}) {
      const job = await postJson(endpoint, value, options);
      setProgress(job);

      while (true) {
        await new Promise((resolve) => setTimeout(resolve, 650));
        const response = await fetch("/api/jobs/" + encodeURIComponent(job.id));
        const current = await response.json();
        if (!response.ok) throw new Error(current.message || "Could not read job progress.");
        setProgress(current);

        if (current.status === "complete") return current.result;
        if (current.status === "error") throw new Error(current.error || "Job failed.");
      }
    }
    function sourceNote(data) {
      const source = data.playlist.source ? "<div class='source-note'>Source: " + esc(data.playlist.source) + ". " + esc((data.playlist.limitations || [])[0] || "") + "</div>" : "";
      return source;
    }
    function rowsNote(total, rendered) {
      return total > rendered ? "<p class='meta'>Showing first " + rendered + " rows in the prototype UI. The backend response contains all " + total + " rows.</p>" : "";
    }
    function selectedAnalysisLabel() {
      return analysisLimit.options[analysisLimit.selectedIndex]?.textContent || "selected tracks";
    }
    function partialNote(data) {
      if (!data.playlist.partialAnalysis) return "";
      return "<div class='source-note'>Fast sample mode: analyzed " + data.playlist.analyzedTrackCount + " of " + data.playlist.originalTotalItems + " readable tracks. Use “Full playlist” when you are ready to wait.</div>";
    }
    function renderPreview(data) {
      const renderedTracks = data.tracks.slice(0, 140);
      const rows = renderedTracks.map((track, index) =>
        "<tr><td>" + (index + 1) + "</td><td><div class='track'>" + esc(track.name) + "</div><div class='meta'>" + esc(track.artists.join(", ")) + "</div></td><td>" + esc(track.album || "") + "</td><td>" + duration(track.durationMs) + "</td><td class='mono'>" + esc(track.isrc || "") + "</td></tr>"
      ).join("");
      result.className = "";
      result.innerHTML =
        "<h2>" + esc(data.playlist.name) + "</h2>" +
        "<p class='meta'>Spotify ID " + esc(data.playlist.id) + "</p>" +
        "<div class='summary'><div class='metric'><b>" + data.tracks.length + "</b><span>Readable tracks</span></div><div class='metric'><b>" + esc(data.playlist.source || "public") + "</b><span>Import path</span></div><div class='metric'><b>" + data.tracks.filter((track) => track.isrc).length + "</b><span>With ISRC</span></div><div class='metric'><b>" + data.tracks.filter((track) => track.album).length + "</b><span>With album</span></div></div>" +
        sourceNote(data) +
        rowsNote(data.tracks.length, renderedTracks.length) +
        "<div class='table-wrap'><table><thead><tr><th>#</th><th>Song</th><th>Album</th><th>Time</th><th>ISRC</th></tr></thead><tbody>" + rows + "</tbody></table></div>";
    }
    function renderAnalysis(data, createdApplePlaylistId) {
      const renderedItems = data.items.slice(0, 160);
      const rows = renderedItems.map((item) => {
        const source = item.source;
        const candidate = item.appleCandidate;
        const apple = candidate ? "<div class='track'>" + esc(candidate.name) + "</div><div class='meta'>" + esc(candidate.artistName) + "</div><div class='mono'>" + esc(candidate.albumName || "") + "</div>" : "<span class='mono'>No candidate selected</span>";
        return "<tr><td>" + item.index + "</td><td><span class='badge " + esc(item.status) + "'>" + esc(item.status.replaceAll("_", " ")) + "</span></td><td><div class='track'>" + esc(source.name) + "</div><div class='meta'>" + esc(source.artists.join(", ")) + "</div><div class='mono'>" + esc(source.album || "") + "</div></td><td>" + apple + "</td><td>" + pct(item.confidence) + "</td><td class='mono'>" + esc(item.reason || "") + "</td></tr>";
      }).join("");
      const created = createdApplePlaylistId ? "<div class='source-note'>Created Apple Music playlist: <span class='mono'>" + esc(createdApplePlaylistId) + "</span>. Only confident matches were added. Open Apple Music to see it in your library.</div>" : "";
      result.className = "";
      result.innerHTML =
        "<h2>" + esc(data.playlist.name) + "</h2>" +
        "<div class='summary'><div class='metric'><b>" + data.summary.confidentMatchCount + "</b><span>Ready</span></div><div class='metric'><b>" + data.summary.needsReviewCount + "</b><span>Review</span></div><div class='metric'><b>" + data.summary.unmatchedCount + "</b><span>Missing</span></div><div class='metric'><b>" + pct(data.summary.matchRate) + "</b><span>Any match</span></div></div>" +
        created +
        partialNote(data) +
        sourceNote(data) +
        rowsNote(data.items.length, renderedItems.length) +
        "<div class='table-wrap'><table><thead><tr><th>#</th><th>Status</th><th>Spotify</th><th>Apple Music candidate</th><th>Confidence</th><th>Reason</th></tr></thead><tbody>" + rows + "</tbody></table></div>";
    }
    function renderError(error) {
      result.className = "empty";
      result.innerHTML = "<div><strong>Public import could not read this link.</strong><p>" + esc(error.message || error) + "</p><p>Use the fallback guide below, then paste the new Spotify link here.</p></div>";
      fallback.hidden = false;
    }
    async function run(endpoint, options) {
      const value = input.value.trim();
      if (!value) return;
      fallback.hidden = true;
      try {
        setBusy(true, options.message);
        const shouldSendLimit = options.kind !== "preview";
        if (options.kind === "preview") {
          resetProgress();
        }
        const payload = shouldSendLimit ? { limit: analysisLimit.value } : {};
        if (options.includeAnalysis && lastAnalysis) {
          payload.analysis = lastAnalysis;
        }
        const data = options.job
          ? await startJob(endpoint, value, payload)
          : await postJson(endpoint, value, payload);
        if (options.kind === "preview") {
          lastPreview = data;
          lastAnalysis = null;
          renderPreview(data);
          status.textContent = "Playlist loaded. Next: analyze Apple Music matches.";
        } else {
          lastAnalysis = data;
          renderAnalysis(data, data.createdApplePlaylistId);
          status.textContent = data.createdApplePlaylistId ? "Apple Music playlist created." : "Analysis complete. Review before creating.";
        }
      } catch (error) {
        status.className = "error";
        status.textContent = error instanceof Error ? error.message : String(error);
        renderError(error);
      } finally {
        setBusy(false);
      }
    }
    buttons.previewPublic.addEventListener("click", () => run("/api/spotify/public-playlist-preview", { kind: "preview", message: "Reading public Spotify link..." }));
    buttons.analyzePublic.addEventListener("click", () => run("/api/transfers/analyze-public-job", { kind: "analysis", job: true, message: "Matching " + selectedAnalysisLabel().toLowerCase() + " against Apple Music. First run can take a moment; retries are cached." }));
    buttons.createPublic.addEventListener("click", () => {
      if (window.confirm("Create an Apple Music playlist from confident matches only?")) {
        run("/api/transfers/create-public-job", { kind: "analysis", job: true, includeAnalysis: true, message: "Creating Apple Music playlist from confident matches in " + selectedAnalysisLabel().toLowerCase() + "..." });
      }
    });
    buttons.previewApi.addEventListener("click", () => run("/api/spotify/playlist-preview", { kind: "preview", message: "Reading through authenticated Spotify API..." }));
    buttons.analyzeApi.addEventListener("click", () => run("/api/transfers/analyze", { kind: "analysis", message: "Analyzing through authenticated API path..." }));
    input.addEventListener("input", () => {
      lastPreview = null;
      lastAnalysis = null;
      buttons.analyzePublic.disabled = true;
      buttons.createPublic.disabled = true;
    });
  </script>
</body>
</html>`;
}

function renderStudioMvpPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PlaylistTransfer MVP</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,400;1,9..144,500;1,9..144,600;1,9..144,700&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" />
  <style>
    :root {
      --bg: #fbfbfd;
      --bg-elev: #ffffff;
      --bg-inset: #f2f2f5;
      --ink: #0b0b0d;
      --ink-soft: #3a3a3d;
      --ink-muted: #86868b;
      --line: rgba(11, 11, 13, 0.08);
      --line-strong: rgba(11, 11, 13, 0.14);
      --source: #1db954;
      --source-soft: rgba(29, 185, 84, 0.1);
      --dest: #fa243c;
      --dest-soft: rgba(250, 36, 60, 0.08);
      --warn: #b86a1f;
      --warn-soft: rgba(184, 106, 31, 0.13);
      --danger: #d43a2f;
      --danger-soft: rgba(212, 58, 47, 0.1);
      --shadow: 0 1px 2px rgba(0, 0, 0, 0.04), 0 8px 24px rgba(11, 11, 13, 0.06);
      --shadow-lg: 0 4px 12px rgba(0, 0, 0, 0.05), 0 20px 50px rgba(11, 11, 13, 0.1);
      --font-display: "Fraunces", "Times New Roman", serif;
      --font-body: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --font-mono: "JetBrains Mono", "SFMono-Regular", Menlo, Consolas, monospace;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      color: var(--ink);
      background:
        radial-gradient(circle at 50% -12%, rgba(250, 36, 60, 0.08), transparent 28rem),
        linear-gradient(180deg, #ffffff 0%, var(--bg) 42%, #f7f7fa 100%);
      font-family: var(--font-body);
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }

    button, input, select { font: inherit; }

    main {
      width: min(100%, 460px);
      margin: 0 auto;
      min-height: 100vh;
      padding: 18px 16px 42px;
    }

    .phone {
      min-height: calc(100vh - 36px);
      border: 1px solid var(--line);
      border-radius: 34px;
      background: var(--bg);
      box-shadow: var(--shadow-lg);
      overflow: hidden;
    }

    .app-chrome {
      padding: 24px 20px 0;
    }

    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 26px;
    }

    .brand {
      display: inline-flex;
      align-items: center;
      gap: 9px;
      min-width: 0;
    }

    .brand-mark {
      width: 30px;
      height: 30px;
      display: grid;
      place-items: center;
      border-radius: 7px;
      background: var(--ink);
      color: var(--bg);
      font-family: var(--font-display);
      font-size: 17px;
      font-style: italic;
      font-weight: 600;
      letter-spacing: -0.04em;
    }

    .eyebrow {
      color: var(--ink-muted);
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      line-height: 1.3;
      text-transform: uppercase;
    }

    .connected {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      color: var(--ink-muted);
      white-space: nowrap;
    }

    .connected::before {
      content: "";
      width: 7px;
      height: 7px;
      border-radius: 999px;
      background: var(--source);
    }

    h1, h2, h3, p { margin: 0; }

    .display {
      font-family: var(--font-display);
      font-style: italic;
      font-weight: 500;
      letter-spacing: -0.045em;
      line-height: 1.02;
    }

    .hero-title {
      max-width: 360px;
      font-size: clamp(40px, 12vw, 58px);
      margin-bottom: 14px;
    }

    .muted-title { color: var(--ink-muted); }

    .lead {
      color: var(--ink-soft);
      font-size: 15px;
      line-height: 1.45;
      margin-bottom: 22px;
    }

    .card {
      border: 1px solid var(--line);
      border-radius: 22px;
      background: var(--bg-elev);
      box-shadow: var(--shadow);
    }

    .paste-card {
      padding: 16px;
      margin-bottom: 14px;
    }

    .field {
      border: 1.5px solid var(--line-strong);
      border-radius: 16px;
      background: var(--bg-inset);
      padding: 14px 14px 13px;
      margin-bottom: 12px;
    }

    .field-label {
      display: flex;
      align-items: center;
      gap: 7px;
      margin-bottom: 9px;
      color: var(--source);
    }

    .service-mark {
      display: inline-grid;
      place-items: center;
      width: 18px;
      height: 18px;
      flex: 0 0 auto;
      color: #fff;
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 800;
      line-height: 1;
    }

    .service-mark.spotify {
      border-radius: 999px;
      background: var(--source);
    }

    .service-mark.apple {
      border-radius: 5px;
      background: var(--dest);
    }

    input {
      width: 100%;
      min-height: 38px;
      border: 0;
      outline: 0;
      background: transparent;
      color: var(--ink);
      font-family: var(--font-mono);
      font-size: 13px;
      line-height: 1.35;
    }

    input::placeholder { color: var(--ink-muted); }

    .button-stack {
      display: grid;
      gap: 10px;
    }

    button {
      min-height: 54px;
      border: 1px solid transparent;
      border-radius: 999px;
      padding: 0 18px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 9px;
      color: var(--bg);
      background: var(--ink);
      box-shadow: 0 2px 0 rgba(0, 0, 0, 0.08), 0 8px 18px rgba(0, 0, 0, 0.12);
      cursor: pointer;
      font-size: 15px;
      font-weight: 750;
      letter-spacing: -0.01em;
      transition: opacity 160ms ease, transform 160ms ease, box-shadow 160ms ease;
    }

    button:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 2px 0 rgba(0, 0, 0, 0.08), 0 12px 24px rgba(0, 0, 0, 0.12);
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.42;
      transform: none;
      box-shadow: none;
    }

    .primary { background: var(--ink); }
    .dest { background: var(--dest); }
    .soft {
      color: var(--ink);
      background: var(--bg-inset);
      border-color: var(--line);
      box-shadow: none;
    }

    .controls-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 10px;
      margin: 12px 0 0;
    }

    .option-row {
      display: grid;
      gap: 7px;
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: 16px;
      background: var(--bg-elev);
    }

    select {
      width: 100%;
      min-height: 40px;
      border: 1px solid var(--line);
      border-radius: 13px;
      padding: 0 11px;
      outline: 0;
      color: var(--ink);
      background: var(--bg-inset);
      font-size: 13px;
      font-weight: 650;
    }

    #status {
      min-height: 20px;
      margin-top: 12px;
      color: var(--ink-soft);
      font-size: 13px;
      font-weight: 650;
      line-height: 1.4;
    }

    #status.error { color: var(--danger); }

    .progress-shell {
      display: none;
      margin-top: 12px;
      padding: 13px;
      border: 1px solid var(--line);
      border-radius: 16px;
      background: var(--bg-elev);
    }

    .progress-shell.active { display: block; }

    .progress-top {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 8px;
      color: var(--ink-soft);
      font-size: 13px;
      font-weight: 650;
    }

    .progress-percent {
      color: var(--ink-muted);
      font-family: var(--font-mono);
      font-size: 12px;
      font-weight: 700;
    }

    .progress-track {
      height: 8px;
      overflow: hidden;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: var(--bg-inset);
    }

    .progress-bar {
      width: 0%;
      height: 100%;
      border-radius: inherit;
      background: var(--dest);
      transition: width 400ms ease-out;
    }

    .progress-detail {
      margin-top: 8px;
      color: var(--ink-muted);
      font-size: 12px;
      line-height: 1.35;
    }

    details {
      margin-top: 12px;
      color: var(--ink-muted);
      font-size: 13px;
    }

    summary {
      cursor: pointer;
      font-weight: 700;
    }

    .dev-actions {
      display: grid;
      gap: 8px;
      margin-top: 10px;
    }

    .screen {
      margin-top: 16px;
      padding: 18px;
    }

    .empty {
      min-height: 220px;
      display: grid;
      place-items: center;
      padding: 24px;
      text-align: center;
      color: var(--ink-muted);
      border: 1px dashed var(--line-strong);
      border-radius: 22px;
      background: var(--bg-elev);
    }

    .empty strong {
      display: block;
      margin-bottom: 7px;
      color: var(--ink);
      font-size: 16px;
    }

    .screen-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 14px;
      margin-bottom: 18px;
    }

    .screen-kicker {
      display: flex;
      align-items: center;
      gap: 7px;
      margin-bottom: 8px;
      color: var(--source);
    }

    .screen-title {
      font-size: 30px;
    }

    .mini-copy {
      color: var(--ink-muted);
      font-size: 13px;
      line-height: 1.45;
      margin-top: 7px;
    }

    .sleeve {
      position: relative;
      flex: 0 0 auto;
      overflow: hidden;
      border-radius: 7px;
      background: linear-gradient(135deg, #c8531a, #fa243c 55%, #1a1411);
      box-shadow: 0 20px 42px rgba(11, 11, 13, 0.18), 0 0 0 1px rgba(0, 0, 0, 0.08);
    }

    .sleeve::before {
      content: "";
      position: absolute;
      right: -34%;
      top: 50%;
      width: 86%;
      height: 86%;
      border-radius: 999px;
      background: radial-gradient(circle at 30% 30%, #2a2520 0%, #050403 75%);
      transform: translateY(-50%);
      opacity: 0.92;
    }

    .sleeve::after {
      content: "";
      position: absolute;
      left: 50%;
      bottom: -32%;
      width: 82%;
      height: 82%;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.12);
      transform: translateX(-50%);
      mix-blend-mode: overlay;
    }

    .sleeve.big { width: 104px; height: 104px; }
    .sleeve.small { width: 42px; height: 42px; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.18); }

    .playlist-card {
      display: flex;
      gap: 14px;
      align-items: flex-start;
      padding: 16px;
      margin-bottom: 14px;
      border-radius: 22px;
      background: var(--bg-elev);
      border: 1px solid var(--line);
      box-shadow: var(--shadow);
    }

    .playlist-name {
      color: var(--ink);
      font-family: var(--font-display);
      font-size: 24px;
      font-style: italic;
      font-weight: 500;
      letter-spacing: -0.035em;
      line-height: 1.06;
      overflow-wrap: anywhere;
    }

    .playlist-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 9px;
      color: var(--ink-muted);
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }

    .route-card {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px;
      margin-bottom: 14px;
      border: 1px dashed var(--line-strong);
      border-radius: 15px;
      background: var(--bg-inset);
    }

    .route-copy {
      min-width: 0;
      color: var(--ink-soft);
      font-size: 13px;
      font-weight: 650;
    }

    .stat-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
      margin: 16px 0;
    }

    .stat-tile {
      min-width: 0;
      padding: 12px 10px;
      border: 1px solid var(--line);
      border-radius: 15px;
      background: var(--bg-elev);
    }

    .stat-label {
      color: var(--ink-muted);
      font-family: var(--font-mono);
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.07em;
      line-height: 1.25;
      text-transform: uppercase;
    }

    .stat-value {
      margin-top: 5px;
      color: var(--ink);
      font-family: var(--font-display);
      font-size: 32px;
      font-style: italic;
      font-weight: 500;
      letter-spacing: -0.035em;
      line-height: 1;
      overflow-wrap: anywhere;
    }

    .stat-tile.ready .stat-value { color: var(--source); }
    .stat-tile.review .stat-value { color: var(--warn); }
    .stat-tile.missing .stat-value { color: var(--danger); }

    .trust-note {
      margin: 12px 0;
      padding: 12px 13px;
      border: 1px solid rgba(29, 185, 84, 0.14);
      border-left: 5px solid var(--source);
      border-radius: 15px;
      background: var(--source-soft);
      color: #235336;
      font-size: 13px;
      font-weight: 650;
      line-height: 1.45;
    }

    .trust-note.warn {
      border-color: rgba(184, 106, 31, 0.16);
      border-left-color: var(--warn);
      background: var(--warn-soft);
      color: #704111;
    }

    .track-list {
      overflow: hidden;
      border: 1px solid var(--line);
      border-radius: 16px;
      background: var(--bg-elev);
    }

    .track-row {
      display: flex;
      gap: 11px;
      align-items: flex-start;
      padding: 12px;
      border-bottom: 1px solid var(--line);
    }

    .track-row:last-child { border-bottom: 0; }

    .track-index {
      width: 22px;
      flex: 0 0 auto;
      padding-top: 2px;
      color: var(--ink-muted);
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 700;
    }

    .track-body {
      min-width: 0;
      flex: 1;
    }

    .track-title {
      color: var(--ink);
      font-size: 14px;
      font-weight: 760;
      line-height: 1.25;
      overflow-wrap: anywhere;
    }

    .track-meta {
      margin-top: 3px;
      color: var(--ink-muted);
      font-size: 12px;
      line-height: 1.35;
    }

    .mono {
      font-family: var(--font-mono);
      font-size: 11px;
    }

    .match-group {
      margin-top: 16px;
    }

    .group-title {
      margin: 0 0 8px;
      color: var(--ink-muted);
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 750;
      letter-spacing: 0.07em;
      text-transform: uppercase;
    }

    .match-group.review .group-title { color: var(--warn); }
    .match-group.missing .group-title { color: var(--danger); }
    .match-group.ready .group-title { color: var(--source); }

    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      width: max-content;
      margin-top: 7px;
      padding: 4px 9px;
      border-radius: 999px;
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 750;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }

    .status-pill::before {
      content: "";
      width: 5px;
      height: 5px;
      border-radius: 999px;
      background: currentColor;
    }

    .status-pill.matched {
      color: #256d3e;
      background: var(--source-soft);
    }

    .status-pill.needs_review {
      color: var(--warn);
      background: var(--warn-soft);
    }

    .status-pill.unmatched {
      color: var(--danger);
      background: var(--danger-soft);
    }

    .candidate-card {
      margin-top: 10px;
      padding: 10px 11px;
      border-left: 2px solid var(--line-strong);
      border-radius: 0 12px 12px 0;
      background: var(--bg-inset);
    }

    .candidate-card.review { border-left-color: var(--warn); }
    .candidate-card.missing { border-left-color: var(--danger); }
    .candidate-card.ready { border-left-color: var(--source); }

    .candidate-label {
      margin-bottom: 5px;
      color: var(--ink-muted);
      font-family: var(--font-mono);
      font-size: 9px;
      font-weight: 750;
      letter-spacing: 0.07em;
      text-transform: uppercase;
    }

    .confidence {
      flex: 0 0 auto;
      color: var(--ink-muted);
      font-family: var(--font-mono);
      font-size: 12px;
      font-weight: 750;
      padding-top: 2px;
    }

    .filter-row {
      display: flex;
      gap: 7px;
      overflow-x: auto;
      margin: 12px -18px 0;
      padding: 0 18px 4px;
    }

    .filter-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: var(--bg-elev);
      color: var(--ink);
      padding: 7px 11px;
      white-space: nowrap;
      font-size: 12px;
      font-weight: 700;
    }

    .filter-chip.active {
      background: var(--ink);
      color: var(--bg);
      border-color: var(--ink);
    }

    .success-hero {
      overflow: hidden;
      margin: -18px -18px 18px;
      padding: 76px 22px 24px;
      color: #fff;
      background: linear-gradient(165deg, var(--dest), #ff6a4d 62%, #7b2b18 112%);
      position: relative;
    }

    .success-hero::after {
      content: "";
      position: absolute;
      left: 50%;
      bottom: -48%;
      width: 460px;
      height: 460px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.08);
      transform: translateX(-50%);
    }

    .success-badge {
      position: relative;
      z-index: 1;
      display: inline-flex;
      margin-bottom: 72px;
      padding: 7px 13px;
      border-radius: 999px;
      background: rgba(0, 0, 0, 0.22);
      color: #fff;
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 750;
      letter-spacing: 0.07em;
      text-transform: uppercase;
    }

    .success-title {
      position: relative;
      z-index: 1;
      max-width: 320px;
      color: #fff;
      font-size: 36px;
    }

    .success-subtitle {
      position: relative;
      z-index: 1;
      margin-top: 10px;
      color: rgba(255, 255, 255, 0.86);
      font-size: 13px;
      font-weight: 650;
    }

    .fallback {
      margin: 16px 20px 24px;
      padding: 18px;
    }

    .fallback[hidden] { display: none; }

    .fallback-grid {
      display: grid;
      gap: 10px;
      margin-top: 13px;
    }

    .fallback-card {
      padding: 14px;
      border: 1px solid var(--line);
      border-radius: 16px;
      background: var(--bg-elev);
    }

    .fallback-card b {
      display: block;
      margin-bottom: 7px;
      color: var(--ink);
      font-size: 14px;
    }

    .fallback-card ol {
      margin: 0;
      padding-left: 18px;
      color: var(--ink-muted);
      font-size: 13px;
      line-height: 1.55;
    }

    @media (min-width: 860px) {
      main { width: min(100%, 980px); }
      .phone {
        display: grid;
        grid-template-columns: 390px minmax(0, 1fr);
        min-height: auto;
      }
      .app-chrome {
        border-right: 1px solid var(--line);
        padding-bottom: 28px;
      }
      .screen {
        margin: 24px;
        min-height: 720px;
      }
    }

    @media (max-width: 390px) {
      main { padding: 0; }
      .phone { border-radius: 0; border-left: 0; border-right: 0; min-height: 100vh; }
      .stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
  </style>
</head>
<body>
  <main>
    <section class="phone">
      <section class="app-chrome">
        <div class="topbar">
          <div class="brand">
            <div class="brand-mark">pt</div>
            <div class="eyebrow">Playlist Transfer</div>
          </div>
          <div class="connected eyebrow">Apple ready</div>
        </div>

        <h1 class="display hero-title">Drop a link.<br><span class="muted-title">We'll do the digging.</span></h1>
        <p class="lead">Move public Spotify playlists into Apple Music. We show the matches first, then create from confident tracks only.</p>

        <section class="card paste-card">
          <div class="field">
            <div class="field-label eyebrow"><span class="service-mark spotify">S</span> Spotify playlist URL</div>
            <input id="playlist-input" autocomplete="off" placeholder="https://open.spotify.com/playlist/..." />
          </div>

          <div class="button-stack">
            <button id="preview-public" class="primary">Preview public link</button>
            <button id="analyze-public" class="primary" disabled>Analyze matches</button>
            <button id="create-public" class="dest" disabled><span class="service-mark apple">A</span>Create Apple Music playlist</button>
          </div>

          <div class="controls-row">
            <div class="option-row">
              <label class="eyebrow" for="analysis-limit">Analysis size</label>
              <select id="analysis-limit">
                <option value="50" selected>Fast sample: first 50 tracks</option>
                <option value="100">Bigger sample: first 100 tracks</option>
                <option value="500">Full playlist: up to 500 tracks</option>
              </select>
            </div>
          </div>

          <div id="status"></div>
          <div id="progress-shell" class="progress-shell" aria-live="polite">
            <div class="progress-top">
              <span id="progress-phase">Preparing</span>
              <span id="progress-percent" class="progress-percent">0%</span>
            </div>
            <div class="progress-track">
              <div id="progress-bar" class="progress-bar"></div>
            </div>
            <p id="progress-detail" class="progress-detail">Waiting to start.</p>
          </div>

          <details>
            <summary>Developer comparison tools</summary>
            <div class="dev-actions">
              <button id="preview-api" class="soft">Preview API path</button>
              <button id="analyze-api" class="soft">Analyze API path</button>
            </div>
          </details>
        </section>
      </section>

      <section class="screen card">
        <div id="result" class="empty">
          <div>
            <strong>Paste a Spotify playlist link.</strong>
            <p>Nothing transfers until you review the Apple Music matches.</p>
          </div>
        </div>
      </section>

      <section id="fallback" class="card fallback" hidden>
        <h2 class="display screen-title">If Spotify blocks the link</h2>
        <p class="mini-copy">The mobile-friendly fallback is helping the user create a public playlist link we can import.</p>
        <div class="fallback-grid">
          <div class="fallback-card">
            <b>I own this playlist</b>
            <ol><li>Open it in Spotify.</li><li>Tap the three dots.</li><li>Make it public or add it to profile.</li><li>Share the link again.</li></ol>
          </div>
          <div class="fallback-card">
            <b>Someone shared it with me</b>
            <ol><li>Open it in Spotify.</li><li>Add it to a new playlist in your account.</li><li>Make the new playlist public.</li><li>Share the new link.</li></ol>
          </div>
          <div class="fallback-card">
            <b>Still blocked</b>
            <ol><li>Use Spotify Desktop later.</li><li>Export or copy the track list.</li><li>Import text or CSV in the next product phase.</li></ol>
          </div>
        </div>
      </section>
    </section>
  </main>

  <script>
    const input = document.querySelector("#playlist-input");
    const status = document.querySelector("#status");
    const result = document.querySelector("#result");
    const fallback = document.querySelector("#fallback");
    const analysisLimit = document.querySelector("#analysis-limit");
    const progressShell = document.querySelector("#progress-shell");
    const progressPhase = document.querySelector("#progress-phase");
    const progressPercent = document.querySelector("#progress-percent");
    const progressBar = document.querySelector("#progress-bar");
    const progressDetail = document.querySelector("#progress-detail");
    const buttons = {
      previewPublic: document.querySelector("#preview-public"),
      analyzePublic: document.querySelector("#analyze-public"),
      createPublic: document.querySelector("#create-public"),
      previewApi: document.querySelector("#preview-api"),
      analyzeApi: document.querySelector("#analyze-api")
    };
    let lastPreview = null;
    let lastAnalysis = null;

    function esc(value) {
      return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
    }

    function duration(ms) {
      if (!ms) return "";
      const seconds = Math.round(ms / 1000);
      return Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
    }

    function pct(value) {
      return typeof value === "number" ? Math.round(value * 100) + "%" : "";
    }

    function setBusy(isBusy, message) {
      Object.values(buttons).forEach((button) => button.disabled = isBusy || button.dataset.locked === "true");
      if (!isBusy) {
        buttons.analyzePublic.disabled = !lastPreview;
        buttons.createPublic.disabled = !lastAnalysis;
      }
      status.className = "";
      status.textContent = message || "";
    }

    function setProgress(job) {
      const progress = Math.max(0, Math.min(100, Number(job.progress || 0)));
      progressShell.classList.add("active");
      progressPhase.textContent = job.phase || "Working";
      progressPercent.textContent = progress + "%";
      progressBar.style.width = progress + "%";
      progressDetail.textContent = job.total
        ? job.completed + " of " + job.total + " tracks processed."
        : "Preparing the playlist and match job.";
    }

    function resetProgress() {
      progressShell.classList.remove("active");
      progressPhase.textContent = "Preparing";
      progressPercent.textContent = "0%";
      progressBar.style.width = "0%";
      progressDetail.textContent = "Waiting to start.";
    }

    async function postJson(endpoint, value, options = {}) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: value, ...options })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Request failed.");
      return data;
    }

    async function startJob(endpoint, value, options = {}) {
      const job = await postJson(endpoint, value, options);
      setProgress(job);

      while (true) {
        await new Promise((resolve) => setTimeout(resolve, 650));
        const response = await fetch("/api/jobs/" + encodeURIComponent(job.id));
        const current = await response.json();
        if (!response.ok) throw new Error(current.message || "Could not read job progress.");
        setProgress(current);

        if (current.status === "complete") return current.result;
        if (current.status === "error") throw new Error(current.error || "Job failed.");
      }
    }

    function sourceNote(data) {
      if (!data.playlist.source) return "";
      const limitation = (data.playlist.limitations || [])[0] || "";
      return "<div class='trust-note'>Source: " + esc(data.playlist.source) + ". " + esc(limitation) + "</div>";
    }

    function rowsNote(total, rendered) {
      return total > rendered ? "<p class='mini-copy'>Showing first " + rendered + " rows in this prototype. The backend response contains all " + total + " rows.</p>" : "";
    }

    function selectedAnalysisLabel() {
      return analysisLimit.options[analysisLimit.selectedIndex]?.textContent || "selected tracks";
    }

    function partialNote(data) {
      if (!data.playlist.partialAnalysis) return "";
      return "<div class='trust-note warn'>Fast sample mode: analyzed " + data.playlist.analyzedTrackCount + " of " + data.playlist.originalTotalItems + " readable tracks. Use Full playlist when you are ready to wait.</div>";
    }

    function statusLabel(statusValue) {
      if (statusValue === "matched") return "Ready";
      if (statusValue === "needs_review") return "Review";
      return "Missing";
    }

    function toneForStatus(statusValue) {
      if (statusValue === "matched") return "ready";
      if (statusValue === "needs_review") return "review";
      return "missing";
    }

    function renderPreview(data) {
      const renderedTracks = data.tracks.slice(0, 18);
      const rows = renderedTracks.map((track, index) =>
        "<div class='track-row'><div class='track-index'>" + String(index + 1).padStart(2, "0") + "</div><div class='sleeve small'></div><div class='track-body'><div class='track-title'>" + esc(track.name) + "</div><div class='track-meta'>" + esc(track.artists.join(", ")) + (track.album ? " - " + esc(track.album) : "") + "</div></div><div class='confidence'>" + duration(track.durationMs) + "</div></div>"
      ).join("");

      result.className = "";
      result.innerHTML =
        "<div class='screen-head'><div><div class='screen-kicker eyebrow'><span class='service-mark spotify'>S</span> We found your playlist</div><h2 class='display screen-title'>Here's what we'll be working with.</h2><p class='mini-copy'>Nothing is transferred yet. We'll show Apple Music matches first.</p></div></div>" +
        "<div class='playlist-card'><div class='sleeve big'></div><div><div class='eyebrow'>Public Spotify playlist</div><div class='playlist-name'>" + esc(data.playlist.name) + "</div><div class='playlist-meta'><span>" + data.tracks.length + " tracks</span><span>" + data.tracks.filter((track) => track.isrc).length + " with ISRC</span></div></div></div>" +
        "<div class='route-card'><span class='service-mark spotify'>S</span><span class='eyebrow'>to</span><span class='service-mark apple'>A</span><div class='route-copy'>Will create a new Apple Music playlist after review.</div></div>" +
        sourceNote(data) +
        "<div class='group-title'>First tracks</div><div class='track-list'>" + rows + "</div>" +
        rowsNote(data.tracks.length, renderedTracks.length);
    }

    function renderMatchRow(item) {
      const source = item.source;
      const candidate = item.appleCandidate;
      const tone = toneForStatus(item.status);
      const candidateHtml = candidate
        ? "<div class='candidate-card " + tone + "'><div class='candidate-label'>Apple Music candidate</div><div class='track-title'>" + esc(candidate.name) + "</div><div class='track-meta'>" + esc(candidate.artistName) + (candidate.albumName ? " - " + esc(candidate.albumName) : "") + "</div><div class='track-meta mono'>" + esc(item.reason || "") + "</div></div>"
        : "<div class='candidate-card missing'><div class='candidate-label'>No confident match</div><div class='track-meta'>" + esc(item.reason || "No candidate selected.") + "</div></div>";

      return "<div class='track-row'><div class='track-index'>" + item.index + "</div><div class='track-body'><div class='track-title'>" + esc(source.name) + "</div><div class='track-meta'>" + esc(source.artists.join(", ")) + (source.album ? " - " + esc(source.album) : "") + "</div><div class='status-pill " + esc(item.status) + "'>" + statusLabel(item.status) + "</div>" + candidateHtml + "</div><div class='confidence'>" + pct(item.confidence) + "</div></div>";
    }

    function renderMatchGroup(label, items, tone, renderLimit) {
      if (!items.length) return "";
      const visible = items.slice(0, renderLimit);
      const more = items.length > visible.length ? "<div class='track-row'><div class='track-body'><div class='track-meta mono'>+ " + (items.length - visible.length) + " more " + esc(label.toLowerCase()) + " tracks in the full report.</div></div></div>" : "";
      return "<section class='match-group " + tone + "'><h3 class='group-title'>" + esc(label) + " - " + items.length + "</h3><div class='track-list'>" + visible.map(renderMatchRow).join("") + more + "</div></section>";
    }

    function renderAnalysis(data) {
      const renderedItems = data.items.slice(0, 160);
      const review = renderedItems.filter((item) => item.status === "needs_review");
      const missing = renderedItems.filter((item) => item.status === "unmatched");
      const ready = renderedItems.filter((item) => item.status === "matched");
      const readyRate = data.items.length === 0 ? 0 : data.summary.confidentMatchCount / data.items.length;

      result.className = "";
      result.innerHTML =
        "<div class='screen-head'><div><div class='eyebrow'>Step 2 of 3 - Match Report</div><h2 class='display screen-title'>" + pct(readyRate) + " ready to transfer cleanly.</h2><p class='mini-copy'>We matched " + data.summary.confidentMatchCount + " of " + data.items.length + " tracks confidently. " + data.summary.needsReviewCount + " need a quick look. " + data.summary.unmatchedCount + " will not transfer.</p></div></div>" +
        "<div class='stat-grid'><div class='stat-tile ready'><div class='stat-label'>Ready</div><div class='stat-value'>" + data.summary.confidentMatchCount + "</div></div><div class='stat-tile review'><div class='stat-label'>Review</div><div class='stat-value'>" + data.summary.needsReviewCount + "</div></div><div class='stat-tile missing'><div class='stat-label'>Missing</div><div class='stat-value'>" + data.summary.unmatchedCount + "</div></div><div class='stat-tile'><div class='stat-label'>Any match</div><div class='stat-value'>" + pct(data.summary.matchRate) + "</div></div></div>" +
        "<div class='filter-row'><span class='filter-chip active'>All <span class='mono'>" + data.items.length + "</span></span><span class='filter-chip'>Needs review <span class='mono'>" + data.summary.needsReviewCount + "</span></span><span class='filter-chip'>Missing <span class='mono'>" + data.summary.unmatchedCount + "</span></span><span class='filter-chip'>Ready <span class='mono'>" + data.summary.confidentMatchCount + "</span></span></div>" +
        partialNote(data) +
        sourceNote(data) +
        "<div class='trust-note'>Tapping Create will transfer " + data.summary.confidentMatchCount + " confident matches to Apple Music. Review and missing tracks stay out.</div>" +
        renderMatchGroup("Needs review", review, "review", 24) +
        renderMatchGroup("Will not transfer", missing, "missing", 24) +
        renderMatchGroup("Ready to transfer", ready, "ready", 72) +
        rowsNote(data.items.length, renderedItems.length);
    }

    function renderSuccess(data, createdApplePlaylistId) {
      result.className = "";
      result.innerHTML =
        "<div class='success-hero'><div class='success-badge'>Transfer complete</div><h2 class='display success-title'>" + esc(data.playlist.name) + "</h2><div class='success-subtitle'><span class='service-mark apple'>A</span> Now in your Apple Music library</div></div>" +
        "<div class='stat-grid'><div class='stat-tile ready'><div class='stat-label'>Transferred</div><div class='stat-value'>" + data.summary.confidentMatchCount + "</div></div><div class='stat-tile review'><div class='stat-label'>Review left</div><div class='stat-value'>" + data.summary.needsReviewCount + "</div></div><div class='stat-tile missing'><div class='stat-label'>Skipped</div><div class='stat-value'>" + data.summary.unmatchedCount + "</div></div><div class='stat-tile'><div class='stat-label'>Apple ID</div><div class='stat-value mono'>" + esc(createdApplePlaylistId) + "</div></div></div>" +
        "<div class='trust-note'>Only confident matches were added. Open Apple Music to see the new playlist in your library.</div>" +
        "<button class='dest' type='button' disabled><span class='service-mark apple'>A</span>Open in Apple Music coming next</button>";
    }

    function renderError(error) {
      result.className = "empty";
      result.innerHTML = "<div><strong>Public import could not read this link.</strong><p>" + esc(error.message || error) + "</p><p>Use the fallback guide below, then paste the new Spotify link here.</p></div>";
      fallback.hidden = false;
    }

    async function run(endpoint, options) {
      const value = input.value.trim();
      if (!value) return;
      fallback.hidden = true;
      try {
        setBusy(true, options.message);
        const shouldSendLimit = options.kind !== "preview";
        if (options.kind === "preview") {
          resetProgress();
        }
        const payload = shouldSendLimit ? { limit: analysisLimit.value } : {};
        if (options.includeAnalysis && lastAnalysis) {
          payload.analysis = lastAnalysis;
        }
        const data = options.job
          ? await startJob(endpoint, value, payload)
          : await postJson(endpoint, value, payload);
        if (options.kind === "preview") {
          lastPreview = data;
          lastAnalysis = null;
          renderPreview(data);
          status.textContent = "Playlist loaded. Next: analyze Apple Music matches.";
        } else {
          if (data.createdApplePlaylistId) {
            lastAnalysis = null;
            renderSuccess(data, data.createdApplePlaylistId);
          } else {
            lastAnalysis = data;
            renderAnalysis(data);
          }
          status.textContent = data.createdApplePlaylistId ? "Apple Music playlist created." : "Analysis complete. Review before creating.";
        }
      } catch (error) {
        status.className = "error";
        status.textContent = error instanceof Error ? error.message : String(error);
        renderError(error);
      } finally {
        setBusy(false);
      }
    }

    buttons.previewPublic.addEventListener("click", () => run("/api/spotify/public-playlist-preview", { kind: "preview", message: "Reading public Spotify link..." }));
    buttons.analyzePublic.addEventListener("click", () => run("/api/transfers/analyze-public-job", { kind: "analysis", job: true, message: "Matching " + selectedAnalysisLabel().toLowerCase() + " against Apple Music. First run can take a moment; retries are cached." }));
    buttons.createPublic.addEventListener("click", () => {
      if (window.confirm("Create an Apple Music playlist from confident matches only?")) {
        run("/api/transfers/create-public-job", { kind: "analysis", job: true, includeAnalysis: true, message: "Creating Apple Music playlist from confident matches in " + selectedAnalysisLabel().toLowerCase() + "..." });
      }
    });
    buttons.previewApi.addEventListener("click", () => run("/api/spotify/playlist-preview", { kind: "preview", message: "Reading through authenticated Spotify API..." }));
    buttons.analyzeApi.addEventListener("click", () => run("/api/transfers/analyze", { kind: "analysis", message: "Analyzing through authenticated API path..." }));
    input.addEventListener("input", () => {
      lastPreview = null;
      lastAnalysis = null;
      buttons.analyzePublic.disabled = true;
      buttons.createPublic.disabled = true;
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
    sendHtml(response, renderStudioMvpPage());
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
});

server.listen(port, host, () => {
  console.log(`PlaylistTransfer local preview: http://${host}:${port}`);
});
