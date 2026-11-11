# Security Policy

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Report it privately through GitHub: open the [Security tab](https://github.com/playlikeboy/sketchflow/security/advisories/new) of this repository and choose "Report a vulnerability". Include what you found, how to reproduce it, and what an attacker could do with it.

You can expect an acknowledgement within 7 days. Once a fix is released, the advisory is published and you are credited unless you ask not to be.

## Scope

In scope:

- The application code in this repository and the hosted app at sketchflow.space.
- Anything that lets one user read or change another user's workspace, drafts or repository.
- Anything that makes the server write outside a workspace's `.sketchflow/` and `projects/` folders.
- Leaks of GitHub tokens or session credentials.

Out of scope:

- Content in a public repository being publicly readable. Public workspaces are public on GitHub by design.
- Vulnerabilities in GitHub, Stack Auth, Neon or Cloudflare themselves; report those to the vendor.
- Denial of service through volume alone.

## How Sketchflow handles credentials

- Sign-in and the GitHub connection are handled by Stack Auth. Sketchflow asks Stack Auth for a GitHub access token per request and does not store it.
- A user may instead paste a personal access token. It is kept in that browser's session storage, sent only to this app's own API over HTTPS, and never written to the database, logs or repository files.
- Postgres stores user ids, GitHub logins, workspace pointers and sync events. It holds no tokens and no sketch content.

## Supported versions

Only the latest commit on `main` is supported.
