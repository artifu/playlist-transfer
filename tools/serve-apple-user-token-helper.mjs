import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv();

const host = "127.0.0.1";
const port = Number(process.env.APPLE_MUSIC_HELPER_PORT ?? 8788);
const htmlPath = resolve("tools/apple-music-user-token.html");

function envValue(name) {
  return process.env[name]?.trim() ?? "";
}

const server = createServer(async (request, response) => {
  try {
    if (request.url === "/developer-token") {
      response.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      });
      response.end(JSON.stringify({ developerToken: envValue("APPLE_MUSIC_DEVELOPER_TOKEN") }));
      return;
    }

    const html = await readFile(htmlPath, "utf8");
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    });
    response.end(html);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(message);
  }
});

server.listen(port, host, () => {
  console.log(`Apple Music user token helper: http://${host}:${port}`);
});
