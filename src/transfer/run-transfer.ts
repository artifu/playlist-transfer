import { AppleMusicClient } from "../providers/apple.js";
import { SpotifyClient } from "../providers/spotify.js";
import type { MatchResult, TransferReport } from "../types.js";
import { buildSearchTerms, pickBestMatch } from "../matching/match-track.js";

type RunTransferInput = {
  spotify: SpotifyClient;
  apple: AppleMusicClient;
  spotifyPlaylistId: string;
  dryRun: boolean;
};

export async function runTransfer(input: RunTransferInput): Promise<TransferReport> {
  const playlist = await input.spotify.getPlaylist(input.spotifyPlaylistId);
  const results: MatchResult[] = [];

  for (const track of playlist.tracks) {
    const searchTerms = buildSearchTerms(track);
    const candidates = [];

    for (const searchTerm of searchTerms) {
      candidates.push(...(await input.apple.searchSongs(searchTerm)));
    }

    results.push({
      ...pickBestMatch(track, candidates),
      searchTerm: searchTerms.join(" | "),
      candidates
    });
  }

  const matchedSongIds = results
    .filter((result) => result.matched && result.candidate)
    .map((result) => result.candidate!.id);

  let createdApplePlaylistId: string | null = null;
  if (!input.dryRun) {
    const playlistName = `${playlist.name} (Transferred from Spotify)`;
    createdApplePlaylistId = await input.apple.createPlaylist(
      playlistName,
      "Transferred from Spotify with PlaylistTransfer."
    );
    await input.apple.addTracksToPlaylist(createdApplePlaylistId, matchedSongIds);
  }

  const matchedCount = results.filter((result) => result.matched).length;
  const unmatchedCount = results.length - matchedCount;

  return {
    playlistName: playlist.name,
    playlistId: playlist.id,
    matchedCount,
    unmatchedCount,
    matchRate: results.length === 0 ? 0 : matchedCount / results.length,
    createdApplePlaylistId,
    dryRun: input.dryRun,
    results
  };
}
