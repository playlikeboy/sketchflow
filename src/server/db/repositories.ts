import { and, desc, eq, sql } from "drizzle-orm";

import type { SketchflowUser } from "@/server/auth";
import { getDb } from "@/server/db/client";
import {
	sketchflowGithubConnections,
	sketchflowSyncEvents,
	sketchflowUsers,
	sketchflowWorkspaces,
	type WorkspaceRow,
} from "@/server/db/schema";

export type WorkspaceVisibility = "private" | "public";

export type WorkspaceRecord = {
	id: string;
	stackUserId: string;
	repoOwner: string;
	repoName: string;
	defaultBranch: string;
	visibility: WorkspaceVisibility;
	latestCommitSha: string | null;
	createdAt: string;
	updatedAt: string;
};

export type WorkspaceInput = {
	repoOwner: string;
	repoName: string;
	defaultBranch?: string;
	visibility?: WorkspaceVisibility;
	latestCommitSha?: string | null;
};

export type SyncEventInput = {
	workspaceId: string;
	stackUserId: string;
	eventType: string;
	commitSha?: string | null;
	message?: string | null;
	metadata?: Record<string, unknown>;
};

export type GithubConnectionInput = {
	githubLogin: string;
	githubUserId: string;
	scopes: string[];
};

function mapWorkspace(row: WorkspaceRow): WorkspaceRecord {
	return {
		id: row.id,
		stackUserId: row.stackUserId,
		repoOwner: row.repoOwner,
		repoName: row.repoName,
		defaultBranch: row.defaultBranch,
		visibility: row.visibility,
		latestCommitSha: row.latestCommitSha,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

export async function upsertUser(user: SketchflowUser) {
	const db = getDb();

	await db
		.insert(sketchflowUsers)
		.values({
			stackUserId: user.id,
			email: user.primaryEmail,
			displayName: user.displayName,
			avatarUrl: user.profileImageUrl,
			updatedAt: sql`now()`,
		})
		.onConflictDoUpdate({
			target: sketchflowUsers.stackUserId,
			set: {
				email: user.primaryEmail,
				displayName: user.displayName,
				avatarUrl: user.profileImageUrl,
				updatedAt: sql`now()`,
			},
		});
}

export async function upsertGithubConnection(stackUserId: string, input: GithubConnectionInput) {
	const db = getDb();

	await db
		.insert(sketchflowGithubConnections)
		.values({
			id: crypto.randomUUID(),
			stackUserId,
			githubLogin: input.githubLogin,
			githubUserId: input.githubUserId,
			scopes: input.scopes,
			updatedAt: sql`now()`,
		})
		.onConflictDoUpdate({
			target: [sketchflowGithubConnections.stackUserId, sketchflowGithubConnections.githubLogin],
			set: {
				githubUserId: input.githubUserId,
				scopes: input.scopes,
				updatedAt: sql`now()`,
			},
		});
}

export async function listWorkspaces(stackUserId: string) {
	const db = getDb();
	const rows = await db
		.select()
		.from(sketchflowWorkspaces)
		.where(eq(sketchflowWorkspaces.stackUserId, stackUserId))
		.orderBy(desc(sketchflowWorkspaces.updatedAt));

	return rows.map(mapWorkspace);
}

export async function getWorkspace(stackUserId: string, workspaceId: string) {
	const db = getDb();
	const [row] = await db
		.select()
		.from(sketchflowWorkspaces)
		.where(and(eq(sketchflowWorkspaces.stackUserId, stackUserId), eq(sketchflowWorkspaces.id, workspaceId)))
		.limit(1);

	return row ? mapWorkspace(row) : null;
}

export async function upsertWorkspace(stackUserId: string, input: WorkspaceInput) {
	const db = getDb();
	const workspaceId = crypto.randomUUID();
	const defaultBranch = input.defaultBranch || "main";
	const visibility = input.visibility || "public";

	const [row] = await db
		.insert(sketchflowWorkspaces)
		.values({
			id: workspaceId,
			stackUserId,
			repoOwner: input.repoOwner,
			repoName: input.repoName,
			defaultBranch,
			visibility,
			latestCommitSha: input.latestCommitSha ?? null,
			updatedAt: sql`now()`,
		})
		.onConflictDoUpdate({
			target: [sketchflowWorkspaces.stackUserId, sketchflowWorkspaces.repoOwner, sketchflowWorkspaces.repoName],
			set: {
				defaultBranch,
				visibility,
				latestCommitSha: input.latestCommitSha ? input.latestCommitSha : sql`sketchflow_workspaces.latest_commit_sha`,
				updatedAt: sql`now()`,
			},
		})
		.returning();

	return mapWorkspace(row);
}

export async function updateWorkspaceCommit(workspaceId: string, commitSha: string) {
	const db = getDb();

	await db
		.update(sketchflowWorkspaces)
		.set({
			latestCommitSha: commitSha,
			updatedAt: sql`now()`,
		})
		.where(eq(sketchflowWorkspaces.id, workspaceId));
}

export async function recordSyncEvent(input: SyncEventInput) {
	const db = getDb();

	await db.insert(sketchflowSyncEvents).values({
		id: crypto.randomUUID(),
		workspaceId: input.workspaceId,
		stackUserId: input.stackUserId,
		eventType: input.eventType,
		commitSha: input.commitSha ?? null,
		message: input.message ?? null,
		metadata: input.metadata ?? {},
	});
}
