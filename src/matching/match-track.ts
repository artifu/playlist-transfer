import { namesRoughlyMatch, normalizeText } from "../lib/normalize.js";
import type { AppleSongCandidate, MatchResult, SpotifyTrack } from "../types.js";

function durationDifferenceMs(left: number | null, right: number | null): number {
  if (left == null || right == null) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.abs(left - right);
}

export function buildSearchTerm(track: SpotifyTrack): string {
  const primaryArtist = track.artists[0] ?? "";
  return `${track.name} ${primaryArtist}`.trim();
}

export function buildSearchTerms(track: SpotifyTrack): string[] {
  const primaryArtist = track.artists[0] ?? "";
  const terms = [
    `${track.name} ${primaryArtist}`,
    track.album ? `${track.name} ${track.album}` : "",
    track.name
  ];

  return [...new Set(terms.map((term) => term.trim()).filter(Boolean))];
}

export function pickBestMatch(track: SpotifyTrack, candidates: AppleSongCandidate[]): MatchResult {
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
    const byIsrc = candidates.find((candidate) => candidate.isrc === track.isrc);
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

  const primaryArtist = track.artists[0] ?? "";
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
