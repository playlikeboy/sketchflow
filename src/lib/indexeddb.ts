import {
	legacyUnscopedKey,
	localProjectsKey,
	offlineCommitsKey,
	projectDraftPrefix,
	projectsCacheKey,
	scopePrefixes,
	workspacesKey,
} from "@/lib/storage-keys";

const DB_NAME = "sketchflow";
const DB_VERSION = 1;
const STORE_NAME = "drafts";

export type DraftRecord<T> = {
	key: string;
	value: T;
	updatedAt: string;
};

let openConnection: Promise<IDBDatabase> | null = null;

/**
 * One connection, opened on first use and kept for the life of the page. Opening a database
 * takes several event-loop turns, which a closing page does not have: with a connection already
 * open, a save issued while the tab is being hidden or reloaded still reaches the disk. It also
 * makes every autosave cheaper. Nothing closes it except the browser.
 */
function openSketchflowDb() {
	openConnection ??= new Promise<IDBDatabase>((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);

		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME, { keyPath: "key" });
			}
		};

		request.onsuccess = () => {
			const db = request.result;
			// Another tab is upgrading the database, or the browser closed it: let go, and the
			// next operation opens a fresh connection.
			db.onversionchange = () => {
				db.close();
				openConnection = null;
			};
			db.onclose = () => {
				openConnection = null;
			};
			resolve(db);
		};
		request.onerror = () => {
			openConnection = null;
			reject(request.error);
		};
	});

	return openConnection;
}

async function withDraftStore<T>(mode: IDBTransactionMode, callback: (store: IDBObjectStore) => IDBRequest<T>) {
	const db = await openSketchflowDb();

	return new Promise<T>((resolve, reject) => {
		const transaction = db.transaction(STORE_NAME, mode);
		const store = transaction.objectStore(STORE_NAME);
		const request = callback(store);
		// Ask for the write to be committed now instead of after the request's callback has run.
		// A page that is being reloaded or closed never runs that callback, and the browser then
		// throws the write away; committed here, it survives.
		if (mode === "readwrite" && typeof transaction.commit === "function") {
			transaction.commit();
		}

		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
		transaction.onerror = () => reject(transaction.error);
	});
}

export async function getDraft<T>(key: string) {
	if (typeof indexedDB === "undefined") {
		return null;
	}

	const record = await withDraftStore<DraftRecord<T> | undefined>("readonly", (store) => store.get(key));
	if (record) {
		return record;
	}

	// One-time move of signed-out data written by older builds under unscoped keys.
	const legacyKey = legacyUnscopedKey(key);
	if (!legacyKey) {
		return null;
	}

	const legacy = await withDraftStore<DraftRecord<T> | undefined>("readonly", (store) => store.get(legacyKey));
	if (!legacy) {
		return null;
	}

	const migrated: DraftRecord<T> = { ...legacy, key };
	await withDraftStore<IDBValidKey>("readwrite", (store) => store.put(migrated));
	await withDraftStore<undefined>("readwrite", (store) => store.delete(legacyKey));
	return migrated;
}

export async function setDraft<T>(key: string, value: T) {
	if (typeof indexedDB === "undefined") {
		return null;
	}

	const record: DraftRecord<T> = {
		key,
		value,
		updatedAt: new Date().toISOString(),
	};

	await withDraftStore<IDBValidKey>("readwrite", (store) => store.put(record));
	return record;
}

export async function deleteDraft(key: string) {
	if (typeof indexedDB === "undefined") {
		return;
	}

	await withDraftStore<undefined>("readwrite", (store) => store.delete(key));
}

export async function getLocalProjects(workspaceId: string, userId?: string | null): Promise<any[]> {
	const key = localProjectsKey(workspaceId, userId);
	const result = await getDraft<any[]>(key);
	return result?.value ?? [];
}

export async function saveLocalProject(workspaceId: string, project: any, userId?: string | null) {
	const existing = await getLocalProjects(workspaceId, userId);
	const updated = [project, ...existing.filter((p: any) => p.id !== project.id)];
	await setDraft(localProjectsKey(workspaceId, userId), updated);
}

export async function deleteLocalProject(workspaceId: string, projectId: string, userId?: string | null) {
	const existing = await getLocalProjects(workspaceId, userId);
	const updated = existing.filter((p: any) => p.id !== projectId);
	await setDraft(localProjectsKey(workspaceId, userId), updated);
}

export async function getOfflineWorkspaces(userId?: string | null): Promise<any[]> {
	const result = await getDraft<any[]>(workspacesKey(userId));
	return result?.value ?? [];
}

export async function saveOfflineWorkspaces(workspaces: any[], userId?: string | null) {
	await setDraft(workspacesKey(userId), workspaces);
}

export async function getOfflineProjectsCache(workspaceId: string, userId?: string | null): Promise<any[]> {
	const result = await getDraft<any[]>(projectsCacheKey(workspaceId, userId));
	return result?.value ?? [];
}

export async function saveOfflineProjectsCache(workspaceId: string, projects: any[], userId?: string | null) {
	await setDraft(projectsCacheKey(workspaceId, userId), projects);
}

export async function getOfflineModeSetting(): Promise<boolean> {
	const result = await getDraft<boolean>("settings:offline-mode");
	return result?.value === true;
}

export async function setOfflineModeSetting(enabled: boolean) {
	await setDraft("settings:offline-mode", enabled);
}

export async function hasAnyLocalProjects(userId?: string | null): Promise<boolean> {
	if (typeof indexedDB === "undefined") {
		return false;
	}
	try {
		const db = await openSketchflowDb();
		const prefix = localProjectsKey("", userId);
		return new Promise<boolean>((resolve, reject) => {
			const transaction = db.transaction(STORE_NAME, "readonly");
			const store = transaction.objectStore(STORE_NAME);
			const request = store.openCursor();
			let found = false;
			request.onsuccess = (event) => {
				const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
				if (cursor) {
					if (typeof cursor.key === "string" && cursor.key.startsWith(prefix)) {
						const list = cursor.value?.value;
						if (Array.isArray(list) && list.length > 0) {
							found = true;
							resolve(true);
							return;
						}
					}
					cursor.continue();
				} else {
					resolve(found);
				}
			};
			request.onerror = () => reject(request.error);
		});
	} catch (e) {
		console.warn("Error checking local projects in IndexedDB:", e);
		return false;
	}
}

export async function purgeProjectDrafts(workspaceId: string, projectId: string, userId?: string | null) {
	if (typeof indexedDB === "undefined") return;

	try {
		const db = await openSketchflowDb();
		// Scoped to one user (or the signed-out "local" scope): never touches other accounts' drafts.
		const prefix = projectDraftPrefix(workspaceId, projectId, userId);
		await new Promise<void>((resolve, reject) => {
			const transaction = db.transaction(STORE_NAME, "readwrite");
			const store = transaction.objectStore(STORE_NAME);
			const request = store.openCursor();
			request.onsuccess = (event) => {
				const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
				if (!cursor) return;
				const key = typeof cursor.key === "string" ? cursor.key : "";
				if (key.startsWith(prefix)) cursor.delete();
				cursor.continue();
			};
			request.onerror = () => reject(request.error);
			transaction.oncomplete = () => resolve();
			transaction.onerror = () => reject(transaction.error);
		});
	} catch (error) {
		console.warn("Error purging project drafts:", error);
	}
}

export async function purgeUserCache(userId: string) {
	if (typeof indexedDB === "undefined" || !userId) return;
	const prefixes = scopePrefixes(userId);
	const userWorkspacesKey = workspacesKey(userId);
	try {
		const db = await openSketchflowDb();
		await new Promise<void>((resolve, reject) => {
			const transaction = db.transaction(STORE_NAME, "readwrite");
			const store = transaction.objectStore(STORE_NAME);
			const request = store.openCursor();
			request.onsuccess = (event) => {
				const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
				if (!cursor) return;
				const key = typeof cursor.key === "string" ? cursor.key : "";
				if (key === userWorkspacesKey || prefixes.some((prefix) => key.startsWith(prefix))) cursor.delete();
				cursor.continue();
			};
			request.onerror = () => reject(request.error);
			transaction.oncomplete = () => resolve();
			transaction.onerror = () => reject(transaction.error);
		});
	} catch (error) {
		console.warn("Error purging user cache:", error);
	}
}

export type OfflineCommit = {
	id: string;
	message: string;
	timestamp: string;
	author: string;
	baseCommitSha?: string | null;
	files: {
		path: string;
		content: string;
	}[];
};

export async function getOfflineCommits(
	workspaceId: string,
	projectId: string,
	userId?: string | null,
): Promise<OfflineCommit[]> {
	const record = await getDraft<OfflineCommit[]>(offlineCommitsKey(workspaceId, projectId, userId));
	if (record?.value) return record.value;

	// Older builds could queue a signed-in user's commits under an unscoped key while auth was
	// still loading. Keep reading that key so pending work is not stranded; it is removed the
	// next time the queue is saved or cleared.
	const legacy = await getDraft<OfflineCommit[]>(legacyOfflineCommitsKey(workspaceId, projectId));
	return legacy?.value ?? [];
}

function legacyOfflineCommitsKey(workspaceId: string, projectId: string) {
	return `offline-commits:${workspaceId}:${projectId}`;
}

export async function saveOfflineCommit(
	workspaceId: string,
	projectId: string,
	commit: OfflineCommit,
	userId?: string | null,
) {
	const existing = await getOfflineCommits(workspaceId, projectId, userId);
	await setDraft(offlineCommitsKey(workspaceId, projectId, userId), [...existing, commit]);
	await deleteDraft(legacyOfflineCommitsKey(workspaceId, projectId));
}

export async function clearOfflineCommits(
	workspaceId: string,
	projectId: string,
	userId?: string | null,
) {
	await Promise.all([
		deleteDraft(offlineCommitsKey(workspaceId, projectId, userId)),
		deleteDraft(legacyOfflineCommitsKey(workspaceId, projectId)),
	]);
}
