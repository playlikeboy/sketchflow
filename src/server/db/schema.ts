import { sql } from "drizzle-orm";
import { check, foreignKey, index, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

const timestamptz = (name: string) => timestamp(name, { mode: "string", withTimezone: true });

export const sketchflowUsers = pgTable("sketchflow_users", {
	stackUserId: text("stack_user_id").primaryKey(),
	email: text("email"),
	displayName: text("display_name"),
	avatarUrl: text("avatar_url"),
	createdAt: timestamptz("created_at").notNull().defaultNow(),
	updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

export const sketchflowGithubConnections = pgTable(
	"sketchflow_github_connections",
	{
		id: text("id").primaryKey(),
		stackUserId: text("stack_user_id").notNull(),
		githubLogin: text("github_login").notNull(),
		githubUserId: text("github_user_id"),
		scopes: text("scopes").array().notNull(),
		connectedAt: timestamptz("connected_at").notNull().defaultNow(),
		updatedAt: timestamptz("updated_at").notNull().defaultNow(),
	},
	(table) => [
		foreignKey({
			name: "sketchflow_github_connections_stack_user_id_fkey",
			columns: [table.stackUserId],
			foreignColumns: [sketchflowUsers.stackUserId],
		}).onDelete("cascade"),
		unique("sketchflow_github_connections_stack_user_id_github_login_key").on(table.stackUserId, table.githubLogin),
	],
);

export const sketchflowWorkspaces = pgTable(
	"sketchflow_workspaces",
	{
		id: text("id").primaryKey(),
		stackUserId: text("stack_user_id").notNull(),
		repoOwner: text("repo_owner").notNull(),
		repoName: text("repo_name").notNull(),
		defaultBranch: text("default_branch").notNull().default("main"),
		visibility: text("visibility", { enum: ["private", "public"] }).notNull().default("public"),
		latestCommitSha: text("latest_commit_sha"),
		createdAt: timestamptz("created_at").notNull().defaultNow(),
		updatedAt: timestamptz("updated_at").notNull().defaultNow(),
	},
	(table) => [
		foreignKey({
			name: "sketchflow_workspaces_stack_user_id_fkey",
			columns: [table.stackUserId],
			foreignColumns: [sketchflowUsers.stackUserId],
		}).onDelete("cascade"),
		unique("sketchflow_workspaces_stack_user_id_repo_owner_repo_name_key").on(
			table.stackUserId,
			table.repoOwner,
			table.repoName,
		),
		check("sketchflow_workspaces_visibility_check", sql`${table.visibility} in ('private', 'public')`),
		index("sketchflow_workspaces_user_updated_idx").on(table.stackUserId, table.updatedAt.desc().nullsFirst()),
	],
);

export const sketchflowBillingCustomers = pgTable("sketchflow_billing_customers", {
	stackUserId: text("stack_user_id").primaryKey(),
	provider: text("provider").notNull().default("dodo"),
	providerCustomerId: text("provider_customer_id"),
	plan: text("plan").notNull().default("free"),
	subscriptionStatus: text("subscription_status").notNull().default("inactive"),
	currentPeriodEnd: timestamptz("current_period_end"),
	createdAt: timestamptz("created_at").notNull().defaultNow(),
	updatedAt: timestamptz("updated_at").notNull().defaultNow(),
}, (table) => [
	foreignKey({
		name: "sketchflow_billing_customers_stack_user_id_fkey",
		columns: [table.stackUserId],
		foreignColumns: [sketchflowUsers.stackUserId],
	}).onDelete("cascade"),
]);

export const sketchflowSyncEvents = pgTable(
	"sketchflow_sync_events",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id").notNull(),
		stackUserId: text("stack_user_id").notNull(),
		eventType: text("event_type").notNull(),
		commitSha: text("commit_sha"),
		message: text("message"),
		metadata: jsonb("metadata")
			.$type<Record<string, unknown>>()
			.notNull()
			.default(sql`'{}'::jsonb`),
		createdAt: timestamptz("created_at").notNull().defaultNow(),
	},
	(table) => [
		foreignKey({
			name: "sketchflow_sync_events_workspace_id_fkey",
			columns: [table.workspaceId],
			foreignColumns: [sketchflowWorkspaces.id],
		}).onDelete("cascade"),
		foreignKey({
			name: "sketchflow_sync_events_stack_user_id_fkey",
			columns: [table.stackUserId],
			foreignColumns: [sketchflowUsers.stackUserId],
		}).onDelete("cascade"),
		index("sketchflow_sync_events_workspace_created_idx").on(table.workspaceId, table.createdAt.desc().nullsFirst()),
	],
);

export type WorkspaceRow = typeof sketchflowWorkspaces.$inferSelect;
