import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const host = process.env.WEB_HOST ?? "127.0.0.1";
const port = Number(process.env.WEB_PORT ?? process.env.PORT ?? "8792");
const transferApiUrl = new URL(process.env.TRANSFER_API_URL ?? "http://127.0.0.1:8791");
const publicDir = fileURLToPath(new URL("./public/", import.meta.url));

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".xml", "application/xml; charset=utf-8"]
]);

const permanentRedirects = new Map([
  ["/after-spotify-to-apple-music-transfer", "/guides#after-transfer"],
  ["/after-spotify-to-apple-music-transfer.html", "/guides#after-transfer"],
  ["/faq", "/guides#faq"],
  ["/faq.html", "/guides#faq"],
  ["/how-it-works", "/guides#how-it-works"],
  ["/how-it-works.html", "/guides#how-it-works"],
  ["/public-vs-private-spotify-playlists", "/guides#before-you-start"],
  ["/public-vs-private-spotify-playlists.html", "/guides#before-you-start"],
  ["/spotify-playlist-not-loading", "/guides#troubleshooting"],
  ["/spotify-playlist-not-loading.html", "/guides#troubleshooting"],
  ["/spotify-to-apple-music", "/guides#start"],
  ["/spotify-to-apple-music.html", "/guides#start"],
  ["/spotify-to-apple-music-missing-songs", "/guides#missing-songs"],
  ["/spotify-to-apple-music-missing-songs.html", "/guides#missing-songs"]
]);

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function sendNotFoundPage(response) {
  response.writeHead(404, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex"
  });
  createReadStream(join(publicDir, "404.html")).pipe(response);
}

function safeGoogleAnalyticsId(value) {
  const id = String(value || "").trim();
  return /^G-[A-Z0-9]+$/.test(id) ? id : "";
}

function sendConfigScript(response) {
  response.writeHead(200, {
    "Content-Type": "text/javascript; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(`window.PLAYLIST_XFER_CONFIG = ${JSON.stringify({
    gaMeasurementId: safeGoogleAnalyticsId(process.env.GA_MEASUREMENT_ID)
  })};\n`);
}

function safePublicPath(pathname) {
  const cleanPathname = pathname.endsWith("/") && pathname !== "/" ? pathname.slice(0, -1) : pathname;
  const routedPathname = new Map([
    ["/", "/index.html"],
    ["/about", "/about.html"],
    ["/contact", "/contact.html"],
    ["/guides", "/guides.html"],
    ["/how-playlist-matching-works", "/how-playlist-matching-works.html"],
    ["/playlist-transfer-test-results", "/playlist-transfer-test-results.html"],
    ["/privacy", "/privacy.html"],
    ["/spotify-to-apple-music-match-report-example", "/spotify-to-apple-music-match-report-example.html"],
    ["/transferring-large-spotify-playlists", "/transferring-large-spotify-playlists.html"],
    ["/terms", "/terms.html"]
  ]).get(cleanPathname) ?? cleanPathname;
  const requestedPath = decodeURIComponent(routedPathname);
  const normalizedPath = normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  return join(publicDir, normalizedPath);
}

async function serveStatic(request, response) {
  const url = new URL(request.url ?? "/", `http://${host}:${port}`);
  const filePath = safePublicPath(url.pathname);

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      sendNotFoundPage(response);
      return;
    }

    response.writeHead(200, {
      "Content-Type": mimeTypes.get(extname(filePath)) ?? "application/octet-stream",
      "Cache-Control": "no-store"
    });
    createReadStream(filePath).pipe(response);
  } catch {
    sendNotFoundPage(response);
  }
}

async function readRequestBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

async function proxyApi(request, response) {
  const targetUrl = new URL(request.url ?? "/", transferApiUrl);
  const headers = new Headers(request.headers);
  headers.delete("connection");
  headers.delete("content-length");
  headers.delete("host");

  try {
    const method = request.method ?? "GET";
    const body = method === "GET" || method === "HEAD" ? undefined : await readRequestBody(request);
    const proxied = await fetch(targetUrl, {
      method,
      headers,
      body
    });
    const proxiedBody = Buffer.from(await proxied.arrayBuffer());
    const responseHeaders = Object.fromEntries(proxied.headers);
    delete responseHeaders["content-encoding"];
    delete responseHeaders["content-length"];

    response.writeHead(proxied.status, responseHeaders);
    response.end(proxiedBody);
  } catch (error) {
    sendJson(response, 502, {
      error: true,
      message: "Transfer API did not respond. Check TRANSFER_API_URL, then refresh this page.",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${host}:${port}`);

  const redirectPath = url.pathname.endsWith("/") && url.pathname !== "/"
    ? url.pathname.slice(0, -1)
    : url.pathname;
  const redirectLocation = permanentRedirects.get(redirectPath);
  if (redirectLocation) {
    response.writeHead(301, {
      Location: redirectLocation,
      "Cache-Control": "public, max-age=300"
    });
    response.end();
    return;
  }

  if (url.pathname === "/health") {
    sendJson(response, 200, {
      ok: true,
      transferApiUrl: transferApiUrl.toString()
    });
    return;
  }

  if (url.pathname === "/config.js") {
    sendConfigScript(response);
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    await proxyApi(request, response);
    return;
  }

  await serveStatic(request, response);
});

server.listen(port, host, () => {
  console.log(`PlaylistTransfer web app: http://${host}:${port}`);
  console.log(`Proxying API requests to: ${transferApiUrl}`);
});
