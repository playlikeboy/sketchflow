<div align="center">

# 🎨 Sketchflow

**A GitHub-native, offline-first visual workspace for builders.**  
*Excalidraw canvas, BlockNote markdown docs, curated libraries, and durable Git-backed project memory.*

[![Hacktoberfest](https://img.shields.io/badge/Hacktoberfest-2025-orange.svg?style=for-the-badge&logo=hacktoberfest)](https://github.com/SH20RAJ/sketch-flow/labels/hacktoberfest)
[![Visitor Count](https://komarev.com/ghpvc/?username=SH20RAJ-sketch-flow&label=Repo%20Views&color=58cc02&style=for-the-badge)](https://github.com/SH20RAJ/sketch-flow)
[![License: MIT](https://img.shields.io/badge/License-MIT-58cc02.svg?style=for-the-badge)](./LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/SH20RAJ/sketch-flow?style=for-the-badge&color=58cc02)](https://github.com/SH20RAJ/sketch-flow/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/SH20RAJ/sketch-flow?style=for-the-badge&color=1cb0f6)](https://github.com/SH20RAJ/sketch-flow/network)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=for-the-badge)](./CONTRIBUTING.md)

[**🌐 Explore Live App**](https://sketchflow.space) · [**📖 Architecture Guide**](./docs/ARCHITECTURE.md) · [**🤝 Contributing**](./CONTRIBUTING.md) · [**🐛 Report Bug**](https://github.com/SH20RAJ/sketch-flow/issues)

</div>

---

## 💡 What is Sketchflow?

Most whiteboard and diagramming apps lock your sketches, diagrams, and project documentation inside proprietary databases.

**Sketchflow takes a different path:**

> **GitHub owns the durable files. Sketchflow owns the fast, offline-first editing experience.**

- Every diagram is saved as standard `.excalidraw.json`.
- Every document is saved as clean, human-readable `notes.md`.
- Every save creates a clean, atomic Git commit in **your own GitHub repository**.
- All edits write with **0ms latency** to browser-isolated IndexedDB, allowing you to work smoothly with or without internet.

---

## ✨ Features

- 🎨 **Full-Featured Excalidraw Canvas**: Wireframe, design software architecture, flowchart systems, and sketch ideas on an infinite visual board.
- 🌓 **Dynamic Contrast & Theme Engine**: Instant 1-click switching between Dark Mode (`#121212`) and Light Mode (`#ffffff`). Strokes automatically adapt with luminance checks so strokes are never invisible.
- 📝 **Notion-Style BlockNote Docs**: Edit rich markdown notes side-by-side with your canvas. Supports headings, checklists, code blocks, and media uploads under 2MB.
- ⚡ **Offline-First with 0ms Cold Starts**: User-isolated IndexedDB storage (`stackUserId`) keeps drafts instant and offline-resilient without cross-account pollution.
- 🐙 **Atomic Multi-File Git Sync**: Uses GitHub REST Git Trees to commit diagrams, docs, and project manifests in a single atomic commit without heavy clone overhead.
- 📚 **Curated Excalidraw Libraries**: One-click install for software engineering icons, UML blocks, AWS/GCP architecture symbols, UI wireframes, and design kits.
- ⏳ **Git Project History & Restore**: Browse commit logs for any project, preview past versions in read-only mode, and restore historical snapshots with 1 click.
- 🌐 **Public Sharing & Embed Mode**: Share clean, read-only public project URLs or embed sketches directly into your websites and documentation via iframe.
- 📱 **Progressive Web App (PWA)**: Install Sketchflow on desktop or mobile for a native, distraction-free app window.

---

## 🏛️ Architecture & Data Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│                        USER BROWSER / CLIENT                           │
│   React 19 · Excalidraw · BlockNote Editor · Tailwind CSS · SWR Cache  │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
         ┌───────────────────────────┴───────────────────────────┐
         ▼                                                       ▼
┌─────────────────────────────────┐             ┌─────────────────────────────────┐
│     LOCAL INDEXEDDB CACHE       │             │       NEXT.JS / CLOUDFLARE      │
│  - 0ms instant local drafts     │             │  - Edge API routes              │
│  - User-scoped partition keys   │             │  - Stack Auth verification      │
│  - Offline resilience           │             │  - SWR state hydration         │
└─────────────────────────────────┘             └────────────────┬────────────────┘
                                                                 │
                                 ┌───────────────────────────────┴────────────────┐
                                 ▼                                                ▼
                ┌─────────────────────────────────┐              ┌─────────────────────────────────┐
                │      NEON POSTGRES DATABASE     │              │       USER GITHUB REPOSITORY    │
                │  - Users & workspace pointers   │              │  - Durable .excalidraw.json     │
                │  - GitHub OAuth connection data │              │  - Durable notes.md             │
                │  - Sync event audits            │              │  - Atomic multi-file Git Trees  │
                └─────────────────────────────────┘              └─────────────────────────────────┘
```

For an in-depth breakdown of our storage models, sync algorithms, and data structures, read the [Architecture Guide](./docs/ARCHITECTURE.md).

---

## 🗂️ Workspace Repository Structure

When connected to GitHub, Sketchflow maintains your workspace with this clean hierarchy:

```txt
your-workspace-repo/
├── .sketchflow/
│   ├── manifest.json              # Schema version & workspace pointers
│   ├── workspace.json             # Workspace settings
│   └── indexes/
│       ├── public-projects.json   # Public sharing index
│       └── search-index.json      # Fast search index
└── projects/
    ├── projects-metadata.json     # Ordered project registry & tags
    └── {project-slug}/
        ├── project.json           # Project metadata & sketch links
        ├── sketches/
        │   └── {sketch-slug}.excalidraw.json   # Excalidraw scene JSON
        ├── docs/
        │   └── notes.md           # Markdown documentation
        ├── exports/               # Exported PNG / SVG diagrams
        └── assets/                # Attached images
```

---

## 🚀 Getting Started

### Prerequisites
- [Bun](https://bun.sh/) (v1.1 or higher)
- [Git](https://git-scm.com/)
- A free [Stack Auth](https://stack-auth.com/) account (for user auth & GitHub OAuth)
- A free [Neon Postgres](https://neon.tech/) database

### 1. Clone the Repository
```bash
git clone https://github.com/SH20RAJ/sketch-flow.git
cd sketch-flow
```

### 2. Install Dependencies
```bash
bun install
```

### 3. Configure Environment Variables
```bash
cp .env.example .env.local
cp .dev.vars.example .dev.vars
```

Fill in your credentials in `.env.local`:
```env
NEXT_PUBLIC_STACK_PROJECT_ID=your-stack-project-id
NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY=your-stack-publishable-key
STACK_SECRET_SERVER_KEY=your-stack-secret-server-key

DATABASE_URL=postgresql://user:password@ep-sample-123456.us-east-2.aws.neon.tech/sketchflow?sslmode=require

NEXT_PUBLIC_APP_URL=http://localhost:3000
GITHUB_API_VERSION=2022-11-28
GITHUB_OAUTH_SCOPES=repo,read:user,user:email

SKETCHFLOW_REPO_NAME=sketchflow-workspace
SKETCHFLOW_DEFAULT_BRANCH=main
```

### 4. Push Database Schema
```bash
bun run db:push
```

### 5. Launch the Development Server
```bash
bun run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🛠️ Available Scripts

| Script | Command | Description |
|---|---|---|
| **Dev Server** | `bun run dev` | Runs the Next.js development server on port 3000 |
| **Type Check** | `bunx tsc --noEmit` | Validates TypeScript types across the entire project |
| **Production Build** | `bun run build` | Builds the production bundle with Turbopack |
| **Push Schema** | `bun run db:push` | Pushes Drizzle ORM schema directly to Neon Postgres |
| **Migrations** | `bun run db:generate` | Generates SQL migration files from Drizzle schema |
| **Deploy** | `bun run deploy` | Builds and deploys worker to Cloudflare OpenNext |

---

## 🎃 Hacktoberfest & Contributing

We welcome contributions of all kinds! Whether fixing a bug, designing a new template, enhancing keyboard shortcuts, or optimizing offline sync, your help is appreciated.

1. Browse issues with the [`hacktoberfest`](https://github.com/SH20RAJ/sketch-flow/labels/hacktoberfest) or [`good first issue`](https://github.com/SH20RAJ/sketch-flow/labels/good%20first%20issue) label.
2. Read our [Contributing Guide](./CONTRIBUTING.md) for full setup instructions and conventions.
3. Review our [Code of Conduct](./CODE_OF_CONDUCT.md).
4. Run `bunx tsc --noEmit` and `bun run build` before submitting your PR!

---

## 👁️ Visitor Statistics

<div align="center">

![Visitor Count](https://komarev.com/ghpvc/?username=SH20RAJ-sketch-flow&label=Total%20Repository%20Views&color=58cc02&style=flat-square)

</div>

---

## 📄 License

This project is licensed under the [MIT License](./LICENSE) © 2025-2026 [Shaswat Raj](https://github.com/SH20RAJ) and Sketchflow Contributors.
