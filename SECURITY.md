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
- Vulnerabilities in GitHub, Better Auth, Neon or Cloudflare themselves; report those to the vendor.
- Denial of service through volume alone.

## How Sketchflow handles credentials

- Sign-in is GitHub OAuth, handled by Better Auth running inside this app with no auth database. The session and the GitHub access token are held in encrypted, HttpOnly, `Secure`, `SameSite=Lax` cookies in the user's browser and are decrypted per request. Sketchflow does not store the token anywhere else.
- Sessions are stateless and expire after 30 days. Signing out clears the cookies. A copied cookie cannot be revoked individually: the user can revoke Sketchflow under GitHub's authorized OAuth apps, which invalidates the token, and an operator can rotate `BETTER_AUTH_SECRET`, which ends every session.
- A user may instead paste a personal access token. It is kept in that browser's session storage, sent only to this app's own API over HTTPS, and never written to the database, logs or repository files.
- Postgres stores user ids, GitHub logins, workspace pointers and sync events. It holds no tokens and no sketch content.

## Supported versions

Only the latest commit on `main` is supported.
