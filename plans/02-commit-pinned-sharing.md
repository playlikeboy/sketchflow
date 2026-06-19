# Plan 02: Commit-Pinned Sharing and Embeds

## Goal
Support sharing and embedding specific versions of projects by reading a `?ref={commitSha}` parameter.

## Proposed Changes

### 1. Update Workspace Routes
In [workspace-routes.ts](file:///Users/shaswatraj/Desktop/startups/sketchflow/src/lib/workspace-routes.ts), update `shareHref` and `embedHref` to accept an optional `ref?: string | null`:
```typescript
export function shareHref(workspace, projectId, ref) {
  const base = `/share/${workspace.repoOwner}/${workspace.repoName}/${projectId}`;
  return ref ? `${base}?ref=${encodeURIComponent(ref)}` : base;
}
```

### 2. Update Share & Embed Route Handlers
Update [share/page.tsx](file:///Users/shaswatraj/Desktop/startups/sketchflow/src/app/share/%5Bowner%5D/%5Brepo%5D/%5BprojectId%5D/page.tsx) and [embed/page.tsx](file:///Users/shaswatraj/Desktop/startups/sketchflow/src/app/embed/%5Bowner%5D/%5Brepo%5D/%5BprojectId%5D/page.tsx):
- Parse `searchParams` for `ref`.
- Default to `getPublicRepoDefaultBranch(owner, repo)` if `ref` is missing.
- Pass `branch` (commit SHA or branch name) to the loaders `readPublicProject` and `readPublicSketch`.

### 3. Add Commit Share Link in History Panel
In [history-panel.tsx](file:///Users/shaswatraj/Desktop/startups/sketchflow/src/components/history-panel.tsx), add a "Copy Share Link" button next to preview commits when viewing a public workspace:
- Uses `shareHref(workspace, projectId, commit.sha)`.

## Verification
- View a public workspace project history.
- Preview a commit and click "Copy Share Link".
- Open the copied link in an incognito window. Verify it shows the exact version of the sketch and notes from that historical commit.
