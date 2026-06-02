# Sketchflow

Sketchflow is a GitHub-native visual workspace for builders. Sketches, project docs, exports, assets, metadata, and history live in a repository the user owns.

Production: <https://sketchflow.space>

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
SWR                -> client API cache and active project revalidation
Cloudflare Worker  -> production runtime at sketchflow.space
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
NEXT_PUBLIC_APP_URL
GITHUB_API_VERSION
GITHUB_OAUTH_SCOPES
SKETCHFLOW_REPO_NAME
SKETCHFLOW_DEFAULT_BRANCH
```

Recommended production values:

```txt
NEXT_PUBLIC_APP_URL=https://sketchflow.space
GITHUB_API_VERSION=2022-11-28
GITHUB_OAUTH_SCOPES=repo,read:user,user:email
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
bun run cf-typegen   # Generate Cloudflare binding types
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
GET  /api/workspaces/[workspaceId]/projects
POST /api/workspaces/[workspaceId]/projects
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
- PWA install metadata with a conservative service worker for static assets only.
- SWR-backed project lists that revalidate on focus, reconnect, and a short interval.

## Deployment

The Worker is configured for the custom domain:

```txt
https://sketchflow.space
```

Deploy manually:

```bash
bun run deploy
```

GitHub Actions deploys on pushes to `main`, manual dispatch, and a daily scheduled trigger. CI needs these GitHub Actions secrets:

```txt
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
NEXT_PUBLIC_STACK_PROJECT_ID
NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY
STACK_SECRET_SERVER_KEY
DATABASE_URL
NEXT_PUBLIC_APP_URL
SKETCHFLOW_REPO_NAME
SKETCHFLOW_DEFAULT_BRANCH
SKETCHFLOW_GITHUB_API_VERSION
SKETCHFLOW_GITHUB_OAUTH_SCOPES
```

The workflow maps `SKETCHFLOW_GITHUB_API_VERSION` to `GITHUB_API_VERSION` and
`SKETCHFLOW_GITHUB_OAUTH_SCOPES` to `GITHUB_OAUTH_SCOPES`, because GitHub
Actions blocks secret and variable names that start with `GITHUB_`.

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
