## What and why
What this changes and the problem it solves. Link the issue if there is one.

## How it was checked
- [ ] `bun run test`
- [ ] `bun run lint`
- [ ] `bunx tsc --noEmit`
- [ ] `bun run build`, then `bun run test:e2e`
- [ ] If the database schema changed: `bun run db:push`

## Review notes
- [ ] API changes: mutating routes call `assertSameOrigin` and `assertRateLimit`, load workspaces with `getWorkspace(user.id, …)`, and validate every path and branch.
- [ ] UI changes: follow `DESIGN.md`, checked in light and dark themes and at phone width, keyboard reachable.
- [ ] No secrets, tokens or local credentials are committed.

## Screenshots
For UI changes, before and after.
