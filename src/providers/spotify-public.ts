import { parseSpotifyPlaylistInput } from "../lib/spotify-url.js";
import type { SpotifyPlaylist, SpotifyTrack } from "../types.js";

const DEFAULT_TIMEOUT_MS = 20_000;

type FetchTextResult = {
  url: string;
  finalUrl: string;
  status: number;
  ok: boolean;
  contentType: string | null;
  bodyLength: number;
  text: string;
};

type FetchJsonResult = Omit<FetchTextResult, "text"> & {
  json: unknown;
  text: string;
};

export type PublicSpotifyHtmlProbe = {
  url: string;
  finalUrl: string;
  status: number;
  ok: boolean;
  contentType: string | null;
  bodyLength: number;
  jsonLdScriptCount: number;
  jsonLdParsedCount: number;
  nextDataFound: boolean;
  extractedTrackCount: number;
  tracks: SpotifyTrack[];
};

export type PublicSpotifyProbeReport = {
  input: string;
  playlistId: string;
  probedAt: string;
  oembed:
    | {
        status: number;
        ok: boolean;
        title: string | null;
        iframeUrl: string | null;
        thumbnailUrl: string | null;
      }
    | {
        error: string;
      };
  openPage: PublicSpotifyHtmlProbe | { error: string };
  embedPage: PublicSpotifyHtmlProbe | { error: string };
};

export type PublicSpotifyPlaylist = SpotifyPlaylist & {
  source: "spotify-public-embed";
  limitations: string[];
};

export const PUBLIC_SPOTIFY_METADATA_LIMITATIONS = [
  "No ISRC from public embed metadata",
  "Album metadata is often missing",
  "Spotify may change this public page structure"
];

export function publicSpotifyPlaylistUrl(playlistId: string): string {
  return `https://open.spotify.com/playlist/${playlistId}`;
}

function publicSpotifyEmbedUrl(playlistId: string): string {
  return `https://open.spotify.com/embed/playlist/${playlistId}`;
}

function publicSpotifyOembedUrl(playlistId: string): string {
  return `https://open.spotify.com/oembed?url=${encodeURIComponent(publicSpotifyPlaylistUrl(playlistId))}`;
}

function browserLikeHeaders(): Record<string, string> {
  return {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
  };
}

async function fetchText(url: string): Promise<FetchTextResult> {
  const response = await fetch(url, {
    headers: browserLikeHeaders(),
    redirect: "follow",
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
  });
  const text = await response.text();

  return {
    url,
    finalUrl: response.url,
    status: response.status,
    ok: response.ok,
    contentType: response.headers.get("content-type"),
    bodyLength: text.length,
    text
  };
}

async function fetchJson(url: string): Promise<FetchJsonResult> {
  const response = await fetch(url, {
    headers: browserLikeHeaders(),
    redirect: "follow",
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
  });
  const text = await response.text();

  return {
    url,
    finalUrl: response.url,
    status: response.status,
    ok: response.ok,
    contentType: response.headers.get("content-type"),
    bodyLength: text.length,
    json: text ? (JSON.parse(text) as unknown) : null,
    text
  };
}

function decodeHtmlEntities(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function compactText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const compacted = value.replace(/\s+/g, " ").trim();
  return compacted || null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function artistNames(value: unknown): string[] {
  if (!value) {
    return [];
  }

  if (typeof value === "string") {
    return value
      .split(/\s*,\s*/)
      .map((artist) => compactText(artist.replace(/\u00a0/g, " ")))
      .filter((artist): artist is string => Boolean(artist));
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => artistNames(item));
  }

  const record = asRecord(value);
  if (record) {
    const name = compactText(record.name);
    if (name) {
      return [name];
    }
  }

  return [];
}

function albumName(value: unknown): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return compactText(value);
  }

  const record = asRecord(value);
  if (record) {
    return compactText(record.name) ?? compactText(record.title);
  }

  return null;
}

function looksLikeTrackObject(value: unknown): value is Record<string, unknown> {
  const record = asRecord(value);
  if (!record) {
    return false;
  }

  const type = String(record["@type"] ?? record.type ?? record.__typename ?? "").toLowerCase();
  const uri = String(record.uri ?? record.shareUrl ?? record.url ?? "");

  return (
    type.includes("track") ||
    type.includes("musicrecording") ||
    uri.includes("spotify:track:") ||
    uri.includes("/track/")
  );
}

function spotifyTrackIdFromUri(uri: string | null): string | null {
  if (!uri) {
    return null;
  }

  const match = uri.match(/spotify:track:([A-Za-z0-9]{22})|\/track\/([A-Za-z0-9]{22})/);
  return match?.[1] ?? match?.[2] ?? null;
}

function durationMs(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

function normalizeTrackCandidate(value: Record<string, unknown>): SpotifyTrack | null {
  const name = compactText(value.name ?? value.title);
  if (!name) {
    return null;
  }

  const uri = compactText(value.uri ?? value.url ?? value.shareUrl);

  return {
    spotifyTrackId: spotifyTrackIdFromUri(uri),
    isrc: null,
    name,
    artists: artistNames(value.byArtist ?? value.artists ?? value.artist ?? value.subtitle),
    album:
      albumName(value.inAlbum) ??
      albumName(value.albumOfTrack) ??
      albumName(value.album) ??
      null,
    durationMs: durationMs(value.duration_ms) ?? durationMs(value.durationMs) ?? durationMs(value.duration)
  };
}

function collectTrackCandidates(
  value: unknown,
  tracks: SpotifyTrack[] = [],
  seen = new Set<string>()
): SpotifyTrack[] {
  if (!value || typeof value !== "object") {
    return tracks;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectTrackCandidates(item, tracks, seen);
    }
    return tracks;
  }

  if (looksLikeTrackObject(value)) {
    const track = normalizeTrackCandidate(value);
    if (track) {
      const rowUid = compactText(value.uid);
      const key = [rowUid ?? track.spotifyTrackId, track.name, track.artists.join(","), track.album].join("|");
      if (!seen.has(key)) {
        seen.add(key);
        tracks.push(track);
      }
    }
  }

  for (const child of Object.values(value)) {
    collectTrackCandidates(child, tracks, seen);
  }

  return tracks;
}

function extractJsonLd(html: string): {
  scriptCount: number;
  parsedCount: number;
  tracks: SpotifyTrack[];
} {
  const scripts = [
    ...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  ];
  const parsed: unknown[] = [];

  for (const script of scripts) {
    const text = decodeHtmlEntities(script[1]?.trim() ?? "");
    if (!text) {
      continue;
    }

    try {
      parsed.push(JSON.parse(text) as unknown);
    } catch {
      // Keep probing even when one embedded script is malformed.
    }
  }

  return {
    scriptCount: scripts.length,
    parsedCount: parsed.length,
    tracks: collectTrackCandidates(parsed)
  };
}

function extractNextData(html: string): {
  found: boolean;
  tracks: SpotifyTrack[];
} {
  const match = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match?.[1]) {
    return {
      found: false,
      tracks: []
    };
  }

  try {
    const data = JSON.parse(decodeHtmlEntities(match[1])) as unknown;
    return {
      found: true,
      tracks: collectTrackCandidates(data)
    };
  } catch {
    return {
      found: true,
      tracks: []
    };
  }
}

function dedupeTracks(tracks: SpotifyTrack[]): SpotifyTrack[] {
  const unique: SpotifyTrack[] = [];
  const seen = new Set<string>();

  for (const track of tracks) {
    const key = [track.spotifyTrackId, track.name, track.artists.join(","), track.album, track.durationMs].join("|");
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(track);
    }
  }

  return unique;
}

function summarizeHtmlProbe(probe: FetchTextResult): PublicSpotifyHtmlProbe {
  const jsonLd = extractJsonLd(probe.text);
  const nextData = extractNextData(probe.text);
  const tracks = nextData.tracks.length > 0 ? nextData.tracks : dedupeTracks(jsonLd.tracks);

  return {
    url: probe.url,
    finalUrl: probe.finalUrl,
    status: probe.status,
    ok: probe.ok,
    contentType: probe.contentType,
    bodyLength: probe.bodyLength,
    jsonLdScriptCount: jsonLd.scriptCount,
    jsonLdParsedCount: jsonLd.parsedCount,
    nextDataFound: nextData.found,
    extractedTrackCount: tracks.length,
    tracks
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function oembedString(json: unknown, key: string): string | null {
  const record = asRecord(json);
  return record ? compactText(record[key]) : null;
}

export async function probePublicSpotifyPlaylist(input: string): Promise<PublicSpotifyProbeReport> {
  const playlistId = parseSpotifyPlaylistInput(input);
  const [oembed, openPage, embedPage] = await Promise.allSettled([
    fetchJson(publicSpotifyOembedUrl(playlistId)),
    fetchText(publicSpotifyPlaylistUrl(playlistId)),
    fetchText(publicSpotifyEmbedUrl(playlistId))
  ]);

  return {
    input,
    playlistId,
    probedAt: new Date().toISOString(),
    oembed:
      oembed.status === "fulfilled"
        ? {
            status: oembed.value.status,
            ok: oembed.value.ok,
            title: oembedString(oembed.value.json, "title"),
            iframeUrl: oembedString(oembed.value.json, "iframe_url"),
            thumbnailUrl: oembedString(oembed.value.json, "thumbnail_url")
          }
        : {
            error: errorMessage(oembed.reason)
          },
    openPage:
      openPage.status === "fulfilled"
        ? summarizeHtmlProbe(openPage.value)
        : {
            error: errorMessage(openPage.reason)
          },
    embedPage:
      embedPage.status === "fulfilled"
        ? summarizeHtmlProbe(embedPage.value)
        : {
            error: errorMessage(embedPage.reason)
          }
  };
}

export function bestPublicSpotifyTracks(report: PublicSpotifyProbeReport): SpotifyTrack[] {
  const embedTracks = "tracks" in report.embedPage ? report.embedPage.tracks : [];
  const openTracks = "tracks" in report.openPage ? report.openPage.tracks : [];
  return embedTracks.length >= openTracks.length ? embedTracks : openTracks;
}

export function publicSpotifyPlaylistName(report: PublicSpotifyProbeReport): string {
  if ("title" in report.oembed && report.oembed.title) {
    return report.oembed.title;
  }

  return `Spotify playlist ${report.playlistId}`;
}

export async function getPublicSpotifyPlaylist(input: string): Promise<PublicSpotifyPlaylist> {
  const report = await probePublicSpotifyPlaylist(input);
  const tracks = bestPublicSpotifyTracks(report);

  if (tracks.length === 0) {
    throw new Error("Could not read tracks from Spotify public pages for this playlist.");
  }

  return {
    id: report.playlistId,
    name: publicSpotifyPlaylistName(report),
    description: "Read from Spotify public embed metadata without Spotify OAuth.",
    totalItems: tracks.length,
    tracks,
    source: "spotify-public-embed",
    limitations: PUBLIC_SPOTIFY_METADATA_LIMITATIONS
  };
}
