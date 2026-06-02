# Project Versioning And Offline Mode Plan

Sketchflow workspaces are GitHub repositories. A project is one folder inside that repo:

```txt
projects/{projectSlug}/
  project.json
  sketches/
    {sketchSlug}.excalidraw.json
  docs/
    notes.md
  exports/
  assets/
```

The versioning system must restore a single project without rolling back the whole workspace repo.

## Goals

- Show a commit list for a selected project.
- Preview a project at any commit.
- Share a commit-pinned version link for public projects.
- Restore only the selected project by creating a new commit on the current branch.
- Detect whether the workspace repo is public or private.
- Let users work offline and avoid GitHub sync until they explicitly choose it.

## GitHub API Primitives

Use the GitHub REST API primitives that match the repo-backed model:

```txt
GET  /repos/{owner}/{repo}
GET  /repos/{owner}/{repo}/commits?path=projects/{projectSlug}
GET  /repos/{owner}/{repo}/commits/{ref}
GET  /repos/{owner}/{repo}/contents/{path}?ref={sha}
GET  /repos/{owner}/{repo}/git/ref/heads/{branch}
POST /repos/{owner}/{repo}/git/trees
POST /repos/{owner}/{repo}/git/commits
PATCH /repos/{owner}/{repo}/git/refs/heads/{branch}
```

The current codebase already has helpers for repository metadata, branch head lookup, file reads by ref, directory listing, and multi-file commits. The restore flow should build on those helpers.

## Project History UI

Add a project history panel reachable from the editor and project grid:

```txt
/app/workspaces/{workspaceId}/projects/{projectId}?view=history
/app/workspaces/{workspaceId}/projects/{projectId}/sketches/{sketchId}?view=history
```

Each row should show:

```txt
commit message
short SHA
author
date
changed project files
GitHub commit link
Preview button
Restore button
Share version button, only for public repos
```

Use SWR for the list so it revalidates when the user saves, restores, or reconnects GitHub.

## Preview A Commit

When the user clicks a commit, load a read-only project snapshot from that exact SHA:

```txt
projects/{projectSlug}/project.json
projects/{projectSlug}/sketches/*.excalidraw.json
projects/{projectSlug}/docs/notes.md
projects/projects-metadata.json
```

The preview should show:

```txt
Canvas preview
Docs preview
Project metadata
Changed files
GitHub tree link
Public/private badge
```

Do not write anything during preview. Treat the selected SHA as immutable.

## Restore One Project

Restoring a project must never rewrite Git history and must never reset the full workspace. Instead:

1. Read the selected project files at `sourceCommitSha`.
2. Read the current branch head SHA.
3. Read the current `projects/projects-metadata.json`.
4. Replace only the matching project entry inside `projects-metadata.json`.
5. Create a new Git tree based on the current branch tree.
6. Put the selected project files from `sourceCommitSha` into the new tree.
7. Create a new commit with the current branch head as parent.
8. Update the branch ref to the new commit SHA.
9. Store a `project_restore` sync event in Postgres.

Suggested commit message:

```txt
Restore {projectTitle} from {shortSha}
```

This makes restore reversible because the restore itself is just another normal commit.

## Restore Safety Rules

- Validate every restored path starts with `projects/{projectSlug}/`.
- Only allow `projects/projects-metadata.json` edits for the selected project entry.
- Require authenticated workspace ownership.
- If the repo is private, require OAuth or the browser-local token fallback.
- If the branch changed since preview, show a confirmation before restoring.
- On GitHub `409 Conflict`, reload the latest branch head and ask the user to retry.
- Do not restore generated cache files, service-worker files, or app database state.

## Version Share Links

Public repo version links:

```txt
https://sketchflow.space/share/{owner}/{repo}/{projectSlug}?ref={commitSha}
https://sketchflow.space/embed/{owner}/{repo}/{projectSlug}?ref={commitSha}
https://github.com/{owner}/{repo}/tree/{commitSha}/projects/{projectSlug}
```

Public immutable asset links can use jsDelivr:

```txt
https://cdn.jsdelivr.net/gh/{owner}/{repo}@{commitSha}/projects/{projectSlug}/exports/{file}
```

Private repo version links:

```txt
https://github.com/{owner}/{repo}/tree/{commitSha}/projects/{projectSlug}
```

Private projects must not use jsDelivr or unauthenticated share pages.

## Repo Privacy Detection

Use `GET /repos/{owner}/{repo}` and read the `private` flag. Store the workspace visibility from bootstrap in Postgres, but verify with GitHub when rendering share/embed/history controls because users can change repo visibility outside Sketchflow.

UI behavior:

```txt
public repo  -> enable share, embed, commit-pinned public version links
private repo -> show private badge, disable public share/embed, keep GitHub links only
```

## Offline Modes

Sketchflow should support three modes:

```txt
Online sync
  Workspace is connected to GitHub. Drafts save locally first. Save commits to GitHub.

Local draft
  Workspace is connected, but GitHub sync is paused. User can edit and save locally until they click Sync.

Pure offline
  No GitHub repo required. Workspace, projects, sketches, docs, and libraries live in IndexedDB.
```

Pure offline should work from `/app/offline` and from the workspace switcher.

## Offline Storage Keys

Use IndexedDB through a small storage adapter, not scattered localStorage calls:

```txt
sketchflow:offline:workspaces
sketchflow:offline:{workspaceId}:projects
sketchflow:offline:{workspaceId}:{projectId}:project
sketchflow:{workspaceId}:{projectId}:{sketchId}
sketchflow:docs:{workspaceId}:{projectId}
sketchflow:libraries:selected
```

Local GitHub fallback tokens can stay in localStorage because they are user-managed recovery credentials, but project content should be IndexedDB.

## Offline UX

Add these controls:

```txt
Workspace switcher -> New offline workspace
Editor status pill -> Offline / Local draft / Synced
Primary button    -> Save locally
Secondary button  -> Sync to GitHub
Project menu      -> Export project bundle
Workspace menu    -> Connect offline workspace to GitHub
```

No automatic GitHub sync should happen while offline mode is active. The user must click `Sync to GitHub`.

## Offline To GitHub Sync

When the user connects an offline workspace to GitHub:

1. Ask for a repo or create a new workspace repo.
2. Build the normal Sketchflow repo structure.
3. Create `projects/projects-metadata.json`.
4. Commit each offline project folder in a batched initial commit.
5. Mark the offline workspace as connected.
6. Keep the local draft copy until the user confirms the GitHub snapshot is correct.

## Backend Routes To Add

```txt
GET  /api/workspaces/{workspaceId}/projects/{projectId}/history
GET  /api/workspaces/{workspaceId}/projects/{projectId}/history/{commitSha}
POST /api/workspaces/{workspaceId}/projects/{projectId}/restore
GET  /api/workspaces/{workspaceId}/repository
```

`history/{commitSha}` should support read-only previews. `restore` should accept:

```json
{
  "sourceCommitSha": "abc123...",
  "projectSlug": "day1",
  "expectedHeadSha": "def456..."
}
```

## Database Additions

Keep Postgres minimal:

```txt
sync_events.type = project_restore | project_history_preview | offline_sync
sync_events.metadata = { projectSlug, sourceCommitSha, restoredCommitSha }
workspaces.visibility = public | private
```

Do not store scene JSON, docs, exports, assets, or commit snapshots in Postgres.

## Implementation Order

1. Add repo privacy verification to workspace/project API responses.
2. Add project history API using commit path filtering.
3. Add read-only commit preview API.
4. Add project history panel and URL `view=history`.
5. Add project-only restore API using Git tree/commit/ref updates.
6. Add restore confirmation UI and conflict handling.
7. Add commit-pinned share/embed support with `?ref=`.
8. Add local draft sync pause.
9. Add pure offline workspace adapter.
10. Add offline-to-GitHub import flow.

## Non-Goals

- No repo-wide rollback.
- No Git force-push.
- No jsDelivr for private data.
- No Postgres snapshot storage.
- No automatic sync from pure offline mode.
