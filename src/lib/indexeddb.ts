const DB_NAME = "sketchflow";
const DB_VERSION = 1;
const STORE_NAME = "drafts";

export type DraftRecord<T> = {
	key: string;
	value: T;
	updatedAt: string;
};

function openSketchflowDb() {
	return new Promise<IDBDatabase>((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);

		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME, { keyPath: "key" });
			}
		};

		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

async function withDraftStore<T>(mode: IDBTransactionMode, callback: (store: IDBObjectStore) => IDBRequest<T>) {
	const db = await openSketchflowDb();

	return new Promise<T>((resolve, reject) => {
		const transaction = db.transaction(STORE_NAME, mode);
		const store = transaction.objectStore(STORE_NAME);
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

export async function getDraft<T>(key: string) {
	if (typeof indexedDB === "undefined") {
		return null;
	}

	const record = await withDraftStore<DraftRecord<T> | undefined>("readonly", (store) => store.get(key));
	return record ?? null;
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

function localProjectsKey(workspaceId: string, userId?: string | null) {
	return userId ? `local-projects:${userId}:${workspaceId}` : `local-projects:${workspaceId}`;
}

function workspacesKey(userId?: string | null) {
	return userId ? `workspaces:${userId}` : "workspaces:default";
}

function projectsCacheKey(workspaceId: string, userId?: string | null) {
	return userId ? `projects-cache:${userId}:${workspaceId}` : `projects-cache:${workspaceId}`;
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
		const prefix = userId ? `local-projects:${userId}:` : "local-projects:";
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
			transaction.oncomplete = () => db.close();
		});
	} catch (e) {
		console.warn("Error checking local projects in IndexedDB:", e);
		return false;
	}
}

export async function purgeUserCache(userId: string) {
	if (typeof indexedDB === "undefined" || !userId) return;
	try {
		const db = await openSketchflowDb();
		return new Promise<void>((resolve, reject) => {
			const transaction = db.transaction(STORE_NAME, "readwrite");
			const store = transaction.objectStore(STORE_NAME);
			const request = store.openCursor();
			request.onsuccess = (event) => {
				const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
				if (cursor) {
					if (typeof cursor.key === "string" && cursor.key.includes(userId)) {
						cursor.delete();
					}
					cursor.continue();
				} else {
					resolve();
				}
			};
			request.onerror = () => reject(request.error);
			transaction.oncomplete = () => db.close();
		});
	} catch (e) {
		console.warn("Error purging user cache:", e);
	}
}

export type OfflineCommit = {
	id: string;
	message: string;
	timestamp: string;
	author: string;
	files: {
		path: string;
		content: string;
	}[];
};

export async function getOfflineCommits(workspaceId: string, projectId: string): Promise<OfflineCommit[]> {
	const result = await getDraft<OfflineCommit[]>(`offline-commits:${workspaceId}:${projectId}`);
	return result?.value ?? [];
}

export async function saveOfflineCommit(workspaceId: string, projectId: string, commit: OfflineCommit) {
	const existing = await getOfflineCommits(workspaceId, projectId);
	const updated = [...existing, commit];
	await setDraft(`offline-commits:${workspaceId}:${projectId}`, updated);
}

export async function clearOfflineCommits(workspaceId: string, projectId: string) {
	await deleteDraft(`offline-commits:${workspaceId}:${projectId}`);
}
