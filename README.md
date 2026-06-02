# Sketchflow

Sketchflow is a GitHub-native visual workspace for builders. It combines an Excalidraw canvas, project docs, public pages, templates, and repo-backed project memory while keeping durable user data in GitHub.

Production: <https://sketchflow.space>  
Repository: <https://github.com/SH20RAJ/sketch-flow>

## Product

Sketchflow is built around one principle:

```txt
GitHub owns the durable files.
Sketchflow owns the fast editing experience.
```

Users can create multiple workspaces. Each workspace is one GitHub repo. Each workspace can contain multiple projects under `projects/`.

## Tech Stack

```txt
Next.js 16 App Router       -> app, API routes, metadata, PWA manifest
React 19                   -> client UI
Tailwind CSS + shadcn UI    -> product interface
Excalidraw                  -> canvas editor
BlockNote                   -> project docs editor
SWR                         -> client API cache and active revalidation
Stack Auth                  -> auth and GitHub OAuth connection
Drizzle ORM                 -> typed Postgres schema
Neon Postgres               -> users, workspace pointers, sync events
GitHub REST API             -> repo bootstrap, reads, multi-file commits
OpenNext Cloudflare         -> Worker deployment
jsDelivr                    -> public immutable commit-pinned assets
```

## Data Model

Postgres stores only app metadata:

```txt
users
github_connections
workspaces
sync_events
billing_customers
```

Sketches, docs, assets, exports, project metadata, and public pages live in the user-owned GitHub repo:

```txt
.sketchflow/
  manifest.json
  workspace.json
  latest.json
  indexes/
    public-projects.json
    search-index.json
projects/
  projects-metadata.json
  {projectSlug}/
    project.json
    sketches/
      {sketchSlug}.excalidraw.json
    docs/
      notes.md
    exports/
    assets/
```

## Local Setup

Install dependencies:

```bash
bun install
```

Create local environment files:

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

Recommended values:

```txt
NEXT_PUBLIC_APP_URL=https://sketchflow.space
GITHUB_API_VERSION=2022-11-28
GITHUB_OAUTH_SCOPES=repo,read:user,user:email
SKETCHFLOW_REPO_NAME=sketchflow-workspace
SKETCHFLOW_DEFAULT_BRANCH=main
```

Run locally:

```bash
bun run dev
```

Open <http://localhost:3000>.

## Scripts

```bash
bun run dev          # Next.js dev server
bun run build        # Production build
bun run db:push      # Push Drizzle schema to Neon
bun run db:generate  # Generate migrations
bun run db:migrate   # Apply migrations
bun run preview      # OpenNext Cloudflare preview
bun run deploy       # OpenNext Cloudflare deploy
bun run cf-typegen   # Generate Cloudflare env types
```

## API

Implemented routes:

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
GET  /api/excalidraw/libraries
GET  /api/excalidraw/libraries/file
```

GitHub sync uses batched multi-file commits. The app does not commit every canvas stroke. Instant drafts live in IndexedDB.

## GitHub Access

Primary flow:

1. User signs in with Stack Auth.
2. User connects GitHub OAuth with `repo`, `read:user`, and `user:email` scopes.
3. Sketchflow creates or connects a workspace repo.
4. Saves create GitHub commits.

Fallback flow:

If OAuth needs a refresh, the UI shows a recovery card. Users can reconnect GitHub or paste a local browser-only GitHub token generated here:

<https://github.com/settings/tokens/new?description=Sketchflow%20local%20sync%20token&scopes=repo,read:user,user:email>

The local token is stored in browser localStorage only. It is sent to same-origin Sketchflow API routes as a fallback and is never written to Postgres or committed to GitHub.

## Frontend Areas

```txt
/                 landing page
/app              project grid for the selected workspace
/app/workspace    workspace creation and GitHub access
/app/recent       recent projects
/app/docs         project docs index
/app/public       public project pages
/app/templates    starter project templates
/help             help and GitHub recovery steps
/share/...        public project page
/embed/...        embeddable public project view
```

## PWA

Sketchflow includes:

```txt
public/favicon.ico
public/logo.png
public/og-image.png
public/pwa-192.png
public/pwa-512.png
public/apple-touch-icon.png
public/sw.js
src/app/manifest.ts
```

The service worker only caches static same-origin assets. API responses and private GitHub data are not cached by the service worker.

## Deployment

The Worker is configured for:

```txt
https://sketchflow.space
```

Manual deploy:

```bash
bun run deploy
```

GitHub Actions deploys on pushes to `main`, manual dispatch, and a daily schedule. Required GitHub Actions secrets:

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

GitHub Actions maps `SKETCHFLOW_GITHUB_API_VERSION` to `GITHUB_API_VERSION` and `SKETCHFLOW_GITHUB_OAUTH_SCOPES` to `GITHUB_OAUTH_SCOPES` because GitHub blocks secret names beginning with `GITHUB_`.

## Security

- Never commit `.env.local`, `.dev.vars`, API keys, OAuth secrets, PATs, or database URLs.
- Rotate any secret pasted into chat, screenshots, logs, or PRs.
- Keep private repo data off jsDelivr and public CDN URLs.
- Keep GitHub as durable storage, IndexedDB as instant local draft storage, and Postgres as metadata only.
- Prefer OAuth. Local tokens are an explicit browser-only fallback.

## Verification

Before handoff:

```bash
bunx tsc --noEmit
bun run build
```

If schema changes:

```bash
bun run db:push
```
