import { buildSearchTerms, pickBestMatch } from "../matching/match-track.js";
import { AppleMusicClient } from "../providers/apple.js";
import { SpotifyClient } from "../providers/spotify.js";
import type { AppleSongCandidate, MatchResult, SpotifyPlaylist, TransferAnalysis } from "../types.js";

type AnalyzeTransferInput = {
  spotify: SpotifyClient;
  apple: AppleMusicClient;
  spotifyPlaylistId: string;
};

function dedupeCandidates(candidates: AppleSongCandidate[]): AppleSongCandidate[] {
  const byId = new Map<string, AppleSongCandidate>();

  for (const candidate of candidates) {
    byId.set(candidate.id, candidate);
  }

  return [...byId.values()];
}

export async function analyzeSpotifyPlaylist(
  playlist: SpotifyPlaylist,
  apple: AppleMusicClient
): Promise<TransferAnalysis> {
  const results: MatchResult[] = [];

  for (const track of playlist.tracks) {
    const searchTerms = buildSearchTerms(track);
    const candidates: AppleSongCandidate[] = [];

    for (const searchTerm of searchTerms) {
      candidates.push(...(await apple.searchSongs(searchTerm)));
    }

    const uniqueCandidates = dedupeCandidates(candidates);

    results.push({
      ...pickBestMatch(track, uniqueCandidates),
      searchTerm: searchTerms.join(" | "),
      candidates: uniqueCandidates
    });
  }

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
