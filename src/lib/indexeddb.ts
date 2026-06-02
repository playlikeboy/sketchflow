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
