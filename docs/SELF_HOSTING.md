# Self-hosting Sketchflow on Cloudflare

Sketchflow runs as a single Cloudflare Worker built with [OpenNext](https://opennext.js.org/cloudflare). This guide follows what the repository's own deploy workflow does (`.github/workflows/deploy.yml`).

> This guide was written from the repository's configuration. It has not been verified end to end against a fresh Cloudflare account, so treat the first deploy as a test and check the Worker's logs.

## What you need

| Service | Used for | Notes |
| --- | --- | --- |
| Cloudflare account | Hosting the Worker | Workers with a custom domain or a `workers.dev` address |
| [Stack Auth](https://stack-auth.com) project | Sign-in and the GitHub connection | Enable the GitHub provider with your own OAuth app and the `repo`, `read:user`, `user:email` scopes |
| [Neon](https://neon.tech) Postgres | Accounts, workspace pointers, sync events | The free tier is enough; no sketch content is stored here |
| Bun | Building | The version pinned in the workflows |

## 1. Configure the Worker

Edit `wrangler.jsonc`:

- Change `name`, and the `services[0].service` self-reference to match it.
- Replace the `route` block with your own domain, or remove it to use `workers.dev`.

## 2. Set the environment

These are the same names the deploy workflow checks for.

| Variable | Public? | Value |
| --- | --- | --- |
| `NEXT_PUBLIC_STACK_PROJECT_ID` | yes | Stack Auth project id (a UUID) |
| `NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY` | yes | Stack Auth client key |
| `NEXT_PUBLIC_APP_URL` | yes | The URL you will serve from, for example `https://draw.example.com` |
| `STACK_SECRET_SERVER_KEY` | **secret** | Stack Auth server key |
| `DATABASE_URL` | **secret** | Neon connection string |
| `GITHUB_API_VERSION` | no | `2022-11-28` |
| `GITHUB_OAUTH_SCOPES` | no | `repo,read:user,user:email` |
| `SKETCHFLOW_REPO_NAME` | no | Default name for new workspace repositories |
| `SKETCHFLOW_DEFAULT_BRANCH` | no | `main` |

`NEXT_PUBLIC_*` values are compiled into the client bundle, so they must be present when you build. Give the Worker the two secrets with Wrangler so they are never written to a file:

```bash
bunx wrangler secret put STACK_SECRET_SERVER_KEY
```

```bash
bunx wrangler secret put DATABASE_URL
```

Never commit `.env*` or `.dev.vars` files.

## 3. Create the database tables

With `DATABASE_URL` set in your shell:

```bash
bun run db:push
```

## 4. Build and deploy

```bash
bun install --frozen-lockfile
```

```bash
bun run deploy
```

`deploy` runs the OpenNext build and then `wrangler deploy`. You need `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the environment, or an interactive `wrangler login`.

## 5. Check it

```bash
node scripts/smoke.mjs https://draw.example.com
```

The smoke test checks that pages render, that the security headers are present, that the API requires sign-in, and that cross-site writes are refused. Then sign in, connect GitHub, and create a workspace.

## Deploying from GitHub Actions

Add every variable above, plus `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, as repository secrets. The workflow names three of them with a prefix: `SKETCHFLOW_GITHUB_API_VERSION` and `SKETCHFLOW_GITHUB_OAUTH_SCOPES`. Pushing to `main` then deploys.

## Things to know

- **Rate limits are per Worker instance.** They stop bursts, not sustained abuse. Add a Cloudflare rate limiting rule in front of `/api/` for anything public.
- **The Content-Security-Policy is report-only.** Watch the browser console on your deployment before enforcing it in `next.config.ts`.
- **Share pages read GitHub without a token**, so they are subject to GitHub's unauthenticated rate limit for your Worker's outbound address.
