#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IPXE_DIR="${ROOT_DIR}/pxe/ipxe"

mkdir -p "${IPXE_DIR}"

BASE_URL="${IPXE_BASE_URL:-https://boot.ipxe.org}"

fetch() {
  local name="$1"
  local url="${BASE_URL}/${name}"
  local dest="${IPXE_DIR}/${name}"
  echo "Downloading ${url} -> ${dest}"
  curl -fSL "${url}" -o "${dest}"
}

fetch "undionly.kpxe"
fetch "ipxe.efi"

echo "iPXE binaries downloaded to ${IPXE_DIR}"
