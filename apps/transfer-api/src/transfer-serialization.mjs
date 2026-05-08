export const DEFAULT_PUBLIC_ANALYSIS_LIMIT = 50;
export const MAX_PUBLIC_ANALYSIS_LIMIT = 500;

function matchStatus(result) {
  if (!result.matched) return "unmatched";
  if (result.confidence < 0.8) return "needs_review";
  return "matched";
}

export function serializeAnalysis(analysis, playlistExtra = {}, options = {}) {
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
    imageUrl: playlist.imageUrl,
    source: playlist.source,
    limitations: playlist.limitations,
    originalTotalItems: playlist.totalItems,
    analyzedTrackCount,
    partialAnalysis: analyzedTrackCount < playlist.totalItems
  };
}
