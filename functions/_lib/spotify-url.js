const SPOTIFY_ID_PATTERN = /^[A-Za-z0-9]{22}$/;

export function parseSpotifyInput(input, options = {}) {
  const trimmed = String(input ?? "").trim();
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
