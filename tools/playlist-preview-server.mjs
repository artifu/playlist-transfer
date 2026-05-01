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

const server = createServer(async (request, response) => {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", `http://${host}:${port}`);

  if (method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (method === "GET" && url.pathname === "/") {
    sendHtml(response, renderMvpPage());
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
