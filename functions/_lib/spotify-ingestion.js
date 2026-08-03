import { getPublicSpotifyPlaylist } from "./spotify-public.js";
import { parseSpotifyInput } from "./spotify-url.js";

const DEFAULT_TRANSFER_API_URL = "https://playlist-transfer-api.onrender.com";

function transferApiUrl(env) {
  try {
    return new URL(env?.TRANSFER_API_URL || DEFAULT_TRANSFER_API_URL);
  } catch {
    return new URL(DEFAULT_TRANSFER_API_URL);
  }
}

async function resolvedSpotifyInput(input, fetchImpl) {
  try {
    return {
      input,
      parsed: parseSpotifyInput(input)
    };
  } catch (originalError) {
    let url;
    try {
      url = new URL(String(input ?? "").trim());
    } catch {
      throw originalError;
    }

    if (url.hostname !== "spotify.link") throw originalError;

    const response = await fetchImpl(url.toString(), {
      redirect: "follow",
      signal: AbortSignal.timeout(20_000)
    });
    const finalUrl = response.url;

    return {
      input: finalUrl,
      parsed: parseSpotifyInput(finalUrl)
    };
  }
}

function normalizedPlaylist(payload) {
  const playlist = payload?.playlist;
  const tracks = payload?.tracks;

  if (!playlist || typeof playlist !== "object" || !Array.isArray(tracks) || tracks.length === 0) {
    throw new Error("The Spotify ingestion service returned an incomplete playlist.");
  }

  return {
    id: playlist.id,
    kind: playlist.kind ?? "playlist",
    name: playlist.name,
    description: playlist.description,
    imageUrl: playlist.imageUrl,
    totalItems: tracks.length,
    tracks,
    source: playlist.source,
    limitations: playlist.limitations
  };
}

async function fetchPlaylistThroughTransferApi(env, input, fetchImpl) {
  const url = new URL("/api/spotify/public-playlist-preview", transferApiUrl(env));
  const response = await fetchImpl(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-PlaylistTransfer-Proxy": "cloudflare-native-ingestion"
    },
    body: JSON.stringify({ input }),
    signal: AbortSignal.timeout(30_000)
  });
  const text = await response.text();

  if (!response.ok) {
    let detail = text.slice(0, 240);
    try {
      detail = JSON.parse(text)?.message || detail;
    } catch {
      // Preserve the short response excerpt when the upstream response is not JSON.
    }
    throw new Error(`Spotify ingestion service returned HTTP ${response.status}: ${detail}`);
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("The Spotify ingestion service returned invalid JSON.");
  }

  return normalizedPlaylist(payload);
}

/**
 * Cloudflare Workers should not expand a large playlist with one outgoing
 * metadata request per track. A configured backend can do that work once and
 * return the complete normalized track list in a single Worker subrequest.
 * Single-track links stay local because they require only a handful of calls.
 */
export async function getSpotifyPlaylistForEnvironment(
  env,
  input,
  fetchImpl = fetch
) {
  const resolved = await resolvedSpotifyInput(input, fetchImpl);

  if (resolved.parsed.kind === "track") {
    return getPublicSpotifyPlaylist(resolved.input);
  }

  return fetchPlaylistThroughTransferApi(env, resolved.input, fetchImpl);
}

