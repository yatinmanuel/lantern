# PXE Server Web Dashboard

A modern, clean web dashboard for the Intelligent PXE Server built with Next.js and shadcn/ui.

## Features

- 🎨 Clean, modern UI with shadcn/ui components
- 📊 Real-time server monitoring
- 🤖 AI-powered command interface
- 📱 Responsive design
- ⚡ Fast and lightweight

## Getting Started

### Prerequisites

- Node.js 18+ installed
- PXE Server API running on port 3000

### Installation

The dashboard is already set up in the `web` directory. Just install dependencies:

```bash
cd web
npm install
```

### Running the Dashboard

```bash
npm run dev
```

The dashboard will be available at `http://localhost:3001`

### Configuration

The dashboard connects to the PXE Server API. By default, it connects to `http://localhost:3000`.

To change the API URL, copy `.env.local.example` to `.env.local` and edit it:

```env
NEXT_PUBLIC_API_URL=http://your-api-url:3000
```

## Pages

- **Dashboard** (`/`) - Overview with client statistics
- **Clients** (`/servers`) - List and manage all registered clients
- **Images** (`/images`) - Manage ISO uploads and PXE menu entries
- **Settings** (`/settings`) - Configuration options

## Building for Production

```bash
npm run build
npm start
```

## Tech Stack

- **Next.js 16** - React framework
- **shadcn/ui** - UI component library
- **Tailwind CSS** - Styling
- **TypeScript** - Type safety
- **Lucide React** - Icons
