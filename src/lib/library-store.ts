// "Your libraries": the community shape packs this browser has opened, most recent first.
//
// The list belongs to the browser, not to a sketch or workspace, so a pack opened in one
// sketch is still there in the next. Packs are public content, so the key carries no user
// id; it lives in the device-wide "local" scope and is untouched by a sign-out purge.

import { isSafeLibrarySource } from "@/lib/excalidraw-libraries";
import { getDraft, setDraft } from "@/lib/indexeddb";
import { LOCAL_SCOPE } from "@/lib/storage-keys";

/** The single IndexedDB key that holds the list. */
export const SAVED_PACKS_KEY = `library-packs:${LOCAL_SCOPE}`;
/** Oldest entries are dropped beyond this many. */
export const MAX_SAVED_PACKS = 30;
const MAX_NAME_LENGTH = 120;

export type SavedPack = {
	/** The pack's path in the community catalog, for example "author/pack.excalidrawlib". */
	source: string;
	name: string;
	/** Epoch milliseconds of the last time the pack was opened or inserted from. */
	lastUsedAt: number;
};

export type StoredSavedPacks = { version: 1; packs: SavedPack[] };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function toSavedPack(value: unknown): SavedPack | null {
	if (!isRecord(value)) return null;
	const { source, name, lastUsedAt } = value;
	if (typeof source !== "string" || !isSafeLibrarySource(source)) return null;
	if (typeof lastUsedAt !== "number" || !Number.isFinite(lastUsedAt)) return null;
	const cleanName = typeof name === "string" ? name.trim().slice(0, MAX_NAME_LENGTH) : "";
	return { source, name: cleanName || source, lastUsedAt };
}

function order(packs: readonly SavedPack[]): SavedPack[] {
	const newestBySource = new Map<string, SavedPack>();
	for (const pack of packs) {
		const existing = newestBySource.get(pack.source);
		if (!existing || pack.lastUsedAt > existing.lastUsedAt) {
			newestBySource.set(pack.source, pack);
		}
	}

	return [...newestBySource.values()]
		.sort((left, right) => right.lastUsedAt - left.lastUsedAt || left.name.localeCompare(right.name))
		.slice(0, MAX_SAVED_PACKS);
}

/**
 * Turns whatever was read from storage into a clean list: invalid entries dropped, one entry
 * per pack, most recently used first, at most MAX_SAVED_PACKS long.
 */
export function normalizeSavedPacks(value: unknown): SavedPack[] {
	const list = isRecord(value) && Array.isArray(value.packs) ? value.packs : Array.isArray(value) ? value : [];
	return order(list.map(toSavedPack).filter((pack): pack is SavedPack => pack !== null));
}

/** The list with `pack` moved (or added) to the front. The input is not modified. */
export function touchSavedPack(packs: readonly SavedPack[], pack: { source: string; name: string }, now: number): SavedPack[] {
	const touched = toSavedPack({ ...pack, lastUsedAt: now });
	if (!touched) return order(packs);
	return order([touched, ...packs.filter((existing) => existing.source !== touched.source)]);
}

/** The list without the pack at `source`. The input is not modified. */
export function removeSavedPack(packs: readonly SavedPack[], source: string): SavedPack[] {
	return order(packs.filter((pack) => pack.source !== source));
}

export type LibraryStoreStorage = {
	/** Resolves with the stored value, or null when nothing was stored yet. */
	read: () => Promise<unknown>;
	write: (value: StoredSavedPacks) => Promise<void>;
};

export type LibraryStore = {
	list: () => Promise<SavedPack[]>;
	/** Marks a pack as just used. Resolves with the new list. */
	touch: (pack: { source: string; name: string }) => Promise<SavedPack[]>;
	/** Forgets a pack. Resolves with the new list. */
	remove: (source: string) => Promise<SavedPack[]>;
};

/**
 * A saved-packs list on top of any storage. Every change re-reads storage first, so another
 * browser tab's changes are kept, and changes run one at a time so they cannot overwrite
 * each other.
 */
export function createLibraryStore(storage: LibraryStoreStorage, now: () => number = Date.now): LibraryStore {
	let queue: Promise<unknown> = Promise.resolve();

	const list = async () => normalizeSavedPacks(await storage.read());

	const change = (apply: (packs: SavedPack[]) => SavedPack[]) => {
		const result = queue.then(async () => {
			const packs = apply(await list());
			await storage.write({ version: 1, packs });
			return packs;
		});
		// A failed change must not block the ones after it.
		queue = result.catch(() => undefined);
		return result;
	};

	return {
		list,
		touch: (pack) => change((packs) => touchSavedPack(packs, pack, now())),
		remove: (source) => change((packs) => removeSavedPack(packs, source)),
	};
}

/** The saved-packs list of this browser, kept in IndexedDB. */
export const libraryStore = createLibraryStore({
	read: async () => (await getDraft<unknown>(SAVED_PACKS_KEY))?.value ?? null,
	write: async (value) => {
		await setDraft<StoredSavedPacks>(SAVED_PACKS_KEY, value);
	},
});
