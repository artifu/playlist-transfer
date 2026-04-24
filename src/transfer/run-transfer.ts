import { AppleMusicClient } from "../providers/apple.js";
import { SpotifyClient } from "../providers/spotify.js";
import type { TransferReport } from "../types.js";
import { analyzeTransfer } from "./analyze-transfer.js";
import { createApplePlaylistFromMatches } from "./create-apple-playlist.js";

type RunTransferInput = {
  spotify: SpotifyClient;
  apple: AppleMusicClient;
  spotifyPlaylistId: string;
  dryRun: boolean;
};

export async function runTransfer(input: RunTransferInput): Promise<TransferReport> {
  const analysis = await analyzeTransfer(input);

  let createdApplePlaylistId: string | null = null;
  if (!input.dryRun) {
    createdApplePlaylistId = await createApplePlaylistFromMatches({
      apple: input.apple,
      playlistName: analysis.playlistName,
      results: analysis.results
    });
  }

  return {
    ...analysis,
    createdApplePlaylistId,
    dryRun: input.dryRun
  };
}
