// Pure list logic for the Libraries tab: which packs to show, in which section and order.

import type { ExcalidrawLibrary, LibraryAudience } from "@/lib/excalidraw-libraries";
import type { SavedPack } from "@/lib/library-store";

/** A pack in "Your libraries". `library` is null when the catalog does not (yet) list it. */
export type YourPack = {
	source: string;
	name: string;
	library: ExcalidrawLibrary | null;
};

export type PackFilter = {
	query: string;
	audience: LibraryAudience;
};

export type PackSections = {
	/** Packs this browser has opened, most recently used first. */
	yours: YourPack[];
	/** Every other catalog pack, by name. */
	others: ExcalidrawLibrary[];
};

/** True when every word of `query` appears in `searchText` (which must be lower case). */
export function matchesQuery(searchText: string, query: string): boolean {
	return query
		.toLowerCase()
		.split(/\s+/)
		.filter(Boolean)
		.every((word) => searchText.includes(word));
}

function matchesAudience(library: ExcalidrawLibrary, audience: LibraryAudience) {
	return audience === "all" || library.audiences.includes(audience);
}

export function splitPacks(libraries: readonly ExcalidrawLibrary[], saved: readonly SavedPack[], filter: PackFilter): PackSections {
	const bySource = new Map(libraries.map((library) => [library.source, library]));
	const savedSources = new Set(saved.map((pack) => pack.source));

	const yours = saved
		.map((pack): YourPack => {
			const library = bySource.get(pack.source) ?? null;
			return { source: pack.source, name: library?.name ?? pack.name, library };
		})
		// Without the catalog entry only the name is known, and the subject cannot be judged.
		.filter((pack) => (pack.library ? matchesAudience(pack.library, filter.audience) : filter.audience === "all"))
		.filter((pack) => matchesQuery(pack.library?.searchText ?? pack.name.toLowerCase(), filter.query));

	const others = libraries
		.filter((library) => !savedSources.has(library.source))
		.filter((library) => matchesAudience(library, filter.audience))
		.filter((library) => matchesQuery(library.searchText, filter.query))
		.sort((left, right) => left.name.localeCompare(right.name));

	return { yours, others };
}
