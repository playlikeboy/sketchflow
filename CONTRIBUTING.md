# Contributing to Sketchflow

Thank you for your interest in contributing to **Sketchflow**! We welcome contributions from builders of all skill levels, especially during **Hacktoberfest** and open-source sprints.

Sketchflow is an open-source, GitHub-native visual workspace combining an Excalidraw canvas, BlockNote markdown documentation, public sharing, and repo-backed versioning.

---

## 🎃 Hacktoberfest Participation

Sketchflow proudly participates in **Hacktoberfest**!

- Look for issues tagged [`hacktoberfest`](https://github.com/playlikeboy/sketchflow/labels/hacktoberfest), [`good first issue`](https://github.com/playlikeboy/sketchflow/labels/good%20first%20issue), and [`help wanted`](https://github.com/playlikeboy/sketchflow/labels/help%20wanted).
- Quality contributions are valued over quantity. Please avoid spam PRs (e.g. whitespace edits, trivial typos).
- All approved and merged pull requests that adhere to our standards will be tagged with `hacktoberfest-accepted`.
- Feel free to open an issue or propose improvements in discussions before starting large changes.

---

## 🚀 Quickstart & Setup

### Prerequisites
- [Bun](https://bun.sh/) (v1.1+ recommended)
- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/) (v20+ recommended for tooling compatibility)

### 1. Fork and Clone
```bash
git clone https://github.com/<your-username>/sketchflow.git
cd sketchflow
git remote add upstream https://github.com/playlikeboy/sketchflow.git
```

### 2. Install Dependencies
```bash
bun install
```

### 3. Setup Environment
```bash
cp .env.example .env.local
cp .dev.vars.example .dev.vars
```

Edit `.env.local` with your development keys. Required development variables:
```env
NEXT_PUBLIC_STACK_PROJECT_ID=...
NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY=...
STACK_SECRET_SERVER_KEY=...
DATABASE_URL=postgresql://...
NEXT_PUBLIC_APP_URL=http://localhost:3000
GITHUB_API_VERSION=2022-11-28
GITHUB_OAUTH_SCOPES=repo,read:user,user:email
SKETCHFLOW_REPO_NAME=sketchflow-workspace
SKETCHFLOW_DEFAULT_BRANCH=main
```

### 4. Run Development Server
```bash
bun run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🏗️ Architecture & Philosophy

Sketchflow adheres to one central design principle:
> **GitHub owns the durable files. Sketchflow owns the fast, offline-first editing experience.**

1. **User-Owned Data**: Sketch scene files (`.excalidraw.json`), documentation (`notes.md`), project metadata, and assets live exclusively in the user's GitHub repository.
2. **Minimal Database**: Postgres (via Drizzle ORM and Neon) stores only essential metadata: users, GitHub OAuth connections, workspace pointers, billing metadata, and sync logs. Never store private canvas payloads or PATs in Postgres.
3. **Offline-First**: Changes write instantly to IndexedDB with 0ms latency. Sync to GitHub happens asynchronously in batched, atomic multi-file commits.
4. **Contrast & Theme Engine**: Always ensure Excalidraw stroke colors and canvas backgrounds maintain strong contrast in both dark (`#121212`) and light (`#ffffff`) modes.

---

## 🌿 Git & Branch Workflow

1. Create a descriptive feature branch from `main`:
   ```bash
   git checkout -b feat/canvas-minimap
   # or
   git checkout -b fix/theme-contrast
   ```
2. Commit your changes using [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat: add export to PNG option`
   - `fix: resolve stroke contrast on dark canvas`
   - `docs: update deployment instructions in README`
   - `refactor: optimize IndexedDB cache queries`
   - `perf: streamline git tree payload transfer`

---

## 💅 Code Guidelines

- **TypeScript**: Strict typing is enabled. Avoid `any` where possible; use well-defined types or discriminated unions.
- **Styling**: Use Tailwind CSS v4 and vanilla CSS. Do not introduce foreign component libraries without discussion.
- **Icons**: Use `lucide-react`.
- **Canvas Components**: Use `@excalidraw/excalidraw` only in client components (`"use client"` and dynamic imports).
- **UI Mood**: Keep the user interface calm, dense, and work-focused (Linear, Notion, GitHub, and Excalidraw mood). Avoid loud, cluttering explanatory banners on active workspace pages.

---

## 🧪 Verification & Testing

Before submitting a Pull Request, run the same checks CI runs:

```bash
bun run test          # unit tests
bun run lint          # ESLint
bunx tsc --noEmit     # typecheck
bun run build         # production build

# If you changed src/server/db/schema.ts:
bun run db:push
```

Server rules that reviewers will check on any API change:

- Every mutating route calls `assertSameOrigin(request)` and `assertRateLimit(...)` from `src/server/http.ts`.
- Workspaces are always loaded with `getWorkspace(user.id, workspaceId)`, never by id alone, before a write.
- Path segments, branch names and file paths go through the helpers in `src/server/github-validation.ts`.
- Anything parsed from a repository is narrowed before use (`isJsonObject`, `parseRepoJson`); no `any`.
- Logic worth testing lives in a module that does not import `server-only`, with a test in `tests/`.

All commands must exit with code `0` before PR review.

---

## 📥 Submitting a Pull Request

1. Push your branch to your fork:
   ```bash
   git push origin feat/your-feature-name
   ```
2. Open a Pull Request against the `main` branch of `playlikeboy/sketchflow`.
3. Fill out the PR template completely:
   - What problem does this solve?
   - What changes were made?
   - How was it tested?
   - Screenshots/GIFs for UI changes.
4. Maintain a clean commit history. Rebase against `upstream/main` if conflicts arise.

---

## 🛡️ Security & Responsible Disclosure

- **Never commit secrets**: Check that `.env*`, `.dev.vars`, tokens, database URLs, and PATs are never tracked by git.
- If you discover a security vulnerability, do not open a public issue. Follow [SECURITY.md](./SECURITY.md).

---

## 📜 Code of Conduct

All contributors are expected to uphold our [Code of Conduct](./CODE_OF_CONDUCT.md). Please treat fellow community members with kindness and respect.
