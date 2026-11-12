"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { PackRef } from "@/components/editor/insert/libraries/pack";
import { splitPacks } from "@/components/editor/insert/libraries/pack-filter";
import { PackList, type CatalogStatus } from "@/components/editor/insert/libraries/pack-list";
import { PackView } from "@/components/editor/insert/libraries/pack-view";
import { useSavedPacks } from "@/components/editor/insert/libraries/use-saved-packs";
import type { InsertTabProps } from "@/components/editor/insert/types";
import type { ExcalidrawLibrary, LibraryAudience } from "@/lib/excalidraw-libraries";
import { useExcalidrawLibraries } from "@/lib/swr-hooks";

type OpenPack = {
	pack: PackRef;
	/** The search text when the pack was opened. Typing a new search returns to the list. */
	query: string;
	/** Opened by a click just now, as opposed to restored when the tab was shown again. */
	byUser: boolean;
};

const NO_LIBRARIES: ExcalidrawLibrary[] = [];

// The pack that was open when the tab was last shown. The panel unmounts a tab when another
// one is selected; this brings the person back to where they were, for this visit only.
let lastOpenPack: OpenPack | null = null;

/**
 * Community shape libraries. Level one lists the packs ("Your libraries" first); opening a
 * pack shows its shapes, and clicking a shape adds it to the canvas at the standard size.
 */
export function LibrariesTab({ api, isDark, query, onInserted }: InsertTabProps) {
	const [audience, setAudience] = useState<LibraryAudience>("all");
	const [open, setOpen] = useState<OpenPack | null>(() => (lastOpenPack?.query === query ? { ...lastOpenPack, byUser: false } : null));
	const [focusSource, setFocusSource] = useState<string | null>(null);
	const { data, error, isValidating, mutate } = useExcalidrawLibraries();
	const { savedPacks, touch, remove } = useSavedPacks();

	// The search box searches libraries, so a new search leaves the open pack.
	const current = open && open.query === query ? open : null;
	if (open && !current) {
		setOpen(null);
	}

	useEffect(() => {
		lastOpenPack = open;
	}, [open]);

	useEffect(() => {
		// One-shot: the row has taken focus by now (child effects run first). Without this, the
		// row would grab focus again whenever a later search or filter re-created it.
		if (focusSource) setFocusSource(null);
	}, [focusSource]);

	const libraries = data?.libraries ?? NO_LIBRARIES;
	const sections = useMemo(() => splitPacks(libraries, savedPacks, { query, audience }), [libraries, savedPacks, query, audience]);
	const catalog: CatalogStatus = data ? "ready" : error && !isValidating ? "failed" : "loading";

	// Stable, because the open pack reports itself as used from an effect.
	const handleUsed = useCallback((pack: PackRef) => touch({ source: pack.source, name: pack.name }), [touch]);
	const handleRemove = (source: string) => {
		// The removed row disappears from under the keyboard: move on to the next saved pack,
		// or, when it was the last one, to the same pack where it reappears in the full list.
		const index = sections.yours.findIndex((pack) => pack.source === source);
		const neighbour = sections.yours[index + 1] ?? sections.yours[index - 1];
		remove(source);
		setFocusSource(neighbour?.source ?? source);
	};

	if (current) {
		const handleBack = () => {
			setFocusSource(current.pack.source);
			setOpen(null);
		};

		return (
			<PackView
				key={current.pack.source}
				api={api}
				pack={current.pack}
				isDark={isDark}
				shouldFocus={current.byUser}
				onBack={handleBack}
				onUsed={handleUsed}
				onInserted={onInserted}
			/>
		);
	}

	return (
		<PackList
			sections={sections}
			catalog={catalog}
			query={query}
			audience={audience}
			focusSource={focusSource}
			onAudienceChange={setAudience}
			onOpen={(pack) => setOpen({ pack, query, byUser: true })}
			onRemove={handleRemove}
			onRetry={() => void mutate()}
		/>
	);
}
