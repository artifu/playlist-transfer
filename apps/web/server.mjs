import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const host = process.env.WEB_HOST ?? "127.0.0.1";
const port = Number(process.env.WEB_PORT ?? "8792");
const transferApiUrl = new URL(process.env.TRANSFER_API_URL ?? "http://127.0.0.1:8791");
const publicDir = fileURLToPath(new URL("./public/", import.meta.url));

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"]
]);

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function safePublicPath(pathname) {
  const requestedPath = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
  const normalizedPath = normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  return join(publicDir, normalizedPath);
}

async function serveStatic(request, response) {
  const url = new URL(request.url ?? "/", `http://${host}:${port}`);
  const filePath = safePublicPath(url.pathname);

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      sendJson(response, 404, { error: true, message: "Not found" });
      return;
    }

    response.writeHead(200, {
      "Content-Type": mimeTypes.get(extname(filePath)) ?? "application/octet-stream",
      "Cache-Control": "no-store"
    });
    createReadStream(filePath).pipe(response);
  } catch {
    sendJson(response, 404, { error: true, message: "Not found" });
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
      message: "Transfer API did not respond. Start it with npm run dev:transfer-api, then refresh this page.",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${host}:${port}`);

  if (url.pathname === "/health") {
    sendJson(response, 200, {
      ok: true,
      transferApiUrl: transferApiUrl.toString()
    });
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
