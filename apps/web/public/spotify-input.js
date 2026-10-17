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
      // Keep looking for a supported Spotify URL in the shared text.
    }
  }

  return null;
}

export class SpotifyInputError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SpotifyInputError";
    this.code = code;
  }
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

export function normalizeSpotifyInput(input) {
  const candidate = spotifyInputCandidate(input);
  if (!candidate) {
    throw new SpotifyInputError("empty_input", "Paste a Spotify playlist or song link.");
  }

  if (SPOTIFY_ID_PATTERN.test(candidate)) {
    return { value: candidate, kind: "playlist" };
  }

  const uriMatch = candidate.match(/^spotify:(playlist|track):([A-Za-z0-9]{22})$/i);
  if (uriMatch) {
    return {
      value: `spotify:${uriMatch[1].toLowerCase()}:${uriMatch[2]}`,
      kind: uriMatch[1].toLowerCase()
    };
  }

  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw new SpotifyInputError(
      "unsupported_spotify_input",
      "Paste a Spotify playlist or song link. The full text from Spotify Share works too."
    );
  }

  const hostname = url.hostname.toLowerCase();
  if (SPOTIFY_REDIRECT_HOSTS.has(hostname)) {
    return { value: url.toString(), kind: "redirect" };
  }

  if (hostname !== "open.spotify.com") {
    throw new SpotifyInputError(
      "unsupported_spotify_input",
      "This is not a Spotify playlist or song link."
    );
  }

  const parts = url.pathname.split("/").filter(Boolean);
  const kindIndex = parts.findIndex((part) => part === "playlist" || part === "track");
  const kind = kindIndex >= 0 ? parts[kindIndex].toLowerCase() : null;
  const id = kindIndex >= 0 ? parts[kindIndex + 1] : null;

  if (!kind || !id || !SPOTIFY_ID_PATTERN.test(id)) {
    throw new SpotifyInputError(
      "unsupported_spotify_input",
      "We could not find a Spotify playlist or song in that link."
    );
  }

  return {
    value: `https://open.spotify.com/${kind}/${id}`,
    kind
  };
}
