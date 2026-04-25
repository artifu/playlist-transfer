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
        spclientPlaylistLength: "playlistLength" in report.spclient ? report.spclient.playlistLength : null,
        spclientPlaylistRows: "playlistRows" in report.spclient ? report.spclient.playlistRows : null,
        spclientUniqueTracks: "uniqueTrackCount" in report.spclient ? report.spclient.uniqueTrackCount : null,
        spclientDedupedDuplicates:
          "dedupedDuplicateCount" in report.spclient ? report.spclient.dedupedDuplicateCount : null,
        spclientSkippedRows: "skippedRowCount" in report.spclient ? report.spclient.skippedRowCount : null,
        spclientMetadataErrors:
          "metadataErrorCount" in report.spclient ? report.spclient.metadataErrorCount : null,
        spclientTracks: "extractedTrackCount" in report.spclient ? report.spclient.extractedTrackCount : 0,
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
