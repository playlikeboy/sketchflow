"use client";

import { getOfflineCommits, clearOfflineCommits } from "@/lib/indexeddb";
import { getActiveUserId } from "@/lib/github-token";
import { ApiError, commitWorkspaceFiles, createWorkspaceProject, syncWorkspaceProjectsMetadata } from "@/lib/api";
import {
	githubErrorCopy,
	githubProblemFromError,
	isTransientGithubError,
	needsGithubReconnect,
	pickGithubProblem,
	type GithubErrorCode,
	type GithubProblem,
} from "@/lib/github-errors";

/** How the last attempt went. The GitHub fields are set only when GitHub was the reason. */
type AttemptState = {
	attempts: number;
	nextAttemptAt: number;
	status?: "pending" | "failed";
	lastError?: string;
	lastErrorCode?: GithubErrorCode;
	lastRetryAt?: string;
	failedAt?: number;
};

type QueuedAction = AttemptState &
	(
		| {
				id: string;
				type: "commit";
				workspaceId: string;
				projectId: string;
				userId?: string;
				payload: {
					message: string;
					files: Array<{ path: string; content: string }>;
					expectedHeadSha?: string | null;
				};
		  }
		| {
				id: string;
				type: "create_project";
				workspaceId: string;
				userId?: string;
				payload: {
					title: string;
					description?: string;
					projectId?: string;
					sketchId?: string;
					visibility?: "private" | "public";
				};
		  }
		| {
				id: string;
				type: "sync_metadata";
				workspaceId: string;
				userId?: string;
		  }
	);

const SYNC_STORE = "sync-queue";
const PROCESSING_INTERVAL_MS = 2_000;
const MAX_ATTEMPTS = 10;
const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
// A rate limit or a GitHub outage clears by itself, so those saves wait far longer (hours,
// not minutes) before they are set aside as failed.
const TRANSIENT_MAX_ATTEMPTS = 40;
const TRANSIENT_MAX_BACKOFF_MS = 5 * 60_000;
const RETRY_JITTER_MS = 500;
const STATUS_UNAUTHORIZED = 401;

type Listener = () => void;

let processing = false;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<Listener>();

function generateId(type: string) {
	return type + ":" + Date.now() + ":" + (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2));
}

// Every caller closes the connection when its transaction finishes, so each operation opens
// its own. Caching the connection here made every call after the first fail with
// "The database connection is closing".
function openSyncDb() {
	return new Promise<IDBDatabase>((resolve, reject) => {
		const request = indexedDB.open("sketchflow-sync", 1);
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(SYNC_STORE)) {
				db.createObjectStore(SYNC_STORE, { keyPath: "id" });
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

async function withStore<T>(
	mode: IDBTransactionMode,
	callback: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
	const db = await openSyncDb();
	return new Promise<T>((resolve, reject) => {
		const transaction = db.transaction(SYNC_STORE, mode);
		const store = transaction.objectStore(SYNC_STORE);
		const request = callback(store);
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
		transaction.oncomplete = () => db.close();
		transaction.onerror = () => {
			db.close();
			reject(transaction.error);
		};
	});
}

async function loadQueue(): Promise<QueuedAction[]> {
	const db = await openSyncDb();
	return new Promise<QueuedAction[]>((resolve, reject) => {
		const transaction = db.transaction(SYNC_STORE, "readonly");
		const store = transaction.objectStore(SYNC_STORE);
		const request = store.getAll();
		request.onsuccess = () => {
			const records = (request.result as QueuedAction[]) ?? [];
			resolve(records.map((action) => ({ ...action, status: action.status ?? "pending" })));
		};
		request.onerror = () => reject(request.error);
		transaction.oncomplete = () => db.close();
		transaction.onerror = () => {
			db.close();
			reject(transaction.error);
		};
	});
}

async function persistAction(action: QueuedAction) {
	await withStore("readwrite", (store) => store.put(action));
}

async function removeAction(id: string) {
	await withStore("readwrite", (store) => store.delete(id));
}

function notify() {
	for (const listener of listeners) {
		try {
			listener();
		} catch {
			// no-op
		}
	}
}

export function onSyncQueueChange(listener: Listener) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export async function getSyncQueueLength(): Promise<number> {
	try {
		const queue = await loadQueue();
		return queue.filter((action) => action.status !== "failed").length;
	} catch {
		return 0;
	}
}

export async function getSyncFailureCount(): Promise<number> {
	try {
		const userId = getActiveUserId();
		const queue = await loadQueue();
		return queue.filter((action) => action.status === "failed" && Boolean(userId) && action.userId === userId).length;
	} catch {
		return 0;
	}
}

/**
 * The GitHub problem holding up this user's queued saves, or null when there is none. A
 * problem that needs signing in again is reported ahead of one that will clear by itself.
 */
export async function getSyncGithubProblem(userId = getActiveUserId()): Promise<GithubProblem | null> {
	if (!userId) return null;

	try {
		const queue = await loadQueue();
		return pickGithubProblem(
			queue
				.filter((action) => action.userId === userId)
				.map((action) => (action.lastErrorCode ? { code: action.lastErrorCode, retryAt: action.lastRetryAt } : null)),
		);
	} catch {
		return null;
	}
}

async function enqueue(action: {
	type: QueuedAction["type"];
	workspaceId?: string;
	projectId?: string;
	userId?: string;
	payload?: any;
}) {
	const record: QueuedAction = {
		id: generateId(action.type),
		type: action.type as any,
		workspaceId: action.workspaceId ?? "",
		projectId: action.projectId ?? "",
		userId: action.userId,
		payload: action.payload ?? { message: "", files: [] },
		attempts: 0,
		nextAttemptAt: Date.now(),
		status: "pending",
	} as QueuedAction;
	await persistAction(record);
	notify();
	return record;
}

function backoffDelay(attempts: number, maxBackoffMs: number) {
	return Math.min(maxBackoffMs, BASE_BACKOFF_MS * Math.pow(2, attempts));
}

export type SyncFailurePlan = { outcome: "retry"; delayMs: number } | { outcome: "failed" };

/**
 * Decides what happens to a queued action after a failed attempt (`attempts` counts that one).
 *   - GitHub needs a fresh sign-in, or the Sketchflow session is gone: stop now. No number of
 *     retries will fix it, and the user has to act.
 *   - Rate limited or GitHub unavailable: keep retrying with a long backoff, never sooner
 *     than the time GitHub asked us to wait.
 *   - Anything else: the usual short backoff, then give up.
 */
export function planSyncFailure(input: {
	problem: GithubProblem | null;
	sessionExpired?: boolean;
	attempts: number;
	now: number;
}): SyncFailurePlan {
	const { problem, attempts, now } = input;

	if (input.sessionExpired || (problem && needsGithubReconnect(problem.code))) {
		return { outcome: "failed" };
	}

	if (problem && isTransientGithubError(problem.code)) {
		if (attempts >= TRANSIENT_MAX_ATTEMPTS) return { outcome: "failed" };

		const untilRetryAt = problem.retryAt ? Date.parse(problem.retryAt) - now : 0;
		const backoff = backoffDelay(attempts, TRANSIENT_MAX_BACKOFF_MS);
		return { outcome: "retry", delayMs: Math.max(backoff, Number.isNaN(untilRetryAt) ? 0 : untilRetryAt) };
	}

	if (attempts >= MAX_ATTEMPTS) return { outcome: "failed" };
	return { outcome: "retry", delayMs: backoffDelay(attempts, MAX_BACKOFF_MS) };
}

function failureMessage(error: unknown, problem: GithubProblem | null) {
	if (problem) return githubErrorCopy(problem.code, { retryAt: problem.retryAt }).message;
	return error instanceof Error ? error.message : "Sync failed";
}

/** Stores the outcome of a failed attempt: either the next retry time or a preserved failure. */
async function recordFailure(action: QueuedAction, error: unknown) {
	const attempts = action.attempts + 1;
	const problem = githubProblemFromError(error);
	const plan = planSyncFailure({
		problem,
		sessionExpired: error instanceof ApiError && error.status === STATUS_UNAUTHORIZED,
		attempts,
		now: Date.now(),
	});
	const attempted: QueuedAction = {
		...action,
		attempts,
		lastError: failureMessage(error, problem),
		lastErrorCode: problem?.code,
		lastRetryAt: problem?.retryAt,
	};

	if (plan.outcome === "failed") {
		await persistAction({ ...attempted, status: "failed", failedAt: Date.now(), nextAttemptAt: Number.MAX_SAFE_INTEGER });
		console.warn("[sync-manager] Preserving failed action for recovery", action.id, error);
	} else {
		const nextAttemptAt = Date.now() + plan.delayMs + Math.random() * RETRY_JITTER_MS;
		await persistAction({ ...attempted, status: "pending", nextAttemptAt });
	}

	notify();
}

async function processCommit(action: QueuedAction & { type: "commit" }) {
	const response = await commitWorkspaceFiles({
		workspaceId: action.workspaceId,
		message: action.payload.message,
		files: action.payload.files,
		expectedHeadSha: action.payload.expectedHeadSha,
	});

	try {
		const { deleteLocalProject } = await import("@/lib/indexeddb");
		await deleteLocalProject(action.workspaceId, action.projectId, action.userId);
		// Drafts are left in place: the user may have kept editing after this commit was queued,
		// and the editor clears its own drafts once it has synced them.
		await clearOfflineCommits(action.workspaceId, action.projectId, action.userId);
	} catch {
		// best-effort cleanup
	}

	return response;
}

async function processCreateProject(action: QueuedAction & { type: "create_project" }) {
	const response = await createWorkspaceProject({
		workspaceId: action.workspaceId,
		...action.payload,
	});
	try {
		const { deleteLocalProject } = await import("@/lib/indexeddb");
		if (action.payload.projectId) {
			await deleteLocalProject(action.workspaceId, action.payload.projectId, action.userId);
		}
	} catch {
		// best-effort cleanup
	}
	return response;
}

async function processSyncMetadata(action: QueuedAction & { type: "sync_metadata" }) {
	const response = await syncWorkspaceProjectsMetadata(action.workspaceId);
	return response;
}

async function drainQueue(force = false) {
	if (processing) return;
	if (typeof navigator !== "undefined" && !navigator.onLine) return;

	try {
		const { getOfflineModeSetting } = await import("@/lib/indexeddb");
		const offlineMode = await getOfflineModeSetting();
		if (offlineMode && !force) return;
	} catch {
		// ignore
	}

	processing = true;
	try {
		const queue = await loadQueue();
		const now = Date.now();
		const activeUserId = getActiveUserId();
		const ready = queue.filter(
			(action) =>
				action.status !== "failed" &&
				action.nextAttemptAt <= now &&
				Boolean(activeUserId) &&
				action.userId === activeUserId,
		);

		for (const action of ready) {
			try {
				if (action.type === "commit") {
					await processCommit(action as QueuedAction & { type: "commit" });
				} else if (action.type === "create_project") {
					await processCreateProject(action as QueuedAction & { type: "create_project" });
				} else {
					await processSyncMetadata(action as QueuedAction & { type: "sync_metadata" });
				}

				await removeAction(action.id);
				notify();
			} catch (error) {
				await recordFailure(action, error);
			}
		}
	} finally {
		processing = false;
	}
}

export async function retryFailedSyncActions(userId = getActiveUserId()) {
	if (!userId) return;
	const queue = await loadQueue();
	for (const action of queue) {
		if (action.userId === userId && action.status === "failed") {
			await persistAction({
				...action,
				attempts: 0,
				status: "pending",
				lastError: undefined,
				lastErrorCode: undefined,
				lastRetryAt: undefined,
				failedAt: undefined,
				nextAttemptAt: Date.now(),
			});
		}
	}
	notify();
	await drainQueue(true);
}

export async function clearSyncQueueForUser(userId: string) {
	if (!userId) return;
	const queue = await loadQueue();
	for (const action of queue) {
		if (action.userId === userId) await removeAction(action.id);
	}
	notify();
}

export async function queueCommit(
	workspaceId: string,
	projectId: string,
	payload: {
		message: string;
		files: Array<{ path: string; content: string }>;
	},
	userId?: string,
) {
	await enqueue({ type: "commit", workspaceId, projectId, payload, userId });
	await drainQueue();
}

export async function queueCreateProject(
	workspaceId: string,
	payload: {
		title: string;
		description?: string;
		projectId?: string;
		sketchId?: string;
		visibility?: "private" | "public";
	},
	userId?: string,
) {
	await enqueue({ type: "create_project", workspaceId, payload, userId });
	await drainQueue();
}

export async function queueSyncMetadata(workspaceId: string, userId?: string) {
	await enqueue({ type: "sync_metadata", workspaceId, userId });
	await drainQueue();
}

export async function processOfflineCommitsNow(workspaceId: string, projectId: string) {
	const commits = await getOfflineCommits(workspaceId, projectId, getActiveUserId());
	for (const commit of commits) {
		await enqueue({
			type: "commit",
			workspaceId,
			projectId,
			payload: {
				message: commit.message,
				files: commit.files,
				expectedHeadSha: commit.baseCommitSha,
			},
			userId: getActiveUserId() ?? undefined,
		});
	}
}

export function startSyncManager() {
	if (typeof window === "undefined") return;
	if (timer) return;

	drainQueue();

	timer = setInterval(() => {
		drainQueue();
	}, PROCESSING_INTERVAL_MS);

	window.addEventListener("online", () => {
		drainQueue();
	});
}

export function stopSyncManager() {
	if (timer) {
		clearInterval(timer);
		timer = null;
	}
}

export async function triggerSyncNow() {
	await drainQueue(true);
}
