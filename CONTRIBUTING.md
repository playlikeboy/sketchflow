# Contributing to Sketchflow

Thanks for helping build Sketchflow. The project is early, so contributions should keep the product simple, fast, and user-owned.

## Setup

```bash
bun install
cp .env.example .env.local
cp .dev.vars.example .dev.vars
bun run dev
```

Open <http://localhost:3000>.

## Environment

Do not commit secrets. Local files such as `.env.local` and `.dev.vars` are ignored and should stay local.

Required local values:

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

## Architecture Rules

- GitHub repos are the durable source of truth for sketches, docs, exports, assets, metadata, and public project pages.
- Postgres stores only users, GitHub connection metadata, workspace pointers, billing metadata, and sync events.
- Use Drizzle for schema and database queries.
- Use IndexedDB for instant local drafts.
- Use batched GitHub commits for snapshots.
- Do not commit every canvas stroke.
- Do not serve private or mutable live data through jsDelivr.

## Frontend Rules

- Keep the app minimal, dense, and work-focused.
- Use Tailwind CSS, shadcn UI primitives, and lucide-react icons.
- Use Excalidraw only in client-rendered components.
- Use BlockNote for project docs editing.
- Use SWR for client API data and active revalidation.
- Keep workspace/project views scoped to the signed-in user id.

## Database Workflow

```bash
bun run db:push      # development schema push
bun run db:generate  # generate migrations when needed
bun run db:migrate   # apply generated migrations
```

Run `bun run db:push` only when schema changes are intentional.

## Checks

Before handoff or PR:

```bash
bunx tsc --noEmit
bun run build
```

If schema changed:

```bash
bun run db:push
```

## Pull Requests

Include:

- What changed.
- How it was tested.
- Any API, schema, or repo-file format changes.
- Any follow-up work.

## Security

- Never commit tokens, PATs, OAuth secrets, Stack Auth secrets, database URLs, or Cloudflare tokens.
- Rotate leaked secrets immediately.
- Prefer Stack Auth GitHub OAuth.
- Browser-stored GitHub tokens are allowed only as a user-controlled local fallback.
- Do not log access tokens or include them in sync events.

## Issues

When reporting a bug, include:

- Expected behavior.
- Actual behavior.
- Steps to reproduce.
- Browser and OS.
- Relevant workspace/project URL, if safe to share.
