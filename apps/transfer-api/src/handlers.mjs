import { loadSpotifyConfig } from "../../../dist/config.js";
import { parseSpotifyPlaylistInput } from "../../../dist/lib/spotify-url.js";
import { SpotifyClient } from "../../../dist/providers/spotify.js";
import { getPublicSpotifyPlaylist } from "../../../dist/providers/spotify-public.js";
import { analyzeSpotifyPlaylist, analyzeTransfer } from "../../../dist/transfer/analyze-transfer.js";
import { createApplePlaylistFromMatches } from "../../../dist/transfer/create-apple-playlist.js";
import { createAppleMusicClient } from "./apple-session.mjs";
import { errorMessage, readJsonBody, sendJson, statusForError } from "./http.mjs";
import {
  analysisLimitFromBody,
  playlistAnalysisMetadata,
  serializeAnalysis,
  slicePlaylistForAnalysis
} from "./transfer-serialization.mjs";
import {
  createJob,
  runPublicTransferAnalyzeJob,
  runPublicTransferCreateJob,
  serializeJob
} from "./jobs.mjs";
import {
  applyTransferItemDecision,
  getTransfer
} from "./transfers.mjs";

function createSpotifyClient() {
  const config = loadSpotifyConfig();
  return new SpotifyClient(
    config.spotifyClientId,
    config.spotifyClientSecret,
    config.spotifyRefreshToken
  );
}

export async function handlePlaylistPreview(request, response) {
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
        imageUrl: playlist.imageUrl,
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

export async function handlePublicPlaylistPreview(request, response) {
  try {
    const body = await readJsonBody(request);
    const input = body.input ?? body.playlistUrl ?? body.playlistId ?? "";
    const playlist = await getPublicSpotifyPlaylist(input);

    sendJson(response, 200, {
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
  } catch (error) {
    sendJson(response, statusForError(error), {
      error: true,
      message: errorMessage(error)
    });
  }
}

export async function handleTransferAnalyze(request, response) {
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

export async function handlePublicTransferAnalyze(request, response) {
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

export async function handlePublicTransferAnalyzeJob(request, response) {
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

export async function handlePublicTransferCreateJob(request, response) {
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

export async function handlePublicTransferCreate(request, response) {
  try {
    const body = await readJsonBody(request);
    const input = body.input ?? body.playlistUrl ?? body.playlistId ?? "";
    const limit = analysisLimitFromBody(body);
    const playlist = await getPublicSpotifyPlaylist(input);
    const analysisPlaylist = slicePlaylistForAnalysis(playlist, limit);
    const apple = createAppleMusicClient({ requireUserToken: true });
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

export function handleGetTransfer(transferId, response) {
  const transfer = getTransfer(transferId);

  if (!transfer) {
    sendJson(response, 404, {
      error: true,
      message: "Transfer not found. It may have been deleted or the local database path may have changed."
    });
    return;
  }

  sendJson(response, 200, transfer);
}

export async function handlePatchTransferItem(transferId, itemIndex, request, response) {
  try {
    const body = await readJsonBody(request);
    const transfer = applyTransferItemDecision(transferId, itemIndex, body);
    sendJson(response, 200, transfer);
  } catch (error) {
    sendJson(response, statusForError(error), {
      error: true,
      message: errorMessage(error)
    });
  }
}

export async function handleStoredTransferCreateJob(transferId, response) {
  try {
    const job = createJob("stored-create");

    runPublicTransferCreateJob(job, { transferId });
    sendJson(response, 202, serializeJob(job));
  } catch (error) {
    sendJson(response, statusForError(error), {
      error: true,
      message: errorMessage(error)
    });
  }
}
