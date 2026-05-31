const searchCache = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(input, init) {
  const response = await fetch(input, init);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${input}: ${text}`);
  }

  return text ? JSON.parse(text) : null;
}

function searchCacheKey(storefront, term, limit) {
  return `${storefront}:${limit}:${term.toLowerCase()}`;
}

export class AppleMusicClient {
  constructor(developerToken, userToken, storefront = "us") {
    this.developerToken = developerToken;
    this.userToken = userToken || null;
    this.storefront = storefront || "us";
  }

  get headers() {
    const headers = {
      Authorization: `Bearer ${this.developerToken}`,
      "Content-Type": "application/json"
    };

    if (this.userToken) {
      headers["Music-User-Token"] = this.userToken;
    }

    return headers;
  }

  async searchSongs(term, limit = 5) {
    const normalizedTerm = String(term ?? "").trim();
    if (!normalizedTerm) return [];

    const cacheKey = searchCacheKey(this.storefront, normalizedTerm, limit);
    const cached = searchCache.get(cacheKey);
    if (cached) return cached;

    const request = this.fetchSearchSongs(normalizedTerm, limit).catch((error) => {
      searchCache.delete(cacheKey);
      throw error;
    });

    searchCache.set(cacheKey, request);
    return request;
  }

  async fetchSearchSongs(term, limit) {
    const url = new URL(`https://api.music.apple.com/v1/catalog/${this.storefront}/search`);
    url.searchParams.set("term", term);
    url.searchParams.set("types", "songs");
    url.searchParams.set("limit", String(limit));

    let response = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        response = await fetchJson(url.toString(), {
          headers: this.headers
        });
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes("HTTP 429") || attempt === 2) throw error;
        await sleep(750 * (attempt + 1));
      }
    }

    return (
      response?.results?.songs?.data?.map((song) => ({
        id: song.id,
        name: song.attributes.name,
        artistName: song.attributes.artistName,
        albumName: song.attributes.albumName ?? null,
        durationMs: song.attributes.durationInMillis ?? null,
        isrc: song.attributes.isrc ?? null
      })) ?? []
    );
  }

  async createPlaylist(name, description) {
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

    const data = await response.json();
    const playlistId = data.data?.[0]?.id;
    if (!playlistId) throw new Error("Apple Music did not return a playlist id.");
    return playlistId;
  }

  async addTracksToPlaylist(playlistId, songIds) {
    if (songIds.length === 0) return;

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

export function createAppleMusicClient(env, options = {}) {
  const developerToken = env.APPLE_MUSIC_DEVELOPER_TOKEN?.trim();
  const userToken = String(options.userToken ?? env.APPLE_MUSIC_USER_TOKEN ?? "").trim();
  const storefront = String(options.storefront ?? env.APPLE_MUSIC_STOREFRONT ?? "us").trim();

  if (!developerToken) {
    throw new Error("Missing APPLE_MUSIC_DEVELOPER_TOKEN. Add it to Cloudflare Pages environment variables before matching.");
  }

  if (options.requireUserToken && !userToken) {
    throw new Error("Apple Music is not connected. Use Connect Apple Music, then try again.");
  }

  return new AppleMusicClient(developerToken, userToken || null, storefront || "us");
}

export function appleMusicSessionPayload(env, options = {}) {
  const developerToken = env.APPLE_MUSIC_DEVELOPER_TOKEN?.trim() || "";
  const hasRuntimeUserToken = Boolean(options.hasUserToken);
  const hasEnvUserToken = Boolean(env.APPLE_MUSIC_USER_TOKEN?.trim());

  return {
    hasDeveloperToken: Boolean(developerToken),
    hasUserToken: hasRuntimeUserToken || hasEnvUserToken,
    userTokenSource: hasRuntimeUserToken ? "runtime" : hasEnvUserToken ? "env" : "none",
    storefront: env.APPLE_MUSIC_STOREFRONT?.trim() || "us",
    developerToken
  };
}

