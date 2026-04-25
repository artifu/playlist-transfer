import { parseSpotifyPlaylistInput } from "../lib/spotify-url.js";
import type { SpotifyPlaylist, SpotifyTrack } from "../types.js";

const DEFAULT_TIMEOUT_MS = 20_000;
const SPOTIFY_PUBLIC_METADATA_CONCURRENCY = 4;
const SPOTIFY_BASE62_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

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

export type PublicSpotifySpclientProbe = {
  url: string;
  status: number;
  ok: boolean;
  playlistLength: number;
  playlistRows: number;
  uniqueTrackCount: number;
  dedupedDuplicateCount: number;
  skippedRowCount: number;
  metadataErrorCount: number;
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
  spclient: PublicSpotifySpclientProbe | { error: string };
};

export type PublicSpotifyPlaylist = SpotifyPlaylist & {
  source: "spotify-public-spclient" | "spotify-public-embed";
  limitations: string[];
};

export const PUBLIC_SPOTIFY_SPCLIENT_LIMITATIONS = [
  "Uses Spotify public embed session metadata and an internal public web endpoint",
  "Duplicate Spotify track IDs are removed for safer Apple Music playlist creation",
  "Rows without Spotify track IDs and tracks with unreadable metadata are skipped",
  "Spotify may change this public web surface"
];

export const PUBLIC_SPOTIFY_EMBED_LIMITATIONS = [
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

function publicSpotifySpclientPlaylistUrl(playlistId: string): string {
  return `https://spclient.wg.spotify.com/playlist/v2/playlist/${playlistId}?format=json`;
}

function publicSpotifyTrackMetadataUrl(trackId: string): string {
  return `https://spclient.wg.spotify.com/metadata/4/track/${spotifyBase62ToHex(trackId)}`;
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

async function fetchJsonValue<T>(url: string, headers: Record<string, string>): Promise<T> {
  const response = await fetch(url, {
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}: ${text.slice(0, 240)}`);
  }

  return JSON.parse(text) as T;
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

function nestedRecord(value: unknown, key: string): Record<string, unknown> | null {
  return asRecord(asRecord(value)?.[key]);
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

function spotifyBase62ToHex(value: string): string {
  let number = 0n;

  for (const character of value) {
    const digit = SPOTIFY_BASE62_ALPHABET.indexOf(character);
    if (digit < 0) {
      throw new Error(`Invalid Spotify base62 character: ${character}`);
    }
    number = number * 62n + BigInt(digit);
  }

  return number.toString(16).padStart(32, "0");
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
  const payload = extractNextDataPayload(html);
  if (!payload.found) {
    return {
      found: false,
      tracks: []
    };
  }

  if (!payload.data) {
    return {
      found: true,
      tracks: []
    };
  }

  return {
    found: true,
    tracks: collectTrackCandidates(payload.data)
  };
}

function extractNextDataPayload(html: string): {
  found: boolean;
  data: unknown | null;
} {
  const match = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match?.[1]) {
    return {
      found: false,
      data: null
    };
  }

  try {
    const data = JSON.parse(decodeHtmlEntities(match[1])) as unknown;
    return {
      found: true,
      data
    };
  } catch {
    return {
      found: true,
      data: null
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

function embedAccessToken(html: string): string | null {
  const payload = extractNextDataPayload(html);
  const props = nestedRecord(payload.data, "props");
  const pageProps = nestedRecord(props, "pageProps");
  const state = nestedRecord(pageProps, "state");
  const settings = nestedRecord(state, "settings");
  const session = nestedRecord(settings, "session");

  return compactText(session?.accessToken);
}

type SpclientPlaylistResponse = {
  length?: number;
  attributes?: {
    name?: string;
  };
  contents?: {
    pos?: number;
    truncated?: boolean;
    items?: Array<{
      uri?: string;
      attributes?: {
        itemId?: string;
      };
    }>;
  };
};

type SpclientTrackMetadata = {
  name?: string;
  album?: {
    name?: string;
  };
  artist?: Array<{
    name?: string;
  }>;
  duration?: number;
  external_id?: Array<{
    type?: string;
    id?: string;
  }>;
  canonical_uri?: string;
};

function bearerHeaders(accessToken: string): Record<string, string> {
  return {
    ...browserLikeHeaders(),
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`
  };
}

function dedupeTrackIds(items: Array<{ uri?: string }>): {
  trackIds: string[];
  duplicateCount: number;
  skippedRowCount: number;
} {
  const trackIds: string[] = [];
  const seen = new Set<string>();
  let duplicateCount = 0;
  let skippedRowCount = 0;

  for (const item of items) {
    const trackId = spotifyTrackIdFromUri(compactText(item.uri));
    if (!trackId) {
      skippedRowCount += 1;
      continue;
    }

    if (seen.has(trackId)) {
      duplicateCount += 1;
      continue;
    }

    seen.add(trackId);
    trackIds.push(trackId);
  }

  return {
    trackIds,
    duplicateCount,
    skippedRowCount
  };
}

function isrcFromMetadata(metadata: SpclientTrackMetadata): string | null {
  const isrc = metadata.external_id?.find(
    (externalId) => externalId.type?.toLowerCase() === "isrc"
  )?.id;

  return compactText(isrc);
}

function metadataToSpotifyTrack(trackId: string, metadata: SpclientTrackMetadata): SpotifyTrack {
  const name = compactText(metadata.name);
  if (!name) {
    throw new Error(`Missing track name for ${trackId}`);
  }

  return {
    spotifyTrackId: trackId,
    isrc: isrcFromMetadata(metadata),
    name,
    artists:
      metadata.artist
        ?.map((artist) => compactText(artist.name))
        .filter((artist): artist is string => Boolean(artist)) ?? [],
    album: compactText(metadata.album?.name),
    durationMs: durationMs(metadata.duration)
  };
}

async function mapWithConcurrency<T, U>(
  values: T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<U>
): Promise<U[]> {
  const results = new Array<U>(values.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker())
  );

  return results;
}

async function fetchSpclientTrack(
  accessToken: string,
  trackId: string
): Promise<SpotifyTrack> {
  const metadata = await fetchJsonValue<SpclientTrackMetadata>(
    publicSpotifyTrackMetadataUrl(trackId),
    bearerHeaders(accessToken)
  );

  return metadataToSpotifyTrack(trackId, metadata);
}

async function fetchSpclientProbe(
  playlistId: string,
  accessToken: string
): Promise<PublicSpotifySpclientProbe> {
  const url = publicSpotifySpclientPlaylistUrl(playlistId);
  const playlist = await fetchJsonValue<SpclientPlaylistResponse>(url, bearerHeaders(accessToken));
  const items = playlist.contents?.items ?? [];
  const { trackIds, duplicateCount, skippedRowCount } = dedupeTrackIds(items);
  const metadataResults = await mapWithConcurrency(
    trackIds,
    SPOTIFY_PUBLIC_METADATA_CONCURRENCY,
    async (trackId): Promise<SpotifyTrack | null> => {
      try {
        return await fetchSpclientTrack(accessToken, trackId);
      } catch {
        return null;
      }
    }
  );
  const tracks = metadataResults.filter((track): track is SpotifyTrack => Boolean(track));

  return {
    url,
    status: 200,
    ok: true,
    playlistLength: playlist.length ?? items.length,
    playlistRows: items.length,
    uniqueTrackCount: trackIds.length,
    dedupedDuplicateCount: duplicateCount,
    skippedRowCount,
    metadataErrorCount: metadataResults.length - tracks.length,
    extractedTrackCount: tracks.length,
    tracks
  };
}

export async function probePublicSpotifyPlaylist(input: string): Promise<PublicSpotifyProbeReport> {
  const playlistId = parseSpotifyPlaylistInput(input);
  const [oembed, openPage, embedPage] = await Promise.allSettled([
    fetchJson(publicSpotifyOembedUrl(playlistId)),
    fetchText(publicSpotifyPlaylistUrl(playlistId)),
    fetchText(publicSpotifyEmbedUrl(playlistId))
  ]);
  const spclient =
    embedPage.status === "fulfilled"
      ? await (async (): Promise<PublicSpotifySpclientProbe | { error: string }> => {
          const accessToken = embedAccessToken(embedPage.value.text);
          if (!accessToken) {
            return {
              error: "Could not find an anonymous Spotify embed access token."
            };
          }

          try {
            return await fetchSpclientProbe(playlistId, accessToken);
          } catch (error) {
            return {
              error: errorMessage(error)
            };
          }
        })()
      : {
          error: "Could not fetch Spotify embed page."
        };

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
          },
    spclient
  };
}

export function bestPublicSpotifyTracks(report: PublicSpotifyProbeReport): SpotifyTrack[] {
  const spclientTracks = "tracks" in report.spclient ? report.spclient.tracks : [];
  if (spclientTracks.length > 0) {
    return spclientTracks;
  }

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
  const usedSpclient = "tracks" in report.spclient && report.spclient.tracks.length > 0;

  if (tracks.length === 0) {
    throw new Error("Could not read tracks from Spotify public pages for this playlist.");
  }

  return {
    id: report.playlistId,
    name: publicSpotifyPlaylistName(report),
    description: usedSpclient
      ? "Read from Spotify public embed session metadata and public web endpoints without Spotify user OAuth."
      : "Read from Spotify public embed metadata without Spotify user OAuth.",
    totalItems: tracks.length,
    tracks,
    source: usedSpclient ? "spotify-public-spclient" : "spotify-public-embed",
    limitations: usedSpclient ? PUBLIC_SPOTIFY_SPCLIENT_LIMITATIONS : PUBLIC_SPOTIFY_EMBED_LIMITATIONS
  };
}
