# AGENTS.md

## Project

Sketchflow is a GitHub-native visual workspace. User-owned GitHub repos are the durable source of truth for sketches, docs, exports, assets, metadata, and public project files.

## Required Practices

- Use Context7 for current docs whenever working with libraries, frameworks, SDKs, APIs, CLIs, or cloud services.
- Never commit secrets. `.env.local`, `.env*`, `.dev.vars`, tokens, database URLs, Stack Auth secrets, and GitHub tokens must stay untracked.
- Keep Postgres small. Store only users, GitHub connection metadata, workspace pointers, billing metadata, and sync events.
- Use Drizzle for database schema and queries. Do not add raw SQL repositories unless there is a clear migration or introspection reason.
- Preserve GitHub as the durable data store. Sketch scene JSON, project files, docs, exports, and assets belong in the user's repo.
- Do not commit every stroke to GitHub. Use IndexedDB for instant local drafts and explicit or debounced snapshot commits for durable sync.
- Prefer GitHub multi-file commits through trees/commits/refs for snapshot saves.
- Do not use jsDelivr for private data, live collaboration, or mutable latest state. Use it only for public, immutable, commit-pinned assets.
- Browser-stored GitHub PATs are a local fallback only. Never store them in Postgres, sync events, repo files, logs, or commits.

## Frontend Guidance

- Build an app-first product, not a marketing-first landing page.
- Keep the UI dense, calm, and work-focused: GitHub, Linear, Notion, and Excalidraw are the reference mood.
- Use Tailwind CSS and lucide-react icons. Do not introduce a component framework without an explicit decision.
- Use `@excalidraw/excalidraw` only in client-rendered components.
- Use BlockNote for project docs editing.
- Use SWR for authenticated app API data and scope workspace caches by the Stack user id.
- Keep the app minimal. Avoid explanatory panels in core workspace/project pages unless they unblock an action.

## Verification

Before handoff, run:

```bash
bunx tsc --noEmit
bun run build
```

When DB schema changes are made, also run:

```bash
bun run db:push
```

The worktree may contain user changes. Do not revert changes you did not make.
