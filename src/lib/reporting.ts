import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { TransferReport } from "../types.js";

function escapeCsv(value: string | number | boolean | null): string {
  const text = value == null ? "" : String(value);
  const escaped = text.replaceAll("\"", "\"\"");
  return `"${escaped}"`;
}

function toCsv(report: TransferReport): string {
  const headers = [
    "source_name",
    "source_artists",
    "source_album",
    "source_isrc",
    "matched",
    "confidence",
    "reason",
    "apple_song_id",
    "apple_name",
    "apple_artist",
    "apple_album"
  ];

  const rows = report.results.map((result) =>
    [
      result.source.name,
      result.source.artists.join(", "),
      result.source.album,
      result.source.isrc,
      result.matched,
      result.confidence,
      result.reason,
      result.candidate?.id ?? null,
      result.candidate?.name ?? null,
      result.candidate?.artistName ?? null,
      result.candidate?.albumName ?? null
    ]
      .map(escapeCsv)
      .join(",")
  );

  return [headers.join(","), ...rows].join("\n");
}

export async function writeTransferArtifacts(outputDir: string, report: TransferReport): Promise<void> {
  await mkdir(outputDir, { recursive: true });

  await Promise.all([
    writeFile(join(outputDir, "report.json"), JSON.stringify(report, null, 2), "utf8"),
    writeFile(join(outputDir, "report.csv"), toCsv(report), "utf8"),
    writeFile(
      join(outputDir, "unmatched.json"),
      JSON.stringify(report.results.filter((result) => !result.matched), null, 2),
      "utf8"
    )
  ]);
}
