import { loadConfig } from "../config.js";
import { writeTransferArtifacts } from "../lib/reporting.js";
import { AppleMusicClient } from "../providers/apple.js";
import { SpotifyClient } from "../providers/spotify.js";
import { runTransfer } from "../transfer/run-transfer.js";

function hasFlag(flag: string): boolean {
  return process.argv.slice(2).includes(flag);
}

async function main(): Promise<void> {
  const config = loadConfig();
  const dryRun = hasFlag("--dry-run");

  const spotify = new SpotifyClient(
    config.spotifyClientId,
    config.spotifyClientSecret,
    config.spotifyRefreshToken
  );
  const apple = new AppleMusicClient(
    config.appleMusicDeveloperToken,
    config.appleMusicUserToken,
    config.appleMusicStorefront
  );

  const report = await runTransfer({
    spotify,
    apple,
    spotifyPlaylistId: config.spotifyPlaylistId,
    dryRun
  });

  await writeTransferArtifacts(config.outputDir, report);

  console.log(JSON.stringify({
    playlistName: report.playlistName,
    matchedCount: report.matchedCount,
    unmatchedCount: report.unmatchedCount,
    matchRate: report.matchRate,
    createdApplePlaylistId: report.createdApplePlaylistId,
    dryRun: report.dryRun
  }, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
