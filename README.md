# Sketchflow

Sketchflow is a GitHub-native visual workspace for builders. Sketches, project docs, exports, assets, metadata, and history live in a repository the user owns.

The product direction is simple:

> Excalidraw-like creation, Eraser-like project flow, GitHub-native ownership, and AI-ready project memory.

## Architecture

Sketchflow keeps durable product data in GitHub and keeps the app database intentionally small.

```txt
Browser IndexedDB  -> instant local drafts
Sketchflow API     -> auth, GitHub sync, metadata pointers
GitHub repo        -> durable sketches, docs, exports, assets, logs
Neon Postgres      -> users, GitHub connections, workspaces, billing metadata
Drizzle ORM        -> typed schema and database access
Stack Auth         -> authentication and GitHub OAuth connection
```

Postgres should not store sketch scenes. It stores only operational metadata such as user identity, connected GitHub accounts, workspace pointers, sync events, and future billing state.

## Repository Data Model

Bootstrapped user repos follow this shape:

```txt
.sketchflow/
  manifest.json
  workspace.json
  latest.json
  indexes/
    public-projects.json
    search-index.json
projects/
  {projectSlug}/
    project.json
    sketches/
      {sketchSlug}.excalidraw.json
    docs/
      notes.md
    exports/
    assets/
```

Commit-pinned public assets can be served through jsDelivr:

```txt
https://cdn.jsdelivr.net/gh/{owner}/{repo}@{commitSha}/{path}
```

Use jsDelivr only for public, immutable assets. Private data, live collaboration, and latest mutable state must go through authenticated APIs.

## Local Setup

Install dependencies:

```bash
bun install
```

Create local env files from the examples:

```bash
cp .env.example .env.local
cp .dev.vars.example .dev.vars
```

Required variables:

```txt
NEXT_PUBLIC_STACK_PROJECT_ID
NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY
STACK_SECRET_SERVER_KEY
DATABASE_URL
GITHUB_API_VERSION
GITHUB_OAUTH_SCOPES
SKETCHFLOW_REPO_NAME
SKETCHFLOW_DEFAULT_BRANCH
```

Run the app:

```bash
bun run dev
```

Open `http://localhost:3000`.

## Scripts

```bash
bun run dev          # Next.js development server
bun run build        # Production build
bun run db:push      # Push Drizzle schema to Neon
bun run db:generate  # Generate Drizzle migrations
bun run db:migrate   # Apply generated Drizzle migrations
bun run preview      # OpenNext Cloudflare preview
bun run deploy       # Deploy through OpenNext Cloudflare
```

## Backend API

Current implemented API surface:

```txt
GET  /api/auth/me
GET  /api/github/status
GET  /api/health
GET  /api/workspaces
POST /api/workspaces
POST /api/workspaces/bootstrap
POST /api/workspaces/[workspaceId]/commit
GET  /api/workspaces/[workspaceId]/projects/[projectId]/sketches/[sketchId]
```

The workspace bootstrap endpoint creates or connects a GitHub repo, writes the `.sketchflow` starter files, records metadata in Neon, and returns a commit-pinned CDN base URL.

The commit endpoint writes one multi-file commit to the connected GitHub repo. It is meant for snapshot saves, not every canvas stroke.

## Frontend MVP

The app-first frontend includes:

- Signed-out product entry with Stack Auth links.
- Signed-in onboarding with GitHub connection and repo bootstrap.
- Authenticated dashboard with workspace cards and sync state.
- Excalidraw editor route with IndexedDB autosave.
- Manual GitHub snapshot save for scene JSON, project metadata, and notes.
- Polished placeholders for collaboration, AI, docs, publishing, exports, timeline, and billing.

## Security Notes

- Never commit `.env.local`, `.dev.vars`, API keys, OAuth tokens, or database URLs.
- Rotate any secret that has been pasted into chat or logs.
- Prefer Stack Auth connected accounts over raw GitHub PATs.
- GitHub is the durable source of truth, but not a live database.
- Do not commit every canvas change. Batch snapshots and keep live collaboration ephemeral.

## Roadmap

1. Save/load Excalidraw sketches from GitHub.
2. Public read-only project pages with commit-pinned assets.
3. Version timeline and visual history.
4. Docs beside sketches.
5. Export pipeline for SVG, PNG, Markdown, and docs.
6. Live collaboration with Yjs and Redis.
7. AI BYOK and managed credits.
8. Dodo Payments billing and plan entitlements.
