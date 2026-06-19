const DB_NAME = "sketchflow";
const DB_VERSION = 1;
const STORE_NAME = "drafts";

type DraftRecord<T> = {
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

export async function getLocalProjects(workspaceId: string): Promise<any[]> {
	const result = await getDraft<any[]>(`local-projects:${workspaceId}`);
	return result?.value ?? [];
}

export async function saveLocalProject(workspaceId: string, project: any) {
	const existing = await getLocalProjects(workspaceId);
	const updated = [project, ...existing.filter((p: any) => p.id !== project.id)];
	await setDraft(`local-projects:${workspaceId}`, updated);
}

export async function deleteLocalProject(workspaceId: string, projectId: string) {
	const existing = await getLocalProjects(workspaceId);
	const updated = existing.filter((p: any) => p.id !== projectId);
	await setDraft(`local-projects:${workspaceId}`, updated);
}

export async function hasAnyLocalProjects(): Promise<boolean> {
	if (typeof indexedDB === "undefined") {
		return false;
	}
	try {
		const db = await openSketchflowDb();
		return new Promise<boolean>((resolve, reject) => {
			const transaction = db.transaction(STORE_NAME, "readonly");
			const store = transaction.objectStore(STORE_NAME);
			const request = store.openCursor();
			let found = false;
			request.onsuccess = (event) => {
				const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
				if (cursor) {
					if (typeof cursor.key === "string" && cursor.key.startsWith("local-projects:")) {
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
