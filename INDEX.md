# Repository Index

## Overview
Lantern is a TypeScript/Node.js PXE orchestration server with an Alpine Linux agent and a Next.js web UI.

## Top-Level Structure
- `src/` - Main server source (TypeScript)
- `agents/` - Go-based NATS agent tooling
- `web/` - Next.js web UI
- `package.json` - Server dependencies and scripts
- `tsconfig.json` - TypeScript config
- `nats-server.conf.example` - Example NATS server config with TLS

## Key Entry Points
- `src/index.ts` - Server entry point
- `src/api/` - HTTP API routes
- `src/ai/` - AI command processing
- `src/tasks/` - OS install task workflow
- `src/database/` - SQLite data layer
- `web/app/` - Next.js app router
- `web/README.md` - UI-specific setup notes

## Generated/Local-Only Artifacts (ignored)
- `node_modules/`, `web/node_modules/`
- `dist/`
- `data/`
- `logs/`
- `web/.next/`, `web/out/`
- `.env`, `web/.env.local`
