const searchCache = new Map();
const ISRC_BATCH_LIMIT = 25;
const ISRC_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

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

function isTransientAppleError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /\bHTTP (429|500|502|503|504)\b/.test(message);
}

function searchCacheKey(storefront, term, limit) {
  return `${storefront}:${limit}:${term.toLowerCase()}`;
}

function artworkUrl(artwork, size = 300) {
  return artwork?.url
    ?.replace("{w}", String(size))
    .replace("{h}", String(size)) ?? null;
}

function songCandidate(song) {
  return {
    id: song.id,
    name: song.attributes.name,
    artistName: song.attributes.artistName,
    albumName: song.attributes.albumName ?? null,
    durationMs: song.attributes.durationInMillis ?? null,
    isrc: song.attributes.isrc ?? null,
    url: song.attributes.url ?? null,
    artworkUrl: artworkUrl(song.attributes.artwork)
  };
}

function normalizedISRC(value) {
  return String(value ?? "").trim().toUpperCase();
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

export class AppleMusicClient {
  constructor(developerToken, userToken, storefront = "us", db = null) {
    this.developerToken = developerToken;
    this.userToken = userToken || null;
    this.storefront = storefront || "us";
    this.db = db;
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
    let lastTransientError = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        response = await fetchJson(url.toString(), {
          headers: this.headers
        });
        break;
      } catch (error) {
        if (!isTransientAppleError(error)) throw error;
        lastTransientError = error;
        if (attempt === 2) break;
        await sleep(750 * (attempt + 1));
      }
    }

    if (!response && lastTransientError) {
      console.warn("apple_music_search_transient_failure", {
        term,
        message: lastTransientError instanceof Error ? lastTransientError.message : String(lastTransientError)
      });
      return [];
    }

    return (
      response?.results?.songs?.data?.map(songCandidate) ?? []
    );
  }

  async songsByISRCs(values) {
    const isrcs = [...new Set(values.map(normalizedISRC).filter(Boolean))];
    const candidates = [];

    for (const isrcChunk of chunks(isrcs, ISRC_BATCH_LIMIT)) {
      const cached = await this.readISRCEntries(isrcChunk);
      const missing = isrcChunk.filter((isrc) => !cached.has(isrc));

      for (const value of cached.values()) candidates.push(...value);

      if (missing.length > 0) {
        const fetched = await this.fetchSongsByISRCChunk(missing);
        const byISRC = new Map(missing.map((isrc) => [isrc, []]));

        for (const candidate of fetched) {
          const isrc = normalizedISRC(candidate.isrc);
          if (byISRC.has(isrc)) byISRC.get(isrc).push(candidate);
        }

        await this.writeISRCEntries(byISRC);
        for (const value of byISRC.values()) candidates.push(...value);
      }
    }

    return candidates;
  }

  async fetchSongsByISRCChunk(isrcs) {
    const url = new URL(`https://api.music.apple.com/v1/catalog/${this.storefront}/songs`);
    url.searchParams.set("filter[isrc]", isrcs.join(","));

    let response = null;
    let lastTransientError = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        response = await fetchJson(url.toString(), { headers: this.headers });
        break;
      } catch (error) {
        if (!isTransientAppleError(error)) throw error;
        lastTransientError = error;
        if (attempt === 2) break;
        await sleep(750 * (attempt + 1));
      }
    }

    if (!response && lastTransientError) {
      console.warn("apple_music_isrc_transient_failure", {
        count: isrcs.length,
        message: lastTransientError instanceof Error ? lastTransientError.message : String(lastTransientError)
      });
      return [];
    }

    return response?.data?.map(songCandidate) ?? [];
  }

  async readISRCEntries(isrcs) {
    const result = new Map();
    if (!this.db || isrcs.length === 0) return result;

    try {
      const keys = isrcs.map((isrc) => `${this.storefront}:${isrc}`);
      const placeholders = keys.map(() => "?").join(",");
      const rows = await this.db
        .prepare(
          `select cache_key, isrc, candidates_json
           from apple_isrc_cache
           where cache_key in (${placeholders}) and expires_at > ?`
        )
        .bind(...keys, new Date().toISOString())
        .all();

      for (const row of rows.results ?? []) {
        result.set(normalizedISRC(row.isrc), JSON.parse(row.candidates_json));
      }
    } catch (error) {
      console.warn("apple_music_isrc_cache_read_failed", {
        message: error instanceof Error ? error.message : String(error)
      });
    }

    return result;
  }

  async writeISRCEntries(entries) {
    if (!this.db || entries.size === 0) return;

    try {
      const createdAt = new Date().toISOString();
      const expiresAt = new Date(Date.now() + ISRC_CACHE_TTL_MS).toISOString();
      const statements = [...entries.entries()].map(([isrc, candidates]) =>
        this.db
          .prepare(
            `insert into apple_isrc_cache (
              cache_key, storefront, isrc, candidates_json, created_at, expires_at
            ) values (?, ?, ?, ?, ?, ?)
            on conflict(cache_key) do update set
              candidates_json = excluded.candidates_json,
              created_at = excluded.created_at,
              expires_at = excluded.expires_at`
          )
          .bind(
            `${this.storefront}:${isrc}`,
            this.storefront,
            isrc,
            JSON.stringify(candidates),
            createdAt,
            expiresAt
          )
      );
      await this.db.batch(statements);
    } catch (error) {
      console.warn("apple_music_isrc_cache_write_failed", {
        message: error instanceof Error ? error.message : String(error)
      });
    }
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

  return new AppleMusicClient(
    developerToken,
    userToken || null,
    storefront || "us",
    env.PLAYLIST_TRANSFER_DB ?? null
  );
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
