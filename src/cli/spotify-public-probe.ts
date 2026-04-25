import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  bestPublicSpotifyTracks,
  probePublicSpotifyPlaylist,
  publicSpotifyPlaylistName
} from "../providers/spotify-public.js";

async function main(): Promise<void> {
  const input = process.argv[2];
  if (!input) {
    throw new Error("Usage: npm run spotify:public-probe -- <spotify-playlist-url-or-id>");
  }

  const report = await probePublicSpotifyPlaylist(input);
  const artifactPath = join("artifacts", `public-probe-${report.playlistId}.json`);

  await mkdir("artifacts", { recursive: true });
  await writeFile(artifactPath, JSON.stringify(report, null, 2), "utf8");

  console.log(
    JSON.stringify(
      {
        playlistId: report.playlistId,
        playlistName: publicSpotifyPlaylistName(report),
        openPageTracks: "extractedTrackCount" in report.openPage ? report.openPage.extractedTrackCount : 0,
        embedPageTracks: "extractedTrackCount" in report.embedPage ? report.embedPage.extractedTrackCount : 0,
        selectedTrackCount: bestPublicSpotifyTracks(report).length,
        artifactPath
      },
      null,
      2
    )
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
