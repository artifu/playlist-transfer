import { fetchJson } from "../lib/http.js";
import type { SpotifyPlaylist, SpotifyTrack } from "../types.js";

type SpotifyTokenResponse = {
  access_token: string;
};

type SpotifyPlaylistPage = {
  items: Array<{
    item: {
      id: string | null;
      name: string;
      duration_ms?: number;
      external_ids?: {
        isrc?: string;
      };
      album?: {
        name?: string;
      };
      artists?: Array<{ name: string }>;
    } | null;
  }>;
  total: number;
  next: string | null;
};

type SpotifyPlaylistResponse = {
  id: string;
  name: string;
  description: string | null;
  items?: {
    total: number;
  };
};

export class SpotifyClient {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly refreshToken: string
  ) {}

  async getAccessToken(): Promise<string> {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: this.refreshToken
    });

    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });

    if (!response.ok) {
      throw new Error(`Spotify token refresh failed with status ${response.status}: ${await response.text()}`);
    }

    const data = (await response.json()) as SpotifyTokenResponse;
    return data.access_token;
  }

  async getPlaylist(playlistId: string): Promise<SpotifyPlaylist> {
    const accessToken = await this.getAccessToken();
    const metadata = await fetchJson<SpotifyPlaylistResponse>(
      `https://api.spotify.com/v1/playlists/${playlistId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    const tracks: SpotifyTrack[] = [];
    let nextUrl: string | null = `https://api.spotify.com/v1/playlists/${playlistId}/items?limit=100`;
    let totalItems = metadata.items?.total ?? 0;

    while (nextUrl) {
      const page: SpotifyPlaylistPage = await fetchJson<SpotifyPlaylistPage>(nextUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      totalItems = page.total;

      for (const entry of page.items) {
        const item = entry.item;
        if (!item?.name) {
          continue;
        }

        tracks.push({
          spotifyTrackId: item.id ?? null,
          isrc: item.external_ids?.isrc ?? null,
          name: item.name,
          artists:
            item.artists
              ?.map((artist: { name: string }) => artist.name)
              .filter((artistName): artistName is string => Boolean(artistName)) ?? [],
          album: item.album?.name ?? null,
          durationMs: item.duration_ms ?? null
        });
      }

      nextUrl = page.next;
    }

    return {
      id: metadata.id,
      name: metadata.name,
      description: metadata.description,
      totalItems,
      tracks
    };
  }
}
