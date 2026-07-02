import { namesRoughlyMatch, normalizeText } from "./normalize.js";

function durationDifferenceMs(left, right) {
  if (left == null || right == null) return Number.POSITIVE_INFINITY;
  return Math.abs(left - right);
}

function isrcCandidateScore(track, candidate) {
  const primaryArtist = track.artists?.[0] ?? "";
  let score = 0;

  if (namesRoughlyMatch(track.name, candidate.name)) score += 4;
  if (namesRoughlyMatch(primaryArtist, candidate.artistName)) score += 4;
  if (track.album && candidate.albumName && namesRoughlyMatch(track.album, candidate.albumName)) score += 3;

  const durationDifference = durationDifferenceMs(track.durationMs, candidate.durationMs);
  if (durationDifference < 2_000) score += 2;
  else if (durationDifference < 5_000) score += 1;

  return score;
}

export function buildSearchTerms(track) {
  const primaryArtist = track.artists?.[0] ?? "";
  const terms = [
    `${track.name} ${primaryArtist}`,
    track.album ? `${track.name} ${track.album}` : "",
    track.name
  ];

  return [...new Set(terms.map((term) => term.trim()).filter(Boolean))];
}

export function pickBestMatch(track, candidates) {
  if (candidates.length === 0) {
    return {
      source: track,
      matched: false,
      confidence: 0,
      reason: null,
      candidate: null
    };
  }

  if (track.isrc) {
    const sourceISRC = String(track.isrc).trim().toUpperCase();
    const byIsrc = candidates
      .filter((candidate) => String(candidate.isrc ?? "").trim().toUpperCase() === sourceISRC)
      .sort((left, right) => isrcCandidateScore(track, right) - isrcCandidateScore(track, left))[0];
    if (byIsrc) {
      return {
        source: track,
        matched: true,
        confidence: 1,
        reason: "isrc",
        candidate: byIsrc
      };
    }
  }

  const primaryArtist = track.artists?.[0] ?? "";
  const exact = candidates.find(
    (candidate) =>
      track.name.toLowerCase() === candidate.name.toLowerCase() &&
      primaryArtist.toLowerCase() === candidate.artistName.toLowerCase()
  );

  if (exact) {
    return {
      source: track,
      matched: true,
      confidence: 0.96,
      reason: "exact-title-artist",
      candidate: exact
    };
  }

  const normalized = candidates.find(
    (candidate) =>
      namesRoughlyMatch(track.name, candidate.name) &&
      namesRoughlyMatch(primaryArtist, candidate.artistName) &&
      durationDifferenceMs(track.durationMs, candidate.durationMs) < 5000
  );

  if (normalized) {
    return {
      source: track,
      matched: true,
      confidence: 0.82,
      reason: "normalized-title-artist",
      candidate: normalized
    };
  }

  const fallback = candidates.find((candidate) =>
    normalizeText(candidate.artistName).includes(normalizeText(primaryArtist))
  );

  if (fallback) {
    return {
      source: track,
      matched: true,
      confidence: 0.55,
      reason: "artist-only-fallback",
      candidate: fallback
    };
  }

  return {
    source: track,
    matched: false,
    confidence: 0,
    reason: null,
    candidate: null
  };
}
