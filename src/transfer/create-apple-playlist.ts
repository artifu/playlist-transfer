import { AppleMusicClient } from "../providers/apple.js";
import type { MatchResult } from "../types.js";

type CreateApplePlaylistInput = {
  apple: AppleMusicClient;
  playlistName: string;
  results: MatchResult[];
};

export async function createApplePlaylistFromMatches(input: CreateApplePlaylistInput): Promise<string> {
  const matchedSongIds = input.results
    .filter((result) => result.matched && result.candidate)
    .map((result) => result.candidate!.id);

  const createdApplePlaylistId = await input.apple.createPlaylist(
    `${input.playlistName} (Transferred from Spotify)`,
    "Transferred from Spotify with PlaylistTransfer."
  );

  await input.apple.addTracksToPlaylist(createdApplePlaylistId, matchedSongIds);

  return createdApplePlaylistId;
}
