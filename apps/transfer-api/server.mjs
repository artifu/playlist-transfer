import { createServer } from "node:http";
import { startTransferCleanupLoop } from "./src/cleanup.mjs";
import { createTransferApiRouter } from "./src/routes.mjs";

const host = process.env.TRANSFER_API_HOST ?? "127.0.0.1";
const port = Number(process.env.TRANSFER_API_PORT ?? "8791");

startTransferCleanupLoop();

const server = createServer(createTransferApiRouter({ host, port }));

server.listen(port, host, () => {
  console.log(`PlaylistTransfer transfer API: http://${host}:${port}`);
});
