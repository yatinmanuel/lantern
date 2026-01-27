#!/bin/sh
set -eu

: "${DHCP_INTERFACE:=eth0}"
: "${DHCP_MODE:=proxy}" # proxy or server
: "${DHCP_RANGE:=192.168.1.100,192.168.1.200,12h}"
: "${DHCP_PROXY_SUBNET:=192.168.1.0}"
: "${DHCP_PROXY_NETMASK:=255.255.255.0}"
: "${PXE_SERVER_IP:=192.168.1.10}"
: "${PXE_SERVER_PORT:=3000}"
: "${TFTP_ROOT:=/var/www/html}"
: "${DNSMASQ_CONFIG_PATH:=/var/www/html/dnsmasq.conf}"
: "${IPXE_BASE_URL:=https://boot.ipxe.org}"
: "${WIMBOOT_URL:=${IPXE_BASE_URL}/wimboot}"
: "${DNSMASQ_PORT:=0}"
: "${DNSMASQ_LOG_DHCP:=1}"
: "${DNSMASQ_LOG_QUERIES:=1}"

IPXE_MENU_URL="http://${PXE_SERVER_IP}:${PXE_SERVER_PORT}/ipxe/menu.ipxe"

mkdir -p "${TFTP_ROOT}/ipxe"

download_ipxe() {
  local name="$1"
  local dest="${TFTP_ROOT}/ipxe/${name}"
  if [ -s "${dest}" ]; then
    return 0
  fi
  local url="${IPXE_BASE_URL}/${name}"
  echo "Downloading ${url} -> ${dest}"
  curl -fSL "${url}" -o "${dest}"
}

download_ipxe "undionly.kpxe"
download_ipxe "ipxe.efi"

if [ ! -s "${TFTP_ROOT}/ipxe/wimboot" ]; then
  echo "Downloading ${WIMBOOT_URL} -> ${TFTP_ROOT}/ipxe/wimboot"
  curl -fSL "${WIMBOOT_URL}" -o "${TFTP_ROOT}/ipxe/wimboot"
fi

if [ -f "${DNSMASQ_CONFIG_PATH}" ]; then
  echo "Using dnsmasq config at ${DNSMASQ_CONFIG_PATH}"
  exec dnsmasq -k --conf-file="${DNSMASQ_CONFIG_PATH}"
fi

CONF_FILE="/etc/dnsmasq.d/pxe.conf"

{
  echo "interface=${DHCP_INTERFACE}"
  echo "bind-interfaces"
  echo ""
  if [ "${DHCP_MODE}" = "proxy" ]; then
    echo "dhcp-range=${DHCP_PROXY_SUBNET},proxy,${DHCP_PROXY_NETMASK}"
  else
    echo "dhcp-range=${DHCP_RANGE}"
    echo "dhcp-option=3,${PXE_SERVER_IP}"
    echo "dhcp-option=6,${PXE_SERVER_IP}"
  fi
  echo ""
  echo "enable-tftp"
  echo "tftp-root=${TFTP_ROOT}"
  echo ""
  echo "dhcp-match=set:efi64,option:client-arch,7"
  echo "dhcp-userclass=set:ipxe,iPXE"
  echo ""
  echo "dhcp-boot=tag:ipxe,${IPXE_MENU_URL}"
  echo "dhcp-boot=tag:!ipxe,tag:!efi64,undionly.kpxe,,${PXE_SERVER_IP}"
  echo "dhcp-boot=tag:!ipxe,tag:efi64,ipxe.efi,,${PXE_SERVER_IP}"
  echo ""
  if [ "${DNSMASQ_LOG_DHCP}" = "1" ]; then
    echo "log-dhcp"
  fi
  if [ "${DNSMASQ_LOG_QUERIES}" = "1" ]; then
    echo "log-queries"
  fi
  echo "port=${DNSMASQ_PORT}"
} > "${CONF_FILE}"

exec dnsmasq -k --conf-file="${CONF_FILE}"
