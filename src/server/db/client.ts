import { neon } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";

import { getRequiredEnv } from "@/server/env";
import * as schema from "@/server/db/schema";

let dbClient: NeonHttpDatabase<typeof schema> | null = null;

export function getDb() {
	if (!dbClient) {
		const sqlClient = neon(getRequiredEnv("DATABASE_URL"));
		dbClient = drizzle(sqlClient, { schema });
	}

	return dbClient;
}

export async function pingDatabase() {
	const db = getDb();
	const result = await db.execute<{ now: string }>(sql`select now() as now`);
	const [row] = result.rows;
	return row;
}
