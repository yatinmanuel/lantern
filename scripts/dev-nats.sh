#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONF_FILE="${ROOT_DIR}/nats-server.dev.conf"
DATA_DIR="${ROOT_DIR}/.nats/jetstream"
BIN_DIR="${ROOT_DIR}/.nats/bin"
LOCAL_BIN="${BIN_DIR}/nats-server"

mkdir -p "${DATA_DIR}" "${BIN_DIR}"

if command -v nats-server >/dev/null 2>&1; then
  exec nats-server -c "${CONF_FILE}"
fi

if [[ -x "${LOCAL_BIN}" ]]; then
  exec "${LOCAL_BIN}" -c "${CONF_FILE}"
fi

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "${ARCH}" in
  x86_64) ARCH="amd64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *) echo "Unsupported architecture: ${ARCH}" >&2; exit 1 ;;
esac

case "${OS}" in
  linux) OS="linux" ;;
  darwin) OS="darwin" ;;
  *) echo "Unsupported OS: ${OS}" >&2; exit 1 ;;
esac

echo "nats-server not found; downloading latest release for ${OS}/${ARCH}..."

TAG="$(curl -fsSL https://api.github.com/repos/nats-io/nats-server/releases/latest | \
  python3 - <<'PY'
import json, sys
data = json.load(sys.stdin)
print(data.get("tag_name", ""))
PY
)"

if [[ -z "${TAG}" ]]; then
  echo "Failed to determine latest NATS server version." >&2
  exit 1
fi

ARCHIVE="nats-server-${TAG}-${OS}-${ARCH}.zip"
URL="https://github.com/nats-io/nats-server/releases/download/${TAG}/${ARCHIVE}"
TMP_ZIP="${BIN_DIR}/${ARCHIVE}"

curl -fSL "${URL}" -o "${TMP_ZIP}"

python3 - <<PY
import zipfile
zipfile.ZipFile("${TMP_ZIP}").extractall("${BIN_DIR}")
PY

rm -f "${TMP_ZIP}"

if [[ ! -x "${LOCAL_BIN}" ]]; then
  echo "nats-server binary not found after download." >&2
  exit 1
fi

exec "${LOCAL_BIN}" -c "${CONF_FILE}"
