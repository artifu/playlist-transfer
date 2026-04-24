import Fastify from "fastify";
import { loadSpotifyConfig } from "../config.js";
import { HttpError } from "../lib/http.js";
import { parseSpotifyPlaylistInput } from "../lib/spotify-url.js";
import { SpotifyClient } from "../providers/spotify.js";
import { renderPreviewPage } from "./preview-page.js";

type PlaylistPreviewBody = {
  input?: string;
  playlistUrl?: string;
  playlistId?: string;
};

function createSpotifyClient(): SpotifyClient {
  const config = loadSpotifyConfig();
  return new SpotifyClient(
    config.spotifyClientId,
    config.spotifyClientSecret,
    config.spotifyRefreshToken
  );
}

function spotifyErrorMessage(error: unknown): string {
  if (!(error instanceof HttpError)) {
    return error instanceof Error ? error.message : String(error);
  }

  if (error.status === 403) {
    return "Spotify refused access to this playlist's tracks. The connected account likely needs to own the playlist or be a collaborator.";
  }

  if (error.status === 404) {
    return "Spotify could not find this playlist through the Web API. Generated playlists such as Daily Mix may not be available as normal playlist resources.";
  }

  if (error.status === 401) {
    return "Spotify authentication failed. Re-run npm run spotify:auth to refresh the local token.";
  }

  return error.message;
}

export function buildApp() {
  const app = Fastify({ logger: false });

  app.get("/health", async () => ({
    ok: true
  }));

  app.get("/", async (_request, reply) => {
    reply.type("text/html; charset=utf-8");
    return renderPreviewPage();
  });

  app.post("/api/spotify/playlist-preview", async (request, reply) => {
    const body = request.body as PlaylistPreviewBody;
    const input = body.input ?? body.playlistUrl ?? body.playlistId ?? "";

    try {
      const playlistId = parseSpotifyPlaylistInput(input);
      const spotify = createSpotifyClient();
      const playlist = await spotify.getPlaylist(playlistId);

      return {
        playlist: {
          id: playlist.id,
          name: playlist.name,
          description: playlist.description,
          totalItems: playlist.totalItems
        },
        tracks: playlist.tracks
      };
    } catch (error) {
      const statusCode = error instanceof HttpError ? error.status : 400;
      reply.code(statusCode >= 500 ? 502 : statusCode);
      return {
        error: true,
        message: spotifyErrorMessage(error)
      };
    }
  });

  return app;
}
