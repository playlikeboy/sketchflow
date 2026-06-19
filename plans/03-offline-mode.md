# Plan 03: Offline Mode and Local Workspaces

## Goal
Enable offline usage of Sketchflow by utilizing IndexedDB for pure offline workspaces and giving users control over when to sync.

## Proposed Changes

### 1. Offline Storage Wrapper
In [indexeddb.ts](file:///Users/shaswatraj/Desktop/startups/sketchflow/src/lib/indexeddb.ts), add stores and wrappers for offline data:
- `sketchflow:offline:workspaces`: list of local workspaces.
- `sketchflow:offline:{workspaceId}:projects`: list of local projects.
- `sketchflow:offline:{workspaceId}:{projectId}:project`: local project settings.

### 2. Pure Offline Switcher & Page
- Add an Offline Workspace page `/app/offline` or support offline cards in the dashboard.
- Update `AppSidebar` and `ProjectsHomeClient` to check network availability (`navigator.onLine`).
- Render local IndexedDB workspaces when working in offline mode.

### 3. Editor Offline Indicators & Actions
In [editor-client.tsx](file:///Users/shaswatraj/Desktop/startups/sketchflow/src/components/editor-client.tsx):
- Add a "Sync Status" pill in the header showing: `Offline / Local draft / Synced`.
- Provide a "Save Locally" and "Sync to GitHub" control options.
- Disable auto-commits to GitHub when offline or when sync is paused.

### 4. Connect Offline to GitHub
Add a step-by-step modal/form that lets users publish a local workspace to a new GitHub repo when they come online.

## Verification
- Disconnect internet. Check if workspace page loads with cached assets.
- Create an offline workspace, draw on canvas, edit notes. Check IndexedDB storage values.
- Reconnect internet, click "Connect to GitHub", verify a new repository is initialized and all files committed.
