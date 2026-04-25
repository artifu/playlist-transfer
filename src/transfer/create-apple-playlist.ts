import { AppleMusicClient } from "../providers/apple.js";
import type { MatchResult } from "../types.js";

type CreateApplePlaylistInput = {
  apple: AppleMusicClient;
  playlistName: string;
  results: MatchResult[];
  minConfidence?: number;
};

export async function createApplePlaylistFromMatches(input: CreateApplePlaylistInput): Promise<string> {
  const minConfidence = input.minConfidence ?? 0;
  const matchedSongIds = input.results
    .filter((result) => result.matched && result.candidate && result.confidence >= minConfidence)
    .map((result) => result.candidate!.id);

  const createdApplePlaylistId = await input.apple.createPlaylist(
    `${input.playlistName} (Transferred from Spotify)`,
    "Transferred from Spotify with PlaylistTransfer."
  );

  await input.apple.addTracksToPlaylist(createdApplePlaylistId, matchedSongIds);

  return createdApplePlaylistId;
}
