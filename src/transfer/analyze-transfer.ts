import { buildSearchTerms, pickBestMatch } from "../matching/match-track.js";
import { AppleMusicClient } from "../providers/apple.js";
import { SpotifyClient } from "../providers/spotify.js";
import type { AppleSongCandidate, MatchResult, SpotifyPlaylist, TransferAnalysis } from "../types.js";

type AnalyzeTransferInput = {
  spotify: SpotifyClient;
  apple: AppleMusicClient;
  spotifyPlaylistId: string;
};

type AnalyzeSpotifyPlaylistOptions = {
  trackConcurrency?: number;
};

const DEFAULT_TRACK_ANALYSIS_CONCURRENCY = 4;

function dedupeCandidates(candidates: AppleSongCandidate[]): AppleSongCandidate[] {
  const byId = new Map<string, AppleSongCandidate>();

  for (const candidate of candidates) {
    byId.set(candidate.id, candidate);
  }

  return [...byId.values()];
}

async function mapWithConcurrency<T, U>(
  values: T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<U>
): Promise<U[]> {
  const results = new Array<U>(values.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
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

async function analyzeTrack(
  track: SpotifyPlaylist["tracks"][number],
  apple: AppleMusicClient
): Promise<MatchResult> {
  const searchTerms = buildSearchTerms(track);
  const attemptedSearchTerms: string[] = [];
  const candidates: AppleSongCandidate[] = [];
  let bestMatch: MatchResult | null = null;

  for (const searchTerm of searchTerms) {
    attemptedSearchTerms.push(searchTerm);
    candidates.push(...(await apple.searchSongs(searchTerm)));

    const uniqueCandidates = dedupeCandidates(candidates);
    bestMatch = pickBestMatch(track, uniqueCandidates);

    if (bestMatch.reason === "isrc") {
      break;
    }
  }

  const uniqueCandidates = dedupeCandidates(candidates);
  const match = bestMatch ?? pickBestMatch(track, uniqueCandidates);

  return {
    ...match,
    searchTerm: attemptedSearchTerms.join(" | "),
    candidates: uniqueCandidates
  };
}

export async function analyzeSpotifyPlaylist(
  playlist: SpotifyPlaylist,
  apple: AppleMusicClient,
  options: AnalyzeSpotifyPlaylistOptions = {}
): Promise<TransferAnalysis> {
  const trackConcurrency = Math.max(
    1,
    options.trackConcurrency ?? DEFAULT_TRACK_ANALYSIS_CONCURRENCY
  );
  const results = await mapWithConcurrency(
    playlist.tracks,
    trackConcurrency,
    (track) => analyzeTrack(track, apple)
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

export async function analyzeTransfer(input: AnalyzeTransferInput): Promise<TransferAnalysis> {
  const playlist = await input.spotify.getPlaylist(input.spotifyPlaylistId);
  return analyzeSpotifyPlaylist(playlist, input.apple);
}
