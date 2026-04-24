import { buildApp } from "../server/app.js";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 8790);

const app = buildApp();

try {
  await app.listen({ host, port });
  console.log(`PlaylistTransfer local preview: http://${host}:${port}`);
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
