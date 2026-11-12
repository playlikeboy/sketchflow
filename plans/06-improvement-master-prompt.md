# Sketchflow improvement master prompt

Paste the prompt below into a fresh Claude Code session at the repo root. It is written to be run more than once: each run picks the next unfinished track, ships it as a small reviewed change, and updates the checklist at the bottom of this file.

---

## Prompt

You are working on Sketchflow, a GitHub-native visual workspace (Next.js 16 on Cloudflare via OpenNext, Stack Auth, Neon Postgres with Drizzle, Excalidraw, BlockNote). The user's GitHub repo is the durable store; Postgres holds only pointers and metadata; IndexedDB holds local drafts.

Read `AGENTS.md`, `DESIGN.md`, `plans/`, and `.claude/ecc/README.md` first. `AGENTS.md` wins over every other rule file. Use the vendored subagents and skills in `.claude/` where they fit: `planner` before a multi-file change, `tdd-guide` for new logic, `code-reviewer` and `security-reviewer` before each commit, `verification-loop` before handoff.

### How to work

1. Pick the first unchecked item in the checklist at the bottom of this file. Do one item per branch.
2. Read the code involved before proposing anything. Reuse what exists (`src/server/github-validation.ts`, `src/server/http.ts`, `src/lib/project-metadata.ts`, `src/lib/sync-manager.ts`).
3. Write or extend tests first for any server logic. Keep pure logic in files that do not import `server-only`, so `bun test` can load them.
4. Keep diffs small. Do not add a dependency, a component framework, or a new table without saying why in the PR.
5. Before handoff run `bun run test`, `bun run lint`, `bunx tsc --noEmit`, and `bun run build`. If the schema changed, run `bun run db:push`.
6. Tick the item in this file, note anything you could not verify, and stop. Do not start the next item in the same change.

### Hard rules

- Never commit secrets, never store GitHub tokens anywhere on the server, never log them.
- Never write to a user's repo outside `.sketchflow/` and `projects/<id>/` unless the user asked for that exact file.
- Every mutating route calls `assertSameOrigin`, checks workspace ownership with `getWorkspace(user.id, …)`, and validates every path segment and branch.
- Anything read from a repo (including the user's own) is untrusted input: narrow it before use.
- No fake metrics, fake testimonials, purchased stars, or star-for-reward schemes. Growth work means making the product and the docs better.

### Track A: remaining audit items

- Offline cache scoping: `src/lib/indexeddb.ts` falls back to unscoped keys when no user id is set, and `purgeProjectDrafts` without a user id deletes every user's drafts. Decide how signed-out offline use should work, give it its own explicit namespace, and migrate signed-in users off the unscoped keys.
- `/api/health`: stop returning database time to anonymous callers and avoid a database round trip on every hit.
- Public reads hit `api.github.com` without a token (60 requests per hour per egress IP). Cache the default-branch lookup harder and fall back cleanly when rate limited.
- Share and embed pages return the not-found UI with a 200 status because of streaming. Return a real 404.
- Add a full Content-Security-Policy (script, style, img, connect) and test it against Excalidraw, BlockNote, and Stack Auth.
- Add rate limiting for the commit, bootstrap, and fork routes (Cloudflare rate limiting binding).
- Repo hygiene: decide whether `.openclaude/`, `.commandcode/`, and `todo.md` belong in the repo; point `package.json` `repository` and `bugs` at the canonical repo; remove dependencies no file imports.

### Track B: reliability

- Route tests for every API handler with GitHub and the database mocked at the module boundary: ownership checks, validation failures, conflict handling (`expectedHeadSha`), and the bootstrap paths (new repo, existing empty repo, already-initialized repo).
- Playwright e2e for the core loop: sign in, bootstrap, draw, snapshot commit, reload, restore from history, open the share page.
- Sync manager: tests for queue ordering, retry, conflict surfacing, and user switching.
- Typed API contracts shared by `src/lib/api.ts` and the route handlers so client and server cannot drift. Remove the remaining `any`.
- Structured error reporting and a way to see failed sync events per workspace.

### Track C: product quality

- First-run flow: one screen from sign-in to a drawable canvas, with clear copy for the GitHub permission request and for the local token fallback.
- Conflict UX: when a commit is rejected because the branch moved, show both versions and let the user choose, instead of an error toast.
- Multi-sketch projects, project rename and delete, asset upload with size feedback.
- Commit-pinned sharing (`plans/02-commit-pinned-sharing.md`) so a shared link never changes under the viewer.
- Accessibility pass with the `accessibility` skill: keyboard paths, focus order, contrast, reduced motion.
- Performance pass with `react-performance`: bundle size of the editor route, lazy loading Excalidraw and BlockNote, IndexedDB write batching.

### Track D: open-source readiness

- README that shows the product in the first screen: one GIF, a three-step quick start, an architecture diagram, and an honest status section.
- `CONTRIBUTING.md` with a working local setup that needs no production secrets (documented dev Stack project, local Postgres or Neon branch, a seeded demo repo).
- `SECURITY.md` with a private reporting address and a response target.
- Labeled good-first-issues generated from the unchecked items here, issue and PR templates that match how the project is actually run, and a public roadmap.
- Release process: changelog, tagged releases, and a self-hosting guide for Cloudflare.

### Track E: sustainable revenue

Keep the core MIT and fully usable without paying. Charge for things that cost money to run or that teams need:

- Hosted plan on sketchflow.space: private workspaces beyond a free limit, larger assets, custom share domains, password-protected or expiring share links.
- Team features: organization workspaces, shared libraries, review comments, audit log of sync events.
- The `sketchflow_billing_customers` table already exists; wire it to one provider behind a small interface, enforce limits on the server, and keep every paid check in one module so self-hosters can see exactly what is gated.
- GitHub Sponsors and a clear "support the project" link for people who self-host.

Write a short pricing proposal as a plan file and get the maintainer's sign-off before building any of this.

---

## Checklist

### Done in the audit pass

- [x] Bootstrap no longer overwrites existing repositories
- [x] Partial workspace upserts keep the default branch
- [x] Branch names validated and encoded in GitHub ref paths
- [x] `POST /api/workspaces` validates input and confirms the repo with GitHub
- [x] Restore, history, and fork routes validate ids and paths and narrow untrusted JSON
- [x] Same-origin guard on all mutating routes
- [x] Share and embed respect project sharing settings
- [x] Frame, nosniff, and referrer headers
- [x] CI secrets scoped to deploy steps, Bun pinned, verify build fixed

### Next

- [x] A: offline cache scoping
- [x] A: health endpoint
- [x] A: unauthenticated GitHub rate limits
- [x] A: real 404 on share and embed
- [ ] A: enforce the Content-Security-Policy (shipped report-only; needs a production pass against Excalidraw, BlockNote and Stack Auth)
- [ ] A: durable rate limiting (in-memory per-isolate limiter shipped; move to a Cloudflare Rate Limiting binding)
- [x] A: repo hygiene and unused dependencies
- [x] B: route tests (commit and bootstrap handlers; projects, restore and history handlers still open)
- [x] B: Playwright e2e against fixture data (a run against a real account is still open)
- [ ] B: sync manager tests
- [ ] B: typed API contracts
- [ ] B: error reporting
- [x] C: first-run flow (no-account Try it page with import after sign-in)
- [x] C: conflict UX (choice of version; no merge view)
- [ ] C: multi-sketch, rename, delete, assets
- [ ] C: commit-pinned sharing
- [ ] C: accessibility pass
- [ ] C: performance pass
- [x] D: README, CONTRIBUTING, SECURITY
- [ ] D: issues, templates, roadmap
- [ ] D: first tagged release (changelog and self-hosting guide written; tag once deploy is green)
- [ ] E: pricing proposal
- [ ] E: billing integration and limits
