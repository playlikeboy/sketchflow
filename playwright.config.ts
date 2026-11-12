import { defineConfig } from "@playwright/test";

const PORT = 3210;

/**
 * Browser tests run against a production build with every /api call answered by fixtures
 * (see e2e/fixtures.ts), so they need no GitHub account, auth project or database.
 * Build first: `bun run build`, then `bun run test:e2e`.
 */
export default defineConfig({
	testDir: "./e2e",
	testMatch: "**/*.e2e.ts",
	fullyParallel: true,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? "github" : "list",
	timeout: 45_000,
	use: {
		baseURL: `http://localhost:${PORT}`,
		serviceWorkers: "block",
		trace: "off",
		launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
	},
	webServer: {
		command: `bunx next start -p ${PORT}`,
		url: `http://localhost:${PORT}/help`,
		reuseExistingServer: !process.env.CI,
		timeout: 60_000,
	},
});
