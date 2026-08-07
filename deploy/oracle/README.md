# Oracle deployment

The Oracle VM runs only the stateless/public-ingestion-compatible transfer API. Cloudflare remains the public entrypoint and D1 remains the production store.

## Bootstrap

Copy `deploy/oracle/bootstrap.sh` to a fresh Ubuntu 22.04 x86_64 VM and run it as the `ubuntu` user. The script installs a checksum-verified Node 22 distribution, checks out `main`, builds the project, and installs the API as a restricted systemd service bound to `127.0.0.1:8791`.

The public endpoint is `https://oracle-api.playlistxfer.com`, provided by Cloudflare Tunnel `playlistxfer-api` (`4fa42f1a-2bee-4c0d-b989-2ea9d875afe4`). The published application route maps that hostname to `http://localhost:8791`. Do not expose port 8791 directly.

Cloudflare Pages uses this endpoint as `TRANSFER_API_URL` and keeps Render as `TRANSFER_API_FALLBACK_URL`. The fallback is attempted only after retryable network, timeout, rate-limit, or server errors.

## Update

Run the bootstrap script again. It fetches `main`, rebuilds the project, and restarts the systemd service.

## Health check

```sh
curl --fail http://127.0.0.1:8791/health
curl --fail https://oracle-api.playlistxfer.com/health
```
