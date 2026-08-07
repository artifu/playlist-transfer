#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/playlistxfer"
APP_USER="playlistxfer"
REPOSITORY_URL="https://github.com/artifu/playlist-transfer.git"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

sudo apt-get update
sudo apt-get install -y ca-certificates curl git xz-utils

if ! command -v node >/dev/null 2>&1 || [[ "$(node --version)" != v22.* ]]; then
  work_dir="$(mktemp -d)"
  trap 'rm -rf "$work_dir"' EXIT
  cd "$work_dir"

  curl --fail --silent --show-error --location \
    --output SHASUMS256.txt \
    https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt

  node_archive="$(awk '$2 ~ /^node-v22\..*-linux-x64\.tar\.xz$/ { print $2; exit }' SHASUMS256.txt)"
  test -n "$node_archive"

  curl --fail --silent --show-error --location \
    --output "$node_archive" \
    "https://nodejs.org/dist/latest-v22.x/$node_archive"
  grep "  $node_archive$" SHASUMS256.txt | sha256sum --check --status
  sudo tar --extract --xz --file "$node_archive" --directory /usr/local --strip-components=1
fi

if ! id "$APP_USER" >/dev/null 2>&1; then
  sudo useradd --system --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
fi

if [[ -d "$APP_DIR/.git" ]]; then
  sudo -u "$APP_USER" git -C "$APP_DIR" fetch --depth=1 origin main
  sudo -u "$APP_USER" git -C "$APP_DIR" checkout --force FETCH_HEAD
else
  sudo git clone --depth=1 --branch main "$REPOSITORY_URL" "$APP_DIR"
fi

sudo chown -R "$APP_USER:$APP_USER" "$APP_DIR"
sudo -u "$APP_USER" npm --prefix "$APP_DIR" ci
sudo -u "$APP_USER" npm --prefix "$APP_DIR" run build
sudo install -d --owner="$APP_USER" --group="$APP_USER" "$APP_DIR/data"

sudo install -m 0644 "$SCRIPT_DIR/playlistxfer-api.service" \
  /etc/systemd/system/playlistxfer-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now playlistxfer-api.service

node --version
sudo systemctl --no-pager --full status playlistxfer-api.service
