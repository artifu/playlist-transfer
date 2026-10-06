import { getPublicSpotifyPlaylist } from "./spotify-public.js";
import {
  isSpotifyRedirectHost,
  parseSpotifyInput,
  spotifyInputCandidate
} from "./spotify-url.js";

const DEFAULT_TRANSFER_API_URL = "https://playlist-transfer-api.onrender.com";
const PRIMARY_PREVIEW_TIMEOUT_MS = 15_000;
const FALLBACK_PREVIEW_TIMEOUT_MS = 30_000;
const UPSTREAM_RETRY_DELAY_MS = 250;

function transferApiUrls(env) {
  const configured = [
    env?.TRANSFER_API_URL || DEFAULT_TRANSFER_API_URL,
    env?.TRANSFER_API_FALLBACK_URL
  ];
  const urls = [];

  for (const value of configured) {
    if (!value) continue;
    try {
      const url = new URL(value);
      if (!urls.some((candidate) => candidate.origin === url.origin)) {
        urls.push(url);
      }
    } catch {
      // Ignore an invalid optional fallback; the default primary remains valid.
    }
  }

  return urls.length > 0 ? urls : [new URL(DEFAULT_TRANSFER_API_URL)];
}

async function resolvedSpotifyInput(input, fetchImpl) {
  const candidate = spotifyInputCandidate(input);
  try {
    return {
      input: candidate,
      parsed: parseSpotifyInput(candidate)
    };
  } catch (originalError) {
    let url;
    try {
      url = new URL(candidate);
    } catch {
      throw originalError;
    }

    if (!isSpotifyRedirectHost(url.hostname)) throw originalError;

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

function retryableFetchError(error) {
  return error?.name === "TimeoutError" || error?.name === "AbortError" || error instanceof TypeError;
}

function retryableStatus(status) {
  return [408, 425, 429].includes(status) || (status >= 500 && status <= 599);
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchPlaylistFromTransferApi(baseUrl, input, fetchImpl, options = {}) {
  const url = new URL("/api/spotify/public-playlist-preview", baseUrl);
  const timeoutMs = options.timeoutMs ?? PRIMARY_PREVIEW_TIMEOUT_MS;
  const attempts = options.attempts ?? 1;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-PlaylistTransfer-Proxy": "cloudflare-native-ingestion"
        },
        body: JSON.stringify({ input }),
        signal: AbortSignal.timeout(timeoutMs)
      });
      const text = await response.text();

      if (!response.ok) {
        let detail = text.slice(0, 240);
        try {
          detail = JSON.parse(text)?.message || detail;
        } catch {
          // Preserve the short response excerpt when the upstream response is not JSON.
        }

        const upstreamError = new Error(
          `Spotify ingestion service returned HTTP ${response.status}: ${detail}`
        );
        upstreamError.retryable = retryableStatus(response.status);
        if (attempt < attempts && retryableStatus(response.status)) {
          lastError = upstreamError;
          await wait(UPSTREAM_RETRY_DELAY_MS);
          continue;
        }
        throw upstreamError;
      }

      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error("The Spotify ingestion service returned invalid JSON.");
      }

      return normalizedPlaylist(payload);
    } catch (error) {
      lastError = error;
      if (attempt < attempts && retryableFetchError(error)) {
        await wait(UPSTREAM_RETRY_DELAY_MS);
        continue;
      }
      throw error;
    }
  }

  throw lastError ?? new Error("The Spotify ingestion service did not respond.");
}

async function fetchPlaylistThroughTransferApi(env, input, fetchImpl) {
  const urls = transferApiUrls(env);
  let lastError;

  for (let index = 0; index < urls.length; index += 1) {
    try {
      const isFallback = index > 0;
      return await fetchPlaylistFromTransferApi(urls[index], input, fetchImpl, {
        timeoutMs: isFallback ? FALLBACK_PREVIEW_TIMEOUT_MS : PRIMARY_PREVIEW_TIMEOUT_MS,
        attempts: !isFallback && urls.length === 1 ? 2 : 1
      });
    } catch (error) {
      lastError = error;
      const hasFallback = index < urls.length - 1;
      if (!hasFallback || (!error?.retryable && !retryableFetchError(error))) {
        throw error;
      }
    }
  }

  throw lastError ?? new Error("The Spotify ingestion service did not respond.");
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
