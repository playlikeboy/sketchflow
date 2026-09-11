"use client";

import { getOfflineCommits, clearOfflineCommits } from "@/lib/indexeddb";
import { commitWorkspaceFiles, createWorkspaceProject, syncWorkspaceProjectsMetadata } from "@/lib/api";

type QueuedAction =
	| {
			id: string;
			type: "commit";
			workspaceId: string;
			projectId: string;
			userId?: string;
			payload: {
				message: string;
				files: Array<{ path: string; content: string }>;
			};
			attempts: number;
			nextAttemptAt: number;
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
			attempts: number;
			nextAttemptAt: number;
	  }
	| {
			id: string;
			type: "sync_metadata";
			workspaceId: string;
			userId?: string;
			attempts: number;
			nextAttemptAt: number;
	  };

const SYNC_STORE = "sync-queue";
const PROCESSING_INTERVAL_MS = 2_000;
const MAX_ATTEMPTS = 10;
const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

type Listener = () => void;

let dbPromise: Promise<IDBDatabase> | null = null;
let processing = false;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<Listener>();

function generateId(type: string) {
	return `${type}:${Date.now()}:${Math.random().toString(36).slice(2, 9)}`;
}

function openSyncDb() {
	if (!dbPromise) {
		dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
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
	return dbPromise;
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
		request.onsuccess = () => resolve((request.result as QueuedAction[]) ?? []);
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
		const db = await openSyncDb();
		return new Promise<number>((resolve, reject) => {
			const transaction = db.transaction(SYNC_STORE, "readonly");
			const store = transaction.objectStore(SYNC_STORE);
			const request = store.count();
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
			transaction.oncomplete = () => db.close();
			transaction.onerror = () => {
				db.close();
				reject(transaction.error);
			};
		});
	} catch {
		return 0;
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
	} as QueuedAction;
	await persistAction(record);
	notify();
	return record;
}

function backoffDelay(attempts: number) {
	const delay = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * Math.pow(2, attempts));
	return delay + Math.random() * 500;
}

async function processCommit(action: QueuedAction & { type: "commit" }) {
	const response = await commitWorkspaceFiles({
		workspaceId: action.workspaceId,
		message: action.payload.message,
		files: action.payload.files,
	});

	try {
		const { deleteLocalProject, deleteDraft } = await import("@/lib/indexeddb");
		await deleteLocalProject(action.workspaceId, action.projectId, action.userId);
		const draftBase = action.userId
			? `sketch:${action.workspaceId}:${action.projectId}:system-map:${action.userId}`
			: `sketch:${action.workspaceId}:${action.projectId}`;
		await Promise.all([
			deleteDraft(draftBase),
			deleteDraft(`${draftBase}:notes`),
			deleteDraft(`${draftBase}:state`),
		]);
		await clearOfflineCommits(action.workspaceId, action.projectId);
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
		const ready = queue.filter((action) => action.nextAttemptAt <= now);

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
				const attempts = action.attempts + 1;
				if (attempts >= MAX_ATTEMPTS) {
					await removeAction(action.id);
					console.warn("[sync-manager] Dropping action after max attempts", action, error);
					notify();
					continue;
				}

				await persistAction({
					...action,
					attempts,
					nextAttemptAt: Date.now() + backoffDelay(attempts),
				});
				notify();
			}
		}
	} finally {
		processing = false;
	}
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
	const commits = await getOfflineCommits(workspaceId, projectId);
	for (const commit of commits) {
		await enqueue({
			type: "commit",
			workspaceId,
			projectId,
			payload: {
				message: commit.message,
				files: commit.files,
			},
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
