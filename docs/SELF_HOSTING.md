# Self-hosting Sketchflow on Cloudflare

Sketchflow runs as a single Cloudflare Worker built with [OpenNext](https://opennext.js.org/cloudflare). This guide follows what the repository's own deploy workflow does (`.github/workflows/deploy.yml`).

> This guide was written from the repository's configuration. It has not been verified end to end against a fresh Cloudflare account, so treat the first deploy as a test and check the Worker's logs.

## What you need

| Service | Used for | Notes |
| --- | --- | --- |
| Cloudflare account | Hosting the Worker | Workers with a custom domain or a `workers.dev` address |
| [GitHub OAuth App](https://github.com/settings/developers) | Sign-in and repository access | Callback URL `https://<your-domain>/api/auth/callback/github`; Sketchflow requests `repo`, `read:user`, `user:email` at sign-in |
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
| `NEXT_PUBLIC_APP_URL` | yes | The URL you will serve from, for example `https://draw.example.com` |
| `BETTER_AUTH_SECRET` | **secret** | Random value that encrypts session cookies: `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | no | Public origin, if it differs from `NEXT_PUBLIC_APP_URL` |
| `GITHUB_CLIENT_ID` | no | Client id of your GitHub OAuth App |
| `GITHUB_CLIENT_SECRET` | **secret** | Client secret of your GitHub OAuth App |
| `DATABASE_URL` | **secret** | Neon connection string |
| `UNSPLASH_ACCESS_KEY` | **secret**, optional | Unsplash Access Key. Enables photo search in the Insert panel; without it that tab says it is not set up |
| `GITHUB_API_VERSION` | no | `2022-11-28` |
| `GITHUB_OAUTH_SCOPES` | no | `repo,read:user,user:email` |
| `SKETCHFLOW_REPO_NAME` | no | Default name for new workspace repositories |
| `SKETCHFLOW_DEFAULT_BRANCH` | no | `main` |

Create a GitHub OAuth App at <https://github.com/settings/developers> with the authorization callback URL `https://<your-domain>/api/auth/callback/github`. Sign-in asks for the scopes in `GITHUB_OAUTH_SCOPES` once, on GitHub's consent screen.

`NEXT_PUBLIC_*` values are compiled into the client bundle, so they must be present when you build. Give the Worker its runtime values with Wrangler so secrets are never written to a file:

```bash
bunx wrangler secret put BETTER_AUTH_SECRET
bunx wrangler secret put GITHUB_CLIENT_ID
bunx wrangler secret put GITHUB_CLIENT_SECRET
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
