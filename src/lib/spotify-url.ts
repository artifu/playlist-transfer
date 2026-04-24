const SPOTIFY_PLAYLIST_ID_PATTERN = /^[A-Za-z0-9]{22}$/;

export function parseSpotifyPlaylistInput(input: string): string {
  const trimmed = input.trim();

  if (!trimmed) {
    throw new Error("Paste a Spotify playlist URL or playlist ID.");
  }

  if (SPOTIFY_PLAYLIST_ID_PATTERN.test(trimmed)) {
    return trimmed;
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("That does not look like a valid Spotify playlist URL or playlist ID.");
  }

  const parts = url.pathname.split("/").filter(Boolean);
  const playlistIndex = parts.indexOf("playlist");
  const playlistId = playlistIndex >= 0 ? parts[playlistIndex + 1] : null;

  if (!playlistId || !SPOTIFY_PLAYLIST_ID_PATTERN.test(playlistId)) {
    throw new Error("Could not find a Spotify playlist ID in that URL.");
  }

  return playlistId;
}
