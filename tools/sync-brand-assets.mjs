import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");

const brandSource = {
  faviconSvg: "DesignSuggestions/brand-assets/svg/icon-appicon-square-cream.svg",
  icon1024: "DesignSuggestions/brand-assets/png/cream/icon-1024.png",
  icon512: "DesignSuggestions/brand-assets/png/cream/icon-512.png",
  icon180: "DesignSuggestions/brand-assets/png/cream/icon-180.png"
};

const exactCopies = [
  [brandSource.faviconSvg, "apps/web/public/favicon.svg"],
  [brandSource.icon180, "apps/web/public/apple-touch-icon.png"],
  [brandSource.faviconSvg, "apps/web/public/playlistxfer-icon.svg"],
  [brandSource.icon180, "apps/web/public/playlistxfer-icon-180.png"],
  [brandSource.icon512, "apps/web/public/playlistxfer-icon-512.png"]
];

const appIconPngs = [
  ["apps/ios/PlaylistXfer/Assets.xcassets/AppIcon.appiconset/Icon-1024.png", 1024],
  ["apps/ios/PlaylistXfer/Assets.xcassets/AppIcon.appiconset/Icon-20@1x.png", 20],
  ["apps/ios/PlaylistXfer/Assets.xcassets/AppIcon.appiconset/Icon-20@2x.png", 40],
  ["apps/ios/PlaylistXfer/Assets.xcassets/AppIcon.appiconset/Icon-20@3x.png", 60],
  ["apps/ios/PlaylistXfer/Assets.xcassets/AppIcon.appiconset/Icon-29@1x.png", 29],
  ["apps/ios/PlaylistXfer/Assets.xcassets/AppIcon.appiconset/Icon-29@2x.png", 58],
  ["apps/ios/PlaylistXfer/Assets.xcassets/AppIcon.appiconset/Icon-29@3x.png", 87],
  ["apps/ios/PlaylistXfer/Assets.xcassets/AppIcon.appiconset/Icon-40@1x.png", 40],
  ["apps/ios/PlaylistXfer/Assets.xcassets/AppIcon.appiconset/Icon-40@2x.png", 80],
  ["apps/ios/PlaylistXfer/Assets.xcassets/AppIcon.appiconset/Icon-40@3x.png", 120],
  ["apps/ios/PlaylistXfer/Assets.xcassets/AppIcon.appiconset/Icon-60@2x.png", 120],
  ["apps/ios/PlaylistXfer/Assets.xcassets/AppIcon.appiconset/Icon-60@3x.png", 180],
  ["apps/ios/PlaylistXfer/Assets.xcassets/AppIcon.appiconset/Icon-76@1x.png", 76],
  ["apps/ios/PlaylistXfer/Assets.xcassets/AppIcon.appiconset/Icon-76@2x.png", 152],
  ["apps/ios/PlaylistXfer/Assets.xcassets/AppIcon.appiconset/Icon-83.5@2x.png", 167]
];

const resizedPngs = [
  ["apps/web/public/playlistxfer-icon-32.png", 32],
  ["apps/ios/PlaylistXfer/Assets.xcassets/BrandMark.imageset/BrandMark.png", 30],
  ["apps/ios/PlaylistXfer/Assets.xcassets/BrandMark.imageset/BrandMark@2x.png", 60],
  ["apps/ios/PlaylistXfer/Assets.xcassets/BrandMark.imageset/BrandMark@3x.png", 90]
];

function abs(relativePath) {
  return path.join(root, relativePath);
}

async function sha256(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function ensureParent(filePath) {
  await mkdir(path.dirname(filePath), { recursive: true });
}

function resizePng(sourcePath, outputPath, size) {
  const result = spawnSync(
    "ffmpeg",
    [
      "-loglevel", "error",
      "-y",
      "-i", sourcePath,
      "-vf", `scale=${size}:${size}:flags=lanczos`,
      "-frames:v", "1",
      "-pix_fmt", "rgb24",
      outputPath
    ],
    { encoding: "utf8" }
  );

  if (result.status !== 0) {
    throw new Error(`ffmpeg failed for ${outputPath}: ${result.stderr || result.stdout}`);
  }
}

async function buildExpectedAssets(destinationRoot) {
  const expected = [];

  for (const [sourceRelative, targetRelative] of exactCopies) {
    const outputPath = path.join(destinationRoot, targetRelative);
    await ensureParent(outputPath);
    await copyFile(abs(sourceRelative), outputPath);
    expected.push([targetRelative, outputPath]);
  }

  for (const [targetRelative, size] of appIconPngs) {
    const outputPath = path.join(destinationRoot, targetRelative);
    await ensureParent(outputPath);
    resizePng(abs(brandSource.icon1024), outputPath, size);
    expected.push([targetRelative, outputPath]);
  }

  for (const [targetRelative, size] of resizedPngs) {
    const outputPath = path.join(destinationRoot, targetRelative);
    await ensureParent(outputPath);
    resizePng(abs(brandSource.icon1024), outputPath, size);
    expected.push([targetRelative, outputPath]);
  }

  return expected;
}

async function syncAssets() {
  await buildExpectedAssets(root);
  console.log("Brand assets synced from DesignSuggestions/brand-assets.");
}

async function checkAssets() {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "playlistxfer-brand-"));

  try {
    const expected = await buildExpectedAssets(tempRoot);
    const mismatches = [];

    for (const [targetRelative, expectedPath] of expected) {
      const targetPath = abs(targetRelative);
      const [expectedHash, targetHash] = await Promise.all([
        sha256(expectedPath),
        sha256(targetPath)
      ]);

      if (expectedHash !== targetHash) {
        mismatches.push(targetRelative);
      }
    }

    if (mismatches.length > 0) {
      console.error("Brand asset drift detected:");
      for (const mismatch of mismatches) {
        console.error(`- ${mismatch}`);
      }
      console.error("Run `npm run brand:sync` to regenerate web and iOS brand assets.");
      process.exitCode = 1;
      return;
    }

    console.log("Brand assets match DesignSuggestions/brand-assets.");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

if (checkOnly) {
  await checkAssets();
} else {
  await syncAssets();
}
