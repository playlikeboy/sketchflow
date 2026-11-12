# Changelog

Notable changes to Sketchflow. Dates are year-month-day.

## Unreleased

### Added
- **Local first, no account needed.** The whole app works signed out. Projects are saved in the browser under a "This device" workspace. Signing in with GitHub is optional and offers to copy those projects into a repository you choose. `/try` now opens the app.
- **Insert panel.** One place to add shape libraries, nine starter diagrams, pasted Mermaid, company logos, Unsplash photos, stickers and your own images. Everything lands centred at a consistent size.
- **Quick connect.** "+" handles on a selected shape add a connected shape.
- **Presentation mode.** Frames become slides.
- **GitHub sign-in through Better Auth.** One consent screen grants repository access; the session and token are kept in encrypted cookies, not in a database.
- **Conflict handling.** When a save finds the project changed on GitHub, you choose which version becomes the latest; the other stays available.
- **Survey Sheet design system.** New tokens, type, mark and components, documented in `DESIGN.md`, with product context in `PRODUCT.md`.
- **State marks and title blocks.** Five symbols say where work lives (synced, unsaved draft, local only, sync paused, sync failed), and every project shows its folder, branch and revision.
- **History as a scale bar**, with preview, restore and a share link pinned to a version.
- Rate limits on write routes, security headers, and a report-only Content-Security-Policy.
- Unit, API handler, smoke and browser tests, all run in CI.
- `SECURITY.md`, a self-hosting guide, and this changelog.

### Fixed
- The app no longer asks you to reconnect GitHub for problems that reconnecting cannot fix. Rate limits, a missing repository, blocked access and outages each get their own message, and only an expired sign-in asks you to sign in again.
- Library shapes are no longer added at unpredictable sizes, and opened libraries are remembered across sketches.
- Photos and other images keep their real colours on the dark canvas.

### Changed
- Connecting an existing repository never overwrites files already in it.
- Share and embed pages return a real 404 for bad links and respect each project's sharing setting.
- The health endpoint no longer touches the database or reports its clock by default.
- Browser storage is scoped per signed-in user, with an explicit scope for signed-out use.
- The default theme follows the system setting.
- The Templates page lists the four built-in starter templates.

### Fixed
- The background sync queue reused a closed browser database connection, so operations after the first failed.
- A repository's visibility change could reset the workspace's default branch to `main`.
- The offline loader looked for drafts under a key the editor never wrote.
- The editor briefly showed "Project not found" while a project was still loading.
- A conflicting save was reported as a GitHub connection problem.

### Security
- Mutating API routes reject cross-site requests.
- Branch names, project ids and file paths are validated before they reach the GitHub API, and restored files must stay inside their project folder.
- Deploy credentials in CI are visible only to the deploy steps.

### Removed
- The earlier borrowed visual identity, 35 unused UI components, an unused dashboard, and 12 unused dependencies.
