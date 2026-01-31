#!/bin/bash
set -e

# Export root (client mounts e.g. 192.168.1.10:/var/www/html/iso/ubuntu-...)
EXPORT_ROOT="${EXPORT_ROOT:-/var/www/html}"

# Read subnet from file on PXE volume if it exists, else use env or default
SUBNET_FILE="/var/www/html/.nfs-export-subnet"
if [ -f "$SUBNET_FILE" ]; then
  EXPORT_SUBNET=$(cat "$SUBNET_FILE" | tr -d '[:space:]')
fi
EXPORT_SUBNET="${EXPORT_SUBNET:-${NFS_EXPORT_SUBNET:-*}}"

echo "NFS Server starting..."
echo "  Export root: $EXPORT_ROOT"
echo "  Allowed clients: $EXPORT_SUBNET"

mkdir -p "$EXPORT_ROOT"

# Generate /etc/exports
cat > /etc/exports <<EOF
${EXPORT_ROOT} ${EXPORT_SUBNET}(ro,fsid=0,no_subtree_check,no_root_squash,insecure)
EOF

echo "Generated /etc/exports:"
cat /etc/exports

# Call the original entrypoint from erichough/nfs-server
exec /nfsd.sh
