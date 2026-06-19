# Plan 01: Session and Token Isolation

## Goal
Prevent cross-user leaks where a newly logged-in user sees the projects/workspaces of the previously logged-in user.

## Proposed Changes

### 1. Token Prefixing in `github-token.ts`
Modify [github-token.ts](file:///Users/shaswatraj/Desktop/startups/sketchflow/src/lib/github-token.ts) to store token keys prefixed by the active user's Stack ID:
- Change key generator: `sketchflow:${userId}:github-token`.
- Update `getStoredGithubToken()`, `setStoredGithubToken()`, and `clearStoredGithubToken()` to accept an optional `userId`.

### 2. SWR Cache Purging on Logout
In [app-shell.tsx](file:///Users/shaswatraj/Desktop/startups/sketchflow/src/components/app-shell.tsx), update the "Sign out" button action:
- Clear SWR cache using `mutate(() => true, undefined, { revalidate: false })` before redirecting.
- Ensure the local token is cleared cleanly.

### 3. API Route Cache Disabling
Add dynamic rendering flags to key endpoints to prevent Next.js from caching GET requests:
- Add `export const dynamic = "force-dynamic"` to:
  - [api/workspaces/route.ts](file:///Users/shaswatraj/Desktop/startups/sketchflow/src/app/api/workspaces/route.ts)
  - [api/workspaces/[workspaceId]/projects/route.ts](file:///Users/shaswatraj/Desktop/startups/sketchflow/src/app/api/workspaces/%5BworkspaceId%5D/projects/route.ts)

## Verification
- Log in with User A, add projects.
- Log out, log in with User B. Verify that User B's dashboard is completely blank (or shows the "Create your first workspace" card).
- Verify that User A's token is not used for User B.
