export const EXCALIDRAW_LIBRARY_REPO_BASE =
	"https://raw.githubusercontent.com/excalidraw/excalidraw-libraries/main";
export const EXCALIDRAW_LIBRARY_CATALOG_URL = `${EXCALIDRAW_LIBRARY_REPO_BASE}/libraries.json`;
export const EXCALIDRAW_LIBRARY_HOME = "https://libraries.excalidraw.com";

export type LibraryAudience = "all" | "architects" | "devs" | "teachers";

export type ExcalidrawLibraryAuthor = {
	name: string;
	url?: string;
};

export type RawExcalidrawLibrary = {
	id?: string;
	name?: string;
	description?: string;
	authors?: ExcalidrawLibraryAuthor[];
	source?: string;
	preview?: string;
	created?: string;
	updated?: string;
	version?: number;
	itemNames?: string[];
};

export type ExcalidrawLibrary = {
	id: string;
	name: string;
	description: string;
	authors: ExcalidrawLibraryAuthor[];
	source: string;
	preview: string;
	previewUrl: string;
	downloadUrl: string;
	created: string | null;
	updated: string | null;
	version: number | null;
	itemNames: string[];
	audiences: Exclude<LibraryAudience, "all">[];
	searchText: string;
};

export type ExcalidrawLibrariesResponse = {
	libraries: ExcalidrawLibrary[];
	total: number;
	source: string;
	updatedAt: string;
};

export const libraryAudiences: Array<{
	id: LibraryAudience;
	label: string;
	description: string;
}> = [
	{
		id: "all",
		label: "All",
		description: "Every public Excalidraw library",
	},
	{
		id: "architects",
		label: "Architects",
		description: "Floor plans, spaces, furniture, systems, and site maps",
	},
	{
		id: "devs",
		label: "Developers",
		description: "Cloud, UML, system design, network, and product diagrams",
	},
	{
		id: "teachers",
		label: "Teachers",
		description: "Math, science, slides, sticky notes, and classroom assets",
	},
];

const audienceMatchers: Record<Exclude<LibraryAudience, "all">, string[]> = {
	architects: [
		"architecture",
		"architect",
		"floor",
		"plan",
		"furniture",
		"building",
		"room",
		"home",
		"house",
		"office",
		"interior",
		"space",
		"site",
		"electrical",
		"engineering",
	],
	devs: [
		"aws",
		"azure",
		"cloud",
		"kubernetes",
		"devops",
		"dev ops",
		"software",
		"system",
		"network",
		"database",
		"uml",
		"er diagram",
		"c4",
		"wireframe",
		"flow",
		"architecture icons",
		"github",
		"git",
		"api",
	],
	teachers: [
		"teacher",
		"education",
		"classroom",
		"math",
		"science",
		"chemistry",
		"presentation",
		"slides",
		"sticky",
		"notes",
		"collaboration",
		"graph",
		"symbols",
		"geography",
	],
};

function slugFromSource(source: string) {
	return source
		.replace(/\.excalidrawlib$/i, "")
		.replace(/[^a-z0-9]+/gi, "-")
		.replace(/(^-|-$)/g, "")
		.toLowerCase();
}

export function isSafeLibrarySource(source: string) {
	return /^[a-zA-Z0-9._/-]+\.excalidrawlib$/.test(source) && !source.includes("..");
}

export function buildLibraryFileUrl(path: string) {
	return `${EXCALIDRAW_LIBRARY_REPO_BASE}/libraries/${path}`;
}

export function classifyLibrary(searchText: string) {
	const normalized = searchText.toLowerCase();

	return (Object.keys(audienceMatchers) as Array<Exclude<LibraryAudience, "all">>).filter((audience) =>
		audienceMatchers[audience].some((matcher) => normalized.includes(matcher)),
	);
}

export function normalizeExcalidrawLibrary(raw: RawExcalidrawLibrary): ExcalidrawLibrary | null {
	if (!raw.source || !raw.name || !isSafeLibrarySource(raw.source)) {
		return null;
	}

	const itemNames = Array.isArray(raw.itemNames) ? raw.itemNames.filter((item) => typeof item === "string") : [];
	const description = raw.description ?? "";
	const authors = Array.isArray(raw.authors) ? raw.authors.filter((author) => typeof author?.name === "string") : [];
	const preview = raw.preview && !raw.preview.includes("..") ? raw.preview : "";
	const previewUrl = preview ? buildLibraryFileUrl(preview) : "";
	const searchText = [
		raw.name,
		description,
		raw.source,
		...authors.map((author) => author.name),
		...itemNames,
	].join(" ");

	return {
		id: raw.id ?? slugFromSource(raw.source),
		name: raw.name,
		description,
		authors,
		source: raw.source,
		preview,
		previewUrl,
		downloadUrl: buildLibraryFileUrl(raw.source),
		created: raw.created ?? null,
		updated: raw.updated ?? null,
		version: typeof raw.version === "number" ? raw.version : null,
		itemNames,
		audiences: classifyLibrary(searchText),
		searchText: searchText.toLowerCase(),
	};
}

