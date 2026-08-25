const SPOTIFY_ID_PATTERN = /^[A-Za-z0-9]{22}$/;
const SPOTIFY_URI_PATTERN = /spotify:(?:playlist|track):[A-Za-z0-9]{22}/i;
const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;
const SPOTIFY_REDIRECT_HOSTS = new Set(["spotify.link", "spotify.app.link"]);

function withoutTrailingSharePunctuation(value) {
  return value.replace(/[\])},.;!?]+$/g, "");
}

function spotifyUrlCandidate(value) {
  for (const match of value.matchAll(URL_PATTERN)) {
    const candidate = withoutTrailingSharePunctuation(match[0]);
    try {
      const url = new URL(candidate);
      const hostname = url.hostname.toLowerCase();
      if (hostname === "open.spotify.com" || SPOTIFY_REDIRECT_HOSTS.has(hostname)) {
        return candidate;
      }
    } catch {
      // Keep looking for another URL in the shared text.
    }
  }

  return null;
}

export function spotifyInputCandidate(input) {
  const trimmed = String(input ?? "")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .trim();

  if (!trimmed) return "";
  if (SPOTIFY_ID_PATTERN.test(trimmed)) return trimmed;

  const uri = trimmed.match(SPOTIFY_URI_PATTERN)?.[0];
  if (uri) return uri;

  return spotifyUrlCandidate(trimmed) ?? trimmed;
}

export function isSpotifyRedirectHost(hostname) {
  return SPOTIFY_REDIRECT_HOSTS.has(String(hostname ?? "").toLowerCase());
}

export function parseSpotifyInput(input, options = {}) {
  const trimmed = spotifyInputCandidate(input);
  const bareIdType = options.bareIdType ?? "playlist";

  if (!trimmed) {
    throw new Error("Paste a Spotify playlist or track URL.");
  }

  if (SPOTIFY_ID_PATTERN.test(trimmed)) {
    return { kind: bareIdType, id: trimmed };
  }

  const uriMatch = trimmed.match(/^spotify:(playlist|track):([A-Za-z0-9]{22})$/i);
  if (uriMatch) {
    return { kind: uriMatch[1].toLowerCase(), id: uriMatch[2] };
  }

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("That does not look like a valid Spotify playlist or track URL.");
  }

  const parts = url.pathname.split("/").filter(Boolean);
  const kindIndex = parts.findIndex((part) => part === "playlist" || part === "track");
  const kind = kindIndex >= 0 ? parts[kindIndex] : null;
  const id = kindIndex >= 0 ? parts[kindIndex + 1] : null;

  if (!kind || !id || !SPOTIFY_ID_PATTERN.test(id)) {
    throw new Error("Could not find a Spotify playlist or track ID in that URL.");
  }

  return { kind, id };
}

export function parseSpotifyPlaylistInput(input) {
  const parsed = parseSpotifyInput(input, { bareIdType: "playlist" });
  if (parsed.kind !== "playlist") throw new Error("That Spotify link is a track, not a playlist.");
  return parsed.id;
}

export function parseSpotifyTrackInput(input) {
  const parsed = parseSpotifyInput(input, { bareIdType: "track" });
  if (parsed.kind !== "track") throw new Error("That Spotify link is a playlist, not a track.");
  return parsed.id;
}
