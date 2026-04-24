import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { config as loadEnv } from "dotenv";

loadEnv();

const host = "127.0.0.1";
const port = 8787;
const redirectUri = `http://${host}:${port}/callback`;
const scopes = ["playlist-read-private", "playlist-read-collaborative"];

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function updateEnv(name, value) {
  const path = ".env";
  const env = await readFile(path, "utf8");
  const line = `${name}=${value}`;
  const next = env.match(new RegExp(`^${name}=`, "m"))
    ? env.replace(new RegExp(`^${name}=.*$`, "m"), line)
    : `${env.trimEnd()}\n${line}\n`;

  await writeFile(path, next, "utf8");
}

async function exchangeCode({ clientId, clientSecret, code }) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri
  });

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Spotify token exchange failed with status ${response.status}: ${text}`);
  }

  return JSON.parse(text);
}

async function main() {
  const clientId = requireEnv("SPOTIFY_CLIENT_ID");
  const clientSecret = requireEnv("SPOTIFY_CLIENT_SECRET");

  const authorizeUrl = new URL("https://accounts.spotify.com/authorize");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("scope", scopes.join(" "));
  authorizeUrl.searchParams.set("show_dialog", "true");

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", redirectUri);
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      if (error) {
        response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        response.end(`Spotify authorization failed: ${error}`);
        return;
      }

      if (!code) {
        response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Waiting for Spotify authorization callback.");
        return;
      }

      const tokens = await exchangeCode({ clientId, clientSecret, code });
      if (!tokens.refresh_token) {
        throw new Error("Spotify did not return a refresh_token.");
      }

      await updateEnv("SPOTIFY_REFRESH_TOKEN", tokens.refresh_token);
      response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Spotify refresh token saved to .env. You can close this tab.");
      console.log("Spotify refresh token saved to .env.");
      server.close();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(message);
      console.error(message);
      server.close();
    }
  });

  server.listen(port, host, () => {
    console.log(`Open this URL to authorize Spotify:\n${authorizeUrl.toString()}`);
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
