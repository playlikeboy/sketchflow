import { defineConfig } from "drizzle-kit";
import { existsSync } from "node:fs";

for (const envFile of [".env.local", ".env"]) {
	if (existsSync(envFile)) {
		process.loadEnvFile(envFile);
	}
}

export default defineConfig({
	schema: "./src/server/db/schema.ts",
	out: "./drizzle",
	dialect: "postgresql",
	dbCredentials: {
		url: process.env.DATABASE_URL || "",
	},
	verbose: true,
	strict: true,
	migrations: {
		table: "__drizzle_migrations",
		schema: "public",
	},
});
