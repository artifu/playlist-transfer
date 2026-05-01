import { fetchJson } from "../lib/http.js";
import type { AppleSongCandidate } from "../types.js";

type AppleSearchResponse = {
  results?: {
    songs?: {
      data: Array<{
        id: string;
        attributes: {
          name: string;
          artistName: string;
          albumName?: string;
          durationInMillis?: number;
          isrc?: string;
        };
      }>;
    };
  };
};

type ApplePlaylistCreateResponse = {
  data: Array<{
    id: string;
  }>;
};

const searchCache = new Map<string, Promise<AppleSongCandidate[]>>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function searchCacheKey(storefront: string, term: string, limit: number): string {
  return `${storefront}:${limit}:${term.toLowerCase()}`;
}

export class AppleMusicClient {
  constructor(
    private readonly developerToken: string,
    private readonly userToken: string,
    private readonly storefront: string
  ) {}

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.developerToken}`,
      "Music-User-Token": this.userToken,
      "Content-Type": "application/json"
    };
  }

  async searchSongs(term: string, limit = 5): Promise<AppleSongCandidate[]> {
    const normalizedTerm = term.trim();
    if (!normalizedTerm) {
      return [];
    }

    const cacheKey = searchCacheKey(this.storefront, normalizedTerm, limit);
    const cached = searchCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const request = this.fetchSearchSongs(normalizedTerm, limit).catch((error: unknown) => {
      searchCache.delete(cacheKey);
      throw error;
    });

    searchCache.set(cacheKey, request);
    return request;
  }

  private async fetchSearchSongs(term: string, limit: number): Promise<AppleSongCandidate[]> {
    const url = new URL(`https://api.music.apple.com/v1/catalog/${this.storefront}/search`);
    url.searchParams.set("term", term);
    url.searchParams.set("types", "songs");
    url.searchParams.set("limit", String(limit));

    let response: AppleSearchResponse | null = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        response = await fetchJson<AppleSearchResponse>(url.toString(), {
          headers: this.headers
        });
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes("HTTP 429") || attempt === 2) {
          throw error;
        }

        await sleep(750 * (attempt + 1));
      }
    }

    return (
      response?.results?.songs?.data.map((song) => ({
        id: song.id,
        name: song.attributes.name,
        artistName: song.attributes.artistName,
        albumName: song.attributes.albumName ?? null,
        durationMs: song.attributes.durationInMillis ?? null,
        isrc: song.attributes.isrc ?? null
      })) ?? []
    );
  }

  async createPlaylist(name: string, description: string): Promise<string> {
    const response = await fetch("https://api.music.apple.com/v1/me/library/playlists", {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        attributes: {
          name,
          description
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Apple Music playlist creation failed with status ${response.status}: ${await response.text()}`);
    }

    const data = (await response.json()) as ApplePlaylistCreateResponse;
    const playlistId = data.data[0]?.id;

    if (!playlistId) {
      throw new Error("Apple Music did not return a playlist id.");
    }

    return playlistId;
  }

  async addTracksToPlaylist(playlistId: string, songIds: string[]): Promise<void> {
    if (songIds.length === 0) {
      return;
    }

    const response = await fetch(`https://api.music.apple.com/v1/me/library/playlists/${playlistId}/tracks`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        data: songIds.map((id) => ({
          id,
          type: "songs"
        }))
      })
    });

    if (!response.ok) {
      throw new Error(`Apple Music add tracks failed with status ${response.status}: ${await response.text()}`);
    }
  }
}
