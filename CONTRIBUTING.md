# Contributing to Sketchflow

Thanks for helping build Sketchflow. This project is early, so the most valuable contributions keep the architecture simple, user-owned, and easy to reason about.

## Local Development

Install dependencies:

```bash
bun install
```

Set up environment files:

```bash
cp .env.example .env.local
cp .dev.vars.example .dev.vars
```

Fill in Stack Auth and Neon values locally. Do not commit secrets.

Run the dev server:

```bash
bun run dev
```

## Database Workflow

Sketchflow uses Drizzle with Neon Postgres.

```bash
bun run db:push      # apply schema directly during development
bun run db:generate  # generate migration files when migrations are needed
bun run db:migrate   # apply generated migrations
```

Keep sketch content out of Postgres. Store only metadata pointers, billing state, and sync events in the database.

## Code Style

- Use TypeScript and keep strict types useful.
- Prefer small server helpers over duplicated route logic.
- Prefer explicit JSON response shapes for APIs.
- Keep GitHub repo writes batched into multi-file commits.
- Use IndexedDB for local editor drafts.
- Use lucide-react icons for tool buttons and navigation items.

## Pull Request Checklist

Before opening a PR:

```bash
bunx tsc --noEmit
bun run build
```

If schema changed:

```bash
bun run db:push
```

Include:

- What changed.
- How it was tested.
- Any data model or API changes.
- Any follow-up work that remains.

## Security

- Never commit secrets, access tokens, PATs, database URLs, or `.env.local`.
- Rotate any secret that was pasted into chat, logs, screenshots, or a PR.
- Prefer Stack Auth GitHub connected accounts over raw PAT flows.
- Do not expose private GitHub repo content through public CDN URLs.

## Issues

When reporting a bug, include:

- Expected behavior.
- Actual behavior.
- Steps to reproduce.
- Browser and OS, if frontend-related.
- Relevant API route or GitHub repo state, if sync-related.
