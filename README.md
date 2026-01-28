# Lantern

> PXE server for provisioning bare-metal machines into Alpine Linux, tracking hardware, and executing OS installs at scale.

## Badges

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![CI](https://img.shields.io/badge/CI-not%20configured-lightgrey)](#continuous-integration)
[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2Fyatinmanuel%2Flantern.svg?type=shield&issueType=license)](https://app.fossa.com/projects/git%2Bgithub.com%2Fyatinmanuel%2Flantern?ref=badge_shield&issueType=license)
[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2Fyatinmanuel%2Flantern.svg?type=shield&issueType=security)](https://app.fossa.com/projects/git%2Bgithub.com%2Fyatinmanuel%2Flantern?ref=badge_shield&issueType=security)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](#requirements)
[![TypeScript](https://img.shields.io/badge/typescript-5.x-blue)](#requirements)

> Replace badge URLs once you add GitHub Actions:  
> `https://github.com/<ORG>/<REPO>/actions/workflows/ci.yml/badge.svg`

## Features

- **Universal OS Installation**: Supports Debian, Ubuntu, Arch Linux, Fedora, CentOS, and Alpine using the universal bootstrap/chroot method
- **Hardware Discovery**: Automatically collects hardware information from booted servers
- **File Caching**: Downloads OS files from PXE server (local cache) or internet (fallback)
- **SSH-Based Execution**: Executes installation commands via SSH on Alpine instances
- **Job Queue**: All actions run as background jobs with real-time status updates

## Architecture

1. **PXE Server Application** (Node.js/TypeScript) - Main orchestration and API
2. **Alpine Linux Agent** - Runs on booted servers to report hardware and execute tasks
3. **Database** - Tracks servers, hardware info, and jobs (Postgres)
4. **Job Worker** - Background job runner for ISO imports, config changes, and client actions
5. **OS Installation System** - Plugin-based installer supporting multiple Linux distributions

## Requirements

- Node.js 18+
- npm 9+
- Linux host with PXE/DHCP/TFTP setup (external or integrated)

## Quickstart

```bash
npm install
cp .env.example .env
npm run build
npm start
```

## Docker (Production)

1. Configure environment:
   ```bash
   cp .env.example .env
   ```
   Set at minimum: `PXE_SERVER_IP`, `PXE_SERVER_URL`, and `DHCP_INTERFACE`.

2. Download iPXE binaries:
   iPXE binaries are downloaded automatically by the `dnsmasq` container on startup.

3. Start the stack:
   ```bash
   docker compose up -d --build
   ```

Notes:
- If your router handles DHCP, set `DHCP_MODE=proxy` (default) and ensure only one DHCP server is active.
- The PXE/TFTP root is `./pxe` on the host (mounted to `/var/www/html` in containers).
- If host `dnsmasq` is running, stop it before starting the container.

## Docker (Dev Override)

`docker-compose.override.yml` enables verbose dnsmasq logging for troubleshooting.
For a clean production run, use:
```bash
docker compose -f docker-compose.yml up -d --build
```

## Docker (Dev Servers)

This spins up the backend and frontend in dev/watch mode inside containers.

```bash
docker compose -f docker-compose.dev.yml up -d
```

Notes:
- Uses `lantern-*-dev` container names.
- Backend runs `tsx watch` (auto-reload).
- Web runs `next dev` (auto-reload).

## Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env
   ```

3. **Build**:
   ```bash
   npm run build
   ```

4. **Run**:
   ```bash
   npm start
   ```

## Migration (SQLite -> Postgres)

If you have an existing SQLite database, you can migrate it into Postgres:

```bash
export DATABASE_PATH=./data/pxe.db
export DATABASE_URL=postgres://lantern:lantern@localhost:5432/lantern
npm run migrate
```

## Configuration

Key environment variables:
- `PXE_SERVER_IP` - IP address of the PXE server (default: 192.168.1.10)
- `DATABASE_URL` - Postgres connection string
- `POSTGRES_DB` - Postgres database name (Docker)
- `POSTGRES_USER` - Postgres username (Docker)
- `POSTGRES_PASSWORD` - Postgres password (Docker)
- `OS_FILES_DIR` - Directory for OS file cache
- `NATS_URL` - NATS server URL (use `tls://` for TLS)
- `NATS_TLS_CA` - Path to CA certificate for NATS TLS
- `NATS_TLS_CERT` - Path to client certificate for mTLS
- `NATS_TLS_KEY` - Path to client key for mTLS
- `NATS_TLS_HANDSHAKE_FIRST` - Set `true` if server requires TLS first

PXE config values are persisted in the database (`pxe_config`) and can be edited
in the dashboard under **Settings -> PXE Config**. Image management is available
under **Images** (upload, extract inside the container, auto-generate
iPXE menu entries, or scan the ISO directory for manually copied files).

## Usage

### API Endpoints

- `GET /api/servers` - List all registered servers
- `GET /api/servers/:mac` - Get server by MAC address
- `POST /api/servers/register` - Register a new server (called by Alpine agent)

## OS Installation Process

The system uses a universal 5-phase bootstrap method:

1. **Foundation** - Partition and format disk
2. **Injection** - Download base OS filesystem (varies by distro)
3. **Brain Transplant** - Chroot into new OS
4. **Life Support** - Install kernel and bootloader
5. **Final Config** - Configure and make bootable

## File Caching

OS files are downloaded from:
1. PXE server cache (`/var/www/html/os-files/`) - Primary, faster
2. Internet - Fallback if file not cached

## Continuous Integration

CI is not configured yet. A typical setup includes:
- Lint (TypeScript)
- Type-check
- Unit tests
- Build (backend + web)

When you add GitHub Actions, update the CI badge at the top.

## Contributing

1. Fork the repo
2. Create a feature branch
3. Run tests and lint locally
4. Open a PR with a clear description

## Security

Please do not open public issues for security vulnerabilities.  
Use a private disclosure process instead.

## License

Apache License 2.0

[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2Fyatinmanuel%2Flantern.svg?type=large&issueType=license)](https://app.fossa.com/projects/git%2Bgithub.com%2Fyatinmanuel%2Flantern?ref=badge_large&issueType=license)
