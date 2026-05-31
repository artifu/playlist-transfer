import { parseSpotifyPlaylistInput } from "./spotify-url.js";

const DEFAULT_TIMEOUT_MS = 20_000;
const SPOTIFY_PUBLIC_METADATA_CONCURRENCY = 4;
const SPOTIFY_BASE62_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const publicPlaylistCache = new Map();

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

export function publicSpotifyPlaylistUrl(playlistId) {
  return `https://open.spotify.com/playlist/${playlistId}`;
}

function publicSpotifyEmbedUrl(playlistId) {
  return `https://open.spotify.com/embed/playlist/${playlistId}`;
}

function publicSpotifyOembedUrl(playlistId) {
  return `https://open.spotify.com/oembed?url=${encodeURIComponent(publicSpotifyPlaylistUrl(playlistId))}`;
}

function publicSpotifySpclientPlaylistUrl(playlistId) {
  return `https://spclient.wg.spotify.com/playlist/v2/playlist/${playlistId}?format=json`;
}

function publicSpotifyTrackMetadataUrl(trackId) {
  return `https://spclient.wg.spotify.com/metadata/4/track/${spotifyBase62ToHex(trackId)}`;
}

function browserLikeHeaders() {
  return {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
  };
}

function timeoutSignal() {
  return AbortSignal.timeout(DEFAULT_TIMEOUT_MS);
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: browserLikeHeaders(),
    redirect: "follow",
    signal: timeoutSignal()
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

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: browserLikeHeaders(),
    redirect: "follow",
    signal: timeoutSignal()
  });
  const text = await response.text();

  return {
    url,
    finalUrl: response.url,
    status: response.status,
    ok: response.ok,
    contentType: response.headers.get("content-type"),
    bodyLength: text.length,
    json: text ? JSON.parse(text) : null,
    text
  };
}

async function fetchJsonValue(url, headers) {
  const response = await fetch(url, {
    headers,
    redirect: "follow",
    signal: timeoutSignal()
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}: ${text.slice(0, 240)}`);
  }

  return JSON.parse(text);
}

function decodeHtmlEntities(value) {
  return String(value)
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function compactText(value) {
  if (typeof value !== "string") return null;
  const compacted = value.replace(/\s+/g, " ").trim();
  return compacted || null;
}

function asRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

function nestedRecord(value, key) {
  return asRecord(asRecord(value)?.[key]);
}

function artistNames(value) {
  if (!value) return [];

  if (typeof value === "string") {
    return value
      .split(/\s*,\s*/)
      .map((artist) => compactText(artist.replace(/\u00a0/g, " ")))
      .filter(Boolean);
  }

  if (Array.isArray(value)) return value.flatMap((item) => artistNames(item));

  const record = asRecord(value);
  if (record) {
    const name = compactText(record.name);
    if (name) return [name];
  }

  return [];
}

function albumName(value) {
  if (!value) return null;
  if (typeof value === "string") return compactText(value);

  const record = asRecord(value);
  if (record) return compactText(record.name) ?? compactText(record.title);

  return null;
}

function spotifyImageUrlFromFileId(fileId) {
  const id = compactText(fileId);
  return id ? `https://i.scdn.co/image/${id}` : null;
}

function imageUrl(value) {
  if (!value) return null;

  if (typeof value === "string") {
    const compacted = compactText(value);
    return compacted?.startsWith("http") ? compacted : null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const url = imageUrl(item);
      if (url) return url;
    }
    return null;
  }

  const record = asRecord(value);
  if (!record) return null;

  return (
    imageUrl(record.url) ??
    imageUrl(record.contentUrl) ??
    imageUrl(record.thumbnailUrl) ??
    spotifyImageUrlFromFileId(record.file_id) ??
    imageUrl(record.image) ??
    imageUrl(record.images)
  );
}

function looksLikeTrackObject(value) {
  const record = asRecord(value);
  if (!record) return false;

  const type = String(record["@type"] ?? record.type ?? record.__typename ?? "").toLowerCase();
  const uri = String(record.uri ?? record.shareUrl ?? record.url ?? "");

  return (
    type.includes("track") ||
    type.includes("musicrecording") ||
    uri.includes("spotify:track:") ||
    uri.includes("/track/")
  );
}

function spotifyTrackIdFromUri(uri) {
  if (!uri) return null;
  const match = uri.match(/spotify:track:([A-Za-z0-9]{22})|\/track\/([A-Za-z0-9]{22})/);
  return match?.[1] ?? match?.[2] ?? null;
}

function spotifyBase62ToHex(value) {
  let number = 0n;

  for (const character of value) {
    const digit = SPOTIFY_BASE62_ALPHABET.indexOf(character);
    if (digit < 0) throw new Error(`Invalid Spotify base62 character: ${character}`);
    number = number * 62n + BigInt(digit);
  }

  return number.toString(16).padStart(32, "0");
}

function durationMs(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function normalizeTrackCandidate(value) {
  const name = compactText(value.name ?? value.title);
  if (!name) return null;

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
    albumImageUrl:
      imageUrl(value.image) ??
      imageUrl(value.images) ??
      imageUrl(value.thumbnailUrl) ??
      imageUrl(nestedRecord(value, "inAlbum")) ??
      imageUrl(nestedRecord(value, "albumOfTrack")) ??
      imageUrl(nestedRecord(value, "album")),
    durationMs: durationMs(value.duration_ms) ?? durationMs(value.durationMs) ?? durationMs(value.duration)
  };
}

function collectTrackCandidates(value, tracks = [], seen = new Set()) {
  if (!value || typeof value !== "object") return tracks;

  if (Array.isArray(value)) {
    for (const item of value) collectTrackCandidates(item, tracks, seen);
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

  for (const child of Object.values(value)) collectTrackCandidates(child, tracks, seen);
  return tracks;
}

function extractJsonLd(html) {
  const scripts = [
    ...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  ];
  const parsed = [];

  for (const script of scripts) {
    const text = decodeHtmlEntities(script[1]?.trim() ?? "");
    if (!text) continue;
    try {
      parsed.push(JSON.parse(text));
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

function extractNextDataPayload(html) {
  const match = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match?.[1]) {
    return {
      found: false,
      data: null
    };
  }

  try {
    return {
      found: true,
      data: JSON.parse(decodeHtmlEntities(match[1]))
    };
  } catch {
    return {
      found: true,
      data: null
    };
  }
}

function extractNextData(html) {
  const payload = extractNextDataPayload(html);
  if (!payload.found || !payload.data) {
    return {
      found: payload.found,
      tracks: []
    };
  }

  return {
    found: true,
    tracks: collectTrackCandidates(payload.data)
  };
}

function dedupeTracks(tracks) {
  const unique = [];
  const seen = new Set();

  for (const track of tracks) {
    const key = [track.spotifyTrackId, track.name, track.artists.join(","), track.album, track.durationMs].join("|");
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(track);
    }
  }

  return unique;
}

function summarizeHtmlProbe(probe) {
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

function localErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function oembedString(json, key) {
  const record = asRecord(json);
  return record ? compactText(record[key]) : null;
}

function embedAccessToken(html) {
  const payload = extractNextDataPayload(html);
  const props = nestedRecord(payload.data, "props");
  const pageProps = nestedRecord(props, "pageProps");
  const state = nestedRecord(pageProps, "state");
  const settings = nestedRecord(state, "settings");
  const session = nestedRecord(settings, "session");
  return compactText(session?.accessToken);
}

function bearerHeaders(accessToken) {
  return {
    ...browserLikeHeaders(),
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`
  };
}

function dedupeTrackIds(items) {
  const trackIds = [];
  const seen = new Set();
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

function isrcFromMetadata(metadata) {
  const isrc = metadata.external_id?.find(
    (externalId) => externalId.type?.toLowerCase() === "isrc"
  )?.id;

  return compactText(isrc);
}

function albumImageUrlFromMetadata(metadata) {
  const images = metadata.album?.cover_group?.image ?? [];
  const preferred =
    images.find((image) => image.size === "SMALL") ??
    images.find((image) => image.width === 300) ??
    images[0];

  return spotifyImageUrlFromFileId(preferred?.file_id);
}

function metadataToSpotifyTrack(trackId, metadata) {
  const name = compactText(metadata.name);
  if (!name) throw new Error(`Missing track name for ${trackId}`);

  return {
    spotifyTrackId: trackId,
    isrc: isrcFromMetadata(metadata),
    name,
    artists:
      metadata.artist
        ?.map((artist) => compactText(artist.name))
        .filter(Boolean) ?? [],
    album: compactText(metadata.album?.name),
    albumImageUrl: albumImageUrlFromMetadata(metadata),
    durationMs: durationMs(metadata.duration)
  };
}

async function mapWithConcurrency(values, concurrency, mapper) {
  const results = new Array(values.length);
  let nextIndex = 0;

  async function worker() {
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

async function fetchSpclientTrack(accessToken, trackId) {
  const metadata = await fetchJsonValue(
    publicSpotifyTrackMetadataUrl(trackId),
    bearerHeaders(accessToken)
  );

  return metadataToSpotifyTrack(trackId, metadata);
}

async function fetchSpclientProbe(playlistId, accessToken) {
  const url = publicSpotifySpclientPlaylistUrl(playlistId);
  const playlist = await fetchJsonValue(url, bearerHeaders(accessToken));
  const items = playlist.contents?.items ?? [];
  const { trackIds, duplicateCount, skippedRowCount } = dedupeTrackIds(items);
  const metadataResults = await mapWithConcurrency(
    trackIds,
    SPOTIFY_PUBLIC_METADATA_CONCURRENCY,
    async (trackId) => {
      try {
        return await fetchSpclientTrack(accessToken, trackId);
      } catch {
        return null;
      }
    }
  );
  const tracks = metadataResults.filter(Boolean);

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

export async function probePublicSpotifyPlaylist(input) {
  const playlistId = parseSpotifyPlaylistInput(input);
  const [oembed, openPage, embedPage] = await Promise.allSettled([
    fetchJson(publicSpotifyOembedUrl(playlistId)),
    fetchText(publicSpotifyPlaylistUrl(playlistId)),
    fetchText(publicSpotifyEmbedUrl(playlistId))
  ]);
  const spclient =
    embedPage.status === "fulfilled"
      ? await (async () => {
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
              error: localErrorMessage(error)
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
            error: localErrorMessage(oembed.reason)
          },
    openPage:
      openPage.status === "fulfilled"
        ? summarizeHtmlProbe(openPage.value)
        : {
            error: localErrorMessage(openPage.reason)
          },
    embedPage:
      embedPage.status === "fulfilled"
        ? summarizeHtmlProbe(embedPage.value)
        : {
            error: localErrorMessage(embedPage.reason)
          },
    spclient
  };
}

export function bestPublicSpotifyTracks(report) {
  const spclientTracks = "tracks" in report.spclient ? report.spclient.tracks : [];
  if (spclientTracks.length > 0) return spclientTracks;

  const embedTracks = "tracks" in report.embedPage ? report.embedPage.tracks : [];
  const openTracks = "tracks" in report.openPage ? report.openPage.tracks : [];
  return embedTracks.length >= openTracks.length ? embedTracks : openTracks;
}

export function publicSpotifyPlaylistName(report) {
  if ("title" in report.oembed && report.oembed.title) return report.oembed.title;
  return `Spotify playlist ${report.playlistId}`;
}

async function fetchPublicSpotifyPlaylist(input) {
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
    imageUrl:
      ("thumbnailUrl" in report.oembed ? report.oembed.thumbnailUrl : null) ??
      tracks.find((track) => track.albumImageUrl)?.albumImageUrl ??
      null,
    totalItems: tracks.length,
    tracks,
    source: usedSpclient ? "spotify-public-spclient" : "spotify-public-embed",
    limitations: usedSpclient ? PUBLIC_SPOTIFY_SPCLIENT_LIMITATIONS : PUBLIC_SPOTIFY_EMBED_LIMITATIONS
  };
}

export async function getPublicSpotifyPlaylist(input) {
  const playlistId = parseSpotifyPlaylistInput(input);
  const cached = publicPlaylistCache.get(playlistId);
  if (cached) return cached;

  const request = fetchPublicSpotifyPlaylist(playlistId).catch((error) => {
    publicPlaylistCache.delete(playlistId);
    throw error;
  });

  publicPlaylistCache.set(playlistId, request);
  return request;
}

