import { config as loadEnv } from "dotenv";

loadEnv();

type AppConfig = {
  spotifyClientId: string;
  spotifyClientSecret: string;
  spotifyRefreshToken: string;
  appleMusicDeveloperToken: string;
  appleMusicUserToken: string;
  appleMusicStorefront: string;
  spotifyPlaylistId: string;
  outputDir: string;
};

type SpotifyConfig = {
  spotifyClientId: string;
  spotifyClientSecret: string;
  spotifyRefreshToken: string;
};

type AppleMusicConfig = {
  appleMusicDeveloperToken: string;
  appleMusicUserToken: string;
  appleMusicStorefront: string;
};

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadSpotifyConfig(): SpotifyConfig {
  return {
    spotifyClientId: requireEnv("SPOTIFY_CLIENT_ID"),
    spotifyClientSecret: requireEnv("SPOTIFY_CLIENT_SECRET"),
    spotifyRefreshToken: requireEnv("SPOTIFY_REFRESH_TOKEN")
  };
}

export function loadAppleMusicConfig(): AppleMusicConfig {
  return {
    appleMusicDeveloperToken: requireEnv("APPLE_MUSIC_DEVELOPER_TOKEN"),
    appleMusicUserToken: requireEnv("APPLE_MUSIC_USER_TOKEN"),
    appleMusicStorefront: process.env.APPLE_MUSIC_STOREFRONT?.trim() || "us"
  };
}

export function loadConfig(): AppConfig {
  return {
    spotifyClientId: requireEnv("SPOTIFY_CLIENT_ID"),
    spotifyClientSecret: requireEnv("SPOTIFY_CLIENT_SECRET"),
    spotifyRefreshToken: requireEnv("SPOTIFY_REFRESH_TOKEN"),
    appleMusicDeveloperToken: requireEnv("APPLE_MUSIC_DEVELOPER_TOKEN"),
    appleMusicUserToken: requireEnv("APPLE_MUSIC_USER_TOKEN"),
    appleMusicStorefront: process.env.APPLE_MUSIC_STOREFRONT?.trim() || "us",
    spotifyPlaylistId: requireEnv("SPOTIFY_PLAYLIST_ID"),
    outputDir: process.env.OUTPUT_DIR?.trim() || "artifacts"
  };
}
