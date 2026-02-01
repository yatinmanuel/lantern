# Lantern

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2Fyatinmanuel%2Flantern.svg?type=shield&issueType=license)](https://app.fossa.com/projects/git%2Bgithub.com%2Fyatinmanuel%2Flantern?ref=badge_shield&issueType=license)
[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2Fyatinmanuel%2Flantern.svg?type=shield&issueType=security)](https://app.fossa.com/projects/git%2Bgithub.com%2Fyatinmanuel%2Flantern?ref=badge_shield&issueType=security)

Lantern is a PXE server for bare-metal machines. Machines netboot into Alpine,
an agent reports their hardware back, and from the web UI you can install an OS
on them, reboot them, kexec, etc.

OS installs use a bootstrap/chroot approach rather than each distro's own
installer, so the same flow works for Debian, Ubuntu, Arch, Fedora/RHEL-likes
and Alpine.

## How it fits together

- `src/` - backend (Node/TypeScript, Express). API, iPXE menus, job queue.
- `src/jobs/worker.ts` - job worker. ISO imports, installs and other client
  actions run here as background jobs.
- `agents/` - Go agent that runs on the netbooted machines and talks to the
  backend over NATS.
- `web/` - Next.js dashboard.
- `dnsmasq/` - DHCP (proxy or full) and TFTP for the iPXE binaries.
- `nfs/` - NFS server. Ubuntu's casper needs it to boot the live image.
- Postgres for state, NATS for messaging between backend, worker and agents.

## Running with Docker

Create a `.env` in the repo root. The ones you'll almost always need to set:

```
PXE_SERVER_IP=192.168.1.10
PXE_SERVER_URL=http://192.168.1.10:3000
DHCP_INTERFACE=eth0
```

Then:

```bash
docker compose up -d --build
```

The dnsmasq container downloads the iPXE binaries on first start. It runs with
host networking, so stop any dnsmasq already running on the host first.

By default dnsmasq runs in proxy DHCP mode, which leaves your existing DHCP
server (usually the router) handing out addresses. If you want Lantern to be
the DHCP server, set `DHCP_MODE` and `DHCP_RANGE`, and make sure nothing else
on the network is serving DHCP.

`./pxe` on the host is the TFTP/HTTP root (mounted at `/var/www/html` in the
containers). ISOs and cached OS files end up in there.

`docker-compose.override.yml` turns on verbose dnsmasq logging. Compose picks it
up automatically; to run without it:

```bash
docker compose -f docker-compose.yml up -d --build
```

### Dev setup

```bash
docker compose -f docker-compose.dev.yml up -d
```

Runs the backend with `tsx watch` and the web UI with `next dev`, both
reloading on changes. Containers are named `lantern-*-dev`.

Without Docker you need Node 18+, a Postgres instance and `nats-server` on the
PATH:

```bash
npm install     # also installs web/
npm run dev     # nats, backend, worker and web together
```

## Configuration

Set in `.env` / the environment:

| Variable | What it's for |
| --- | --- |
| `PXE_SERVER_IP` | IP the netbooting machines use to reach Lantern |
| `PXE_SERVER_URL` | Base URL for HTTP boot files and the API |
| `DHCP_INTERFACE` | Interface dnsmasq listens on |
| `DHCP_MODE` | `proxy` (default) or `server` |
| `DHCP_RANGE` | Address range when not in proxy mode |
| `DATABASE_URL` | Postgres connection string |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | Used by the Postgres container |
| `OS_FILES_DIR` | Where downloaded OS files are cached |
| `NATS_URL` | NATS server, use `tls://` for TLS |
| `NATS_TLS_CA`, `NATS_TLS_CERT`, `NATS_TLS_KEY` | CA and client cert/key for NATS TLS / mTLS |
| `NATS_TLS_HANDSHAKE_FIRST` | `true` if the NATS server expects TLS first |

See `nats-server.conf.example` for a NATS config with TLS.

Most PXE settings are stored in the database once Lantern is running and can be
changed in the dashboard under **Settings -> PXE Config**. The env vars just
seed the initial values.

ISOs are managed under **Images**: upload one, or copy it into `pxe/iso/` and
scan the directory. Lantern extracts it and adds an iPXE menu entry.

## Installs

The installer runs over SSH on the machine while it's booted into Alpine:

1. Partition and format the target disk
2. Pull down a base root filesystem for the distro
3. Chroot into it
4. Install a kernel and bootloader
5. Final config so the machine boots from disk

OS files are fetched from Lantern's cache (`/var/www/html/os-files/`) first and
only from the internet if they aren't cached.

## Migrating from SQLite

Older versions used SQLite. To move an existing database into Postgres:

```bash
DATABASE_PATH=./data/pxe.db \
DATABASE_URL=postgres://lantern:lantern@localhost:5432/lantern \
npm run migrate
```

## License

Apache 2.0, see [LICENSE](LICENSE).

[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2Fyatinmanuel%2Flantern.svg?type=large&issueType=license)](https://app.fossa.com/projects/git%2Bgithub.com%2Fyatinmanuel%2Flantern?ref=badge_large&issueType=license)
