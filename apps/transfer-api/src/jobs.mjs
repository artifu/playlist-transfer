import { randomUUID } from "node:crypto";
import { getPublicSpotifyPlaylist } from "../../../dist/providers/spotify-public.js";
import { analyzeSpotifyPlaylist } from "../../../dist/transfer/analyze-transfer.js";
import { createApplePlaylistFromMatches } from "../../../dist/transfer/create-apple-playlist.js";
import { createAppleMusicClient } from "./apple-session.mjs";
import { errorMessage, sendJson } from "./http.mjs";
import {
  analysisLimitFromBody,
  playlistAnalysisMetadata,
  serializeAnalysis,
  slicePlaylistForAnalysis,
  transferReportFromSerializedAnalysis
} from "./transfer-serialization.mjs";

const JOB_RETENTION_MS = 10 * 60 * 1000;
const jobs = new Map();

export function createJob(kind) {
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

export function serializeJob(job) {
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

export function handleJobStatus(jobId, response) {
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

export async function runPublicTransferAnalyzeJob(job, body) {
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

export async function runPublicTransferCreateJob(job, body) {
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
      apple: createAppleMusicClient({ requireUserToken: true }),
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
