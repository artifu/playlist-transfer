import { buildSearchTerms, pickBestMatch } from "./matching.js";

export const DEFAULT_PUBLIC_ANALYSIS_LIMIT = 500;
export const MAX_PUBLIC_ANALYSIS_LIMIT = 500;

function dedupeCandidates(candidates) {
  const byId = new Map();
  for (const candidate of candidates) byId.set(candidate.id, candidate);
  return [...byId.values()];
}

async function mapWithConcurrency(values, concurrency, mapper) {
  const results = new Array(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker())
  );

  return results;
}

export async function analyzeTrack(track, apple) {
  const searchTerms = buildSearchTerms(track);
  const attemptedSearchTerms = [];
  const candidates = [];
  let bestMatch = null;

  for (const searchTerm of searchTerms) {
    attemptedSearchTerms.push(searchTerm);
    candidates.push(...(await apple.searchSongs(searchTerm)));

    const uniqueCandidates = dedupeCandidates(candidates);
    bestMatch = pickBestMatch(track, uniqueCandidates);

    if (bestMatch.reason === "isrc" || bestMatch.confidence >= 0.96) break;
  }

  const uniqueCandidates = dedupeCandidates(candidates);
  const match = bestMatch ?? pickBestMatch(track, uniqueCandidates);

  return {
    ...match,
    searchTerm: attemptedSearchTerms.join(" | "),
    candidates: uniqueCandidates
  };
}

export async function analyzeTracksOptimized(tracks, apple, options = {}) {
  const results = new Array(tracks.length);
  const candidatesByISRC = new Map();
  const isrcs = tracks.map((track) => track?.isrc).filter(Boolean);

  if (isrcs.length > 0 && typeof apple.songsByISRCs === "function") {
    try {
      const candidates = await apple.songsByISRCs(isrcs);
      for (const candidate of candidates) {
        const isrc = String(candidate.isrc ?? "").trim().toUpperCase();
        if (!isrc) continue;
        const existing = candidatesByISRC.get(isrc) ?? [];
        existing.push(candidate);
        candidatesByISRC.set(isrc, existing);
      }
    } catch (error) {
      console.warn("apple_music_isrc_batch_fallback", {
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const fallbackEntries = [];

  tracks.forEach((track, index) => {
    const isrc = String(track?.isrc ?? "").trim().toUpperCase();
    const candidates = candidatesByISRC.get(isrc) ?? [];
    const match = pickBestMatch(track, candidates);

    if (match.reason === "isrc") {
      results[index] = {
        ...match,
        searchTerm: `isrc:${isrc}`,
        candidates
      };
      options.onTrackComplete?.({ index, result: results[index] });
    } else {
      fallbackEntries.push({ track, index });
    }
  });

  await mapWithConcurrency(
    fallbackEntries,
    Math.max(1, options.trackConcurrency ?? 4),
    async ({ track, index }) => {
      const result = await analyzeTrack(track, apple);
      results[index] = result;
      options.onTrackComplete?.({ index, result });
      return result;
    }
  );

  return results;
}

export async function analyzeSpotifyPlaylist(playlist, apple, options = {}) {
  const trackConcurrency = Math.max(1, options.trackConcurrency ?? 4);
  let completed = 0;
  const results = await analyzeTracksOptimized(
    playlist.tracks,
    apple,
    {
      trackConcurrency,
      onTrackComplete: ({ index, result }) => {
        completed += 1;
        options.onTrackComplete?.({
          completed,
          total: playlist.tracks.length,
          index,
          result
        });
      }
    }
  );

  const matchedCount = results.filter((result) => result.matched).length;
  const unmatchedCount = results.length - matchedCount;

  return {
    playlistName: playlist.name,
    playlistId: playlist.id,
    matchedCount,
    unmatchedCount,
    matchRate: results.length === 0 ? 0 : matchedCount / results.length,
    results
  };
}

function matchStatus(result) {
  if (!result.matched) return "unmatched";
  if (result.confidence < 0.8) return "needs_review";
  return "matched";
}

export function serializeAnalysisItem(result, index, options = {}) {
  const candidateLimit = options.candidateLimit ?? 3;

  return {
    index: index + 1,
    status: matchStatus(result),
    source: result.source,
    confidence: result.confidence,
    reason: result.reason,
    appleCandidate: result.candidate,
    searchTerm: result.searchTerm,
    candidateCount: result.candidates?.length ?? 0,
    candidates: (result.candidates ?? []).slice(0, candidateLimit)
  };
}

export function summaryFromAnalysisItems(items) {
  const unmatchedCount = items.filter((item) => item.status === "unmatched").length;
  const needsReviewCount = items.filter((item) => item.status === "needs_review").length;
  const confidentMatchCount = items.filter((item) => item.status === "matched").length;
  const matchedCount = items.length - unmatchedCount;

  return {
    matchedCount,
    unmatchedCount,
    needsReviewCount,
    confidentMatchCount,
    matchRate: items.length === 0 ? 0 : matchedCount / items.length
  };
}

export function serializedAnalysisFromItems(playlist, items, playlistExtra = {}) {
  return {
    playlist: {
      id: playlist.id,
      name: playlist.name,
      totalItems: items.length,
      ...playlistExtra
    },
    summary: summaryFromAnalysisItems(items),
    items
  };
}

export function serializeAnalysis(analysis, playlistExtra = {}, options = {}) {
  const items = analysis.results.map((result, index) => serializeAnalysisItem(result, index, options));
  return serializedAnalysisFromItems(
    {
      id: analysis.playlistId,
      name: analysis.playlistName
    },
    items,
    playlistExtra
  );
}

export function transferReportFromSerializedAnalysis(serializedAnalysis) {
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

export function analysisLimitFromBody(body) {
  return Math.min(
    numberFromBody(body.limit ?? body.analysisLimit, DEFAULT_PUBLIC_ANALYSIS_LIMIT),
    MAX_PUBLIC_ANALYSIS_LIMIT
  );
}

export function slicePlaylistForAnalysis(playlist, limit) {
  const tracks = playlist.tracks.slice(0, limit);
  return {
    ...playlist,
    totalItems: tracks.length,
    tracks
  };
}

export function playlistAnalysisMetadata(playlist, analyzedTrackCount) {
  return {
    kind: playlist.kind ?? "playlist",
    imageUrl: playlist.imageUrl,
    source: playlist.source,
    limitations: playlist.limitations,
    originalTotalItems: playlist.totalItems,
    analyzedTrackCount,
    partialAnalysis: analyzedTrackCount < playlist.totalItems
  };
}

export async function createApplePlaylistFromMatches(input) {
  const minConfidence = input.minConfidence ?? 0;
  const matchedSongIds = input.results
    .filter((result) => result.matched && result.candidate && result.confidence >= minConfidence)
    .map((result) => result.candidate.id);

  if (matchedSongIds.length === 0) {
    throw new Error("No confident Apple Music matches are available to create a playlist.");
  }

  const createdApplePlaylistId = await input.apple.createPlaylist(
    `${input.playlistName} (PlaylistXfer)`,
    "Transferred from Spotify with PlaylistXfer. Review and missing tracks were left out."
  );

  await input.apple.addTracksToPlaylist(createdApplePlaylistId, matchedSongIds);

  return createdApplePlaylistId;
}
