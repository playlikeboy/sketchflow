"use client";

import { useCallback } from "react";
import useSWR from "swr";

import { SAVED_PACKS_KEY, libraryStore, removeSavedPack, touchSavedPack, type SavedPack } from "@/lib/library-store";

const NO_PACKS: SavedPack[] = [];

function warnNotSaved(error: unknown) {
	// The list still works for this visit; it just will not be there next time.
	console.warn("Your libraries could not be saved in this browser:", error);
}

/**
 * "Your libraries" for this browser. Changes show immediately and are then written to
 * IndexedDB; the list is shared by every sketch and survives switching tabs in the panel.
 */
export function useSavedPacks() {
	const { data, mutate } = useSWR<SavedPack[]>(SAVED_PACKS_KEY, () => libraryStore.list(), {
		revalidateOnFocus: false,
		shouldRetryOnError: false,
		onError: (error) => console.warn("Your libraries could not be read from this browser:", error),
	});

	const touch = useCallback(
		(pack: { source: string; name: string }) => {
			const usedAt = Date.now();
			mutate(libraryStore.touch(pack), {
				// The list as shown (which may include a change still being saved), not only as last stored.
				optimisticData: (stored, shown) => touchSavedPack(shown ?? stored ?? NO_PACKS, pack, usedAt),
				rollbackOnError: false,
				revalidate: false,
			}).catch(warnNotSaved);
		},
		[mutate],
	);

	const remove = useCallback(
		(source: string) => {
			mutate(libraryStore.remove(source), {
				optimisticData: (stored, shown) => removeSavedPack(shown ?? stored ?? NO_PACKS, source),
				rollbackOnError: false,
				revalidate: false,
			}).catch(warnNotSaved);
		},
		[mutate],
	);

	return { savedPacks: data ?? NO_PACKS, touch, remove };
}
