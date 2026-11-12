// Brand logos from Simple Icons (https://simpleicons.org, CC0 icons; the brands stay trademarks
// of their owners). Nothing is bundled or committed: the list of icons and each SVG are read at
// runtime from jsDelivr, from ONE exact npm release, so every URL here is public and immutable.

import { fitSize, svgDimensions } from "@/lib/canvas-insert-geometry";

/** The exact `simple-icons` npm release everything is loaded from. Bump deliberately. */
export const SIMPLE_ICONS_VERSION = "16.37.0";

const CDN_BASE = `https://cdn.jsdelivr.net/npm/simple-icons@${SIMPLE_ICONS_VERSION}`;

/** Every icon's title, slug, brand colour and aliases, in one JSON file. */
export const SIMPLE_ICONS_INDEX_URL = `${CDN_BASE}/data/simple-icons.json`;

export type SimpleIcon = {
	/** The brand name as its owner writes it, for example "Node.js". */
	title: string;
	/** The icon's file name without the extension, for example "nodedotjs". */
	slug: string;
	/** The brand colour as six upper-case hex digits without a "#". */
	hex: string;
	/** Other names the brand is known by: former names, nicknames, names in other scripts. */
	aliases: readonly string[];
};

type Fetcher = (url: string) => Promise<Response>;

// A request that stalls is abandoned, so the tab can say so and offer another try.
const FETCH_TIMEOUT_MS = 15_000;

const browserFetch: Fetcher = (url) => fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });

// ---------------------------------------------------------------------------------------------
// Slugs
// ---------------------------------------------------------------------------------------------

// Ported from `titleToSlug` in sdk.mjs of the pinned release. Since v14 every entry in the data
// file carries its own slug, so this is only the fallback for an entry without one, and the way
// a typed search such as "c++" is turned into the form slugs are written in ("cplusplus").
const TITLE_TO_SLUG_REPLACEMENTS: Readonly<Record<string, string>> = {
	"+": "plus",
	".": "dot",
	"&": "and",
	đ: "d",
	ħ: "h",
	ı: "i",
	ĸ: "k",
	ŀ: "l",
	ł: "l",
	ß: "ss",
	ŧ: "t",
	ø: "o",
};
const TITLE_TO_SLUG_CHARS = /[+.&đħıĸŀłßŧø]/g;
const NOT_SLUG_CHARS = /[^a-z\d]/g;

/** The file name Simple Icons gives a brand title: `.NET` → `dotnet`, `AT&T` → `atandt`. */
export function titleToSlug(title: string): string {
	return title
		.toLowerCase()
		.replace(TITLE_TO_SLUG_CHARS, (char) => TITLE_TO_SLUG_REPLACEMENTS[char])
		.normalize("NFD")
		.replace(NOT_SLUG_CHARS, "");
}

// Slugs are lower-case letters and digits, with "_suffix" where two brands share a name.
const SLUG_PATTERN = /^[a-z0-9]+(_[a-z0-9]+)*$/;

/** Where one icon's SVG lives in the pinned release. */
export function simpleIconUrl(slug: string): string {
	return `${CDN_BASE}/icons/${encodeURIComponent(slug)}.svg`;
}

// ---------------------------------------------------------------------------------------------
// The index
// ---------------------------------------------------------------------------------------------

const HEX_PATTERN = /^[0-9a-f]{6}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asList(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

/** Flattens `aliases: { aka, old, dup: [{ title }], loc: { locale: name } }` into plain names. */
function parseAliases(value: unknown): string[] {
	if (!isRecord(value)) return [];

	const duplicateTitles = asList(value.dup).map((entry) => (isRecord(entry) ? entry.title : null));
	const localisedTitles = isRecord(value.loc) ? Object.values(value.loc) : [];
	const names = [...asList(value.aka), ...asList(value.old), ...duplicateTitles, ...localisedTitles];

	return [...new Set(names.filter((name): name is string => typeof name === "string" && name.trim() !== ""))];
}

function parseIcon(entry: unknown): SimpleIcon | null {
	if (!isRecord(entry)) return null;
	const { title, hex } = entry;
	if (typeof title !== "string" || title.trim() === "") return null;
	if (typeof hex !== "string" || !HEX_PATTERN.test(hex)) return null;

	const slug = typeof entry.slug === "string" && entry.slug !== "" ? entry.slug : titleToSlug(title);
	// The slug becomes part of a URL, so anything that is not a plain file name is dropped.
	if (!SLUG_PATTERN.test(slug)) return null;

	return { title, slug, hex: hex.toUpperCase(), aliases: parseAliases(entry.aliases) };
}

/** Validates the contents of data/simple-icons.json, keeping only what the app uses. */
export function parseSimpleIconsIndex(data: unknown): SimpleIcon[] {
	const icons = asList(data).flatMap((entry) => {
		const icon = parseIcon(entry);
		return icon ? [icon] : [];
	});
	if (icons.length === 0) {
		throw new Error("The logo list is not in the expected format.");
	}
	return icons;
}

async function fetchIndex(fetcher: Fetcher): Promise<readonly SimpleIcon[]> {
	const response = await fetcher(SIMPLE_ICONS_INDEX_URL);
	if (!response.ok) {
		throw new Error(`The logo list could not be loaded (HTTP ${response.status}).`);
	}
	return parseSimpleIconsIndex(await response.json());
}

/**
 * Builds a loader that fetches the index once and then shares it. A failed load is forgotten,
 * so calling the loader again retries.
 */
export function createSimpleIconsIndexLoader(fetcher: Fetcher = browserFetch): () => Promise<readonly SimpleIcon[]> {
	let pending: Promise<readonly SimpleIcon[]> | null = null;

	return () => {
		pending ??= fetchIndex(fetcher).catch((error: unknown) => {
			pending = null;
			throw error;
		});
		return pending;
	};
}

/** The list of every Simple Icons brand, fetched once per session. */
export const loadSimpleIconsIndex = createSimpleIconsIndexLoader();

// ---------------------------------------------------------------------------------------------
// One icon's SVG
// ---------------------------------------------------------------------------------------------

// Real icons are 0.2–55 KB. The cap only stops a wrong response being embedded in a sketch.
const MAX_ICON_SVG_LENGTH = 200_000;
const SVG_DOCUMENT = /^<svg\b[^>]*>[\s\S]*<\/svg>$/i;
// Every Simple Icons file is an <svg> holding a <title> and one <path>. Anything else (scripts,
// styles, links, embedded images, comments, doctypes, event handlers) is not an icon and must
// never be stored in a sketch.
const ICON_ELEMENTS: ReadonlySet<string> = new Set(["svg", "title", "path"]);
const TAG_NAME = /<[/]?([^\s/>]*)/g;
const EVENT_HANDLER_ATTRIBUTE = /\son[a-z]+\s*=/i;

function isPlainSvgDrawing(svg: string): boolean {
	if (svg.length > MAX_ICON_SVG_LENGTH || !SVG_DOCUMENT.test(svg) || EVENT_HANDLER_ATTRIBUTE.test(svg)) return false;
	return [...svg.matchAll(TAG_NAME)].every((tag) => ICON_ELEMENTS.has(tag[1].toLowerCase()));
}

/** Fetches one icon's SVG text from the pinned release. */
export async function fetchSimpleIconSvg(slug: string, fetcher: Fetcher = browserFetch): Promise<string> {
	const response = await fetcher(simpleIconUrl(slug));
	if (!response.ok) {
		throw new Error(`The logo could not be loaded (HTTP ${response.status}).`);
	}

	const svg = (await response.text()).trim();
	if (!isPlainSvgDrawing(svg)) {
		throw new Error("The logo file is not in the expected format.");
	}
	return svg;
}

// ---------------------------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------------------------

/** "#abc", "abc", "#aabbcc" or "aabbcc" → "#aabbcc". Null for anything else. */
function normaliseHexColour(colour: string): string | null {
	const digits = colour.trim().replace(/^#/, "");
	if (/^[0-9a-f]{3}$/i.test(digits)) {
		return `#${[...digits].map((digit) => digit + digit).join("")}`;
	}
	return HEX_PATTERN.test(digits) ? `#${digits}` : null;
}

function linearChannel(value: number): number {
	const scaled = value / 255;
	return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance: 0 for black, 1 for white. Null when the colour is not hex. */
function relativeLuminance(colour: string): number | null {
	const hex = normaliseHexColour(colour);
	if (!hex) return null;

	const [red, green, blue] = [1, 3, 5].map((start) => linearChannel(Number.parseInt(hex.slice(start, start + 2), 16)));
	return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** WCAG contrast ratio of two hex colours, from 1 (identical) to 21 (black on white). */
export function contrastRatio(first: string, second: string): number {
	const a = relativeLuminance(first);
	const b = relativeLuminance(second);
	if (a === null || b === null) return 1;

	return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// A logo is a large solid shape, so it stays readable far below the 3:1 WCAG asks of small
// interface graphics. These only catch colours that all but vanish: on black, anything darker
// than roughly #383838 or a deep navy; on white, anything paler than roughly #E2E2E2, which
// is near-whites and the palest yellows and limes.
// The dark limit is higher because the eye separates dark tones worse than the ratio suggests.
const MIN_CONTRAST_ON_DARK_CANVAS = 1.8;
const MIN_CONTRAST_ON_LIGHT_CANVAS = 1.3;
const DARK_BACKGROUND_LUMINANCE = 0.18;

/** Whether a logo in `colour` can be made out on a canvas with the `background` colour. */
export function isVisibleOnCanvas(colour: string, background: string): boolean {
	const backgroundLuminance = relativeLuminance(background);
	if (backgroundLuminance === null || relativeLuminance(colour) === null) return false;

	const minimum = backgroundLuminance < DARK_BACKGROUND_LUMINANCE ? MIN_CONTRAST_ON_DARK_CANVAS : MIN_CONTRAST_ON_LIGHT_CANVAS;
	return contrastRatio(colour, background) >= minimum;
}

/** "brand": the brand's own colour. "mono": white on a dark canvas, near-black on a light one. */
export type LogoColourMode = "brand" | "mono";

/** The canvas colour of each app theme, as the editor sets it. */
export function canvasBackgroundColour(isDark: boolean): string {
	return isDark ? "#000000" : "#ffffff";
}

/** The single colour used for black/white logos: the same as the editor's default stroke. */
export function monochromeLogoColour(isDark: boolean): string {
	return isDark ? "#ffffff" : "#1e1e1e";
}

export type ResolvedLogoColour = {
	/** The colour to draw the logo in, as "#rrggbb". */
	colour: string;
	/** True when the brand colour was asked for but would not show up on the canvas. */
	isFallback: boolean;
};

/** The colour a logo is previewed and inserted in, for the chosen mode and the app theme. */
export function resolveLogoColour(hex: string, mode: LogoColourMode, isDark: boolean): ResolvedLogoColour {
	const monochrome = monochromeLogoColour(isDark);
	if (mode === "mono") return { colour: monochrome, isFallback: false };

	const brand = normaliseHexColour(hex);
	if (!brand || !isVisibleOnCanvas(brand, canvasBackgroundColour(isDark))) {
		return { colour: monochrome, isFallback: true };
	}
	return { colour: brand, isFallback: false };
}

// Browsers need an explicit size to draw an SVG onto a canvas, and a generous one keeps the
// logo sharp when it is enlarged. The canvas element's own size is set when it is inserted.
const ICON_RENDER_SIZE = 256;
const ICON_VIEW_BOX_SIZE = { width: 24, height: 24 };
const SVG_ROOT_TAG = /<svg\b[^>]*>/i;
const ROOT_FILL_AND_SIZE = /\s(?:fill|width|height)\s*=\s*(?:"[^"]*"|'[^']*')/gi;

/**
 * Returns the icon's SVG with `colour` as the fill of the root element (Simple Icons are one
 * path with no fill of its own) and an explicit size that keeps its proportions.
 */
export function colourSimpleIcon(svg: string, colour: string): string {
	const fill = normaliseHexColour(colour);
	if (!fill) {
		throw new Error("A logo can only be coloured with a hex colour.");
	}
	const rootTag = svg.match(SVG_ROOT_TAG)?.[0];
	if (!rootTag) {
		throw new Error("The logo file is not an SVG.");
	}

	const size = fitSize(svgDimensions(svg) ?? ICON_VIEW_BOX_SIZE, ICON_RENDER_SIZE);
	const attributes = `fill="${fill}" width="${Math.round(size.width)}" height="${Math.round(size.height)}"`;
	const otherAttributes = rootTag.slice("<svg".length).replace(ROOT_FILL_AND_SIZE, "");

	return svg.replace(rootTag, () => `<svg ${attributes}${otherAttributes}`);
}

// ---------------------------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------------------------

// Shown first when nothing has been typed, in this order. Slugs missing from the index are
// skipped, so a brand leaving Simple Icons cannot break the list.
const POPULAR_SLUGS: readonly string[] = [
	"github",
	"react",
	"nextdotjs",
	"typescript",
	"javascript",
	"python",
	"nodedotjs",
	"docker",
	"kubernetes",
	"postgresql",
	"tailwindcss",
	"figma",
	"vercel",
	"cloudflare",
	"google",
	"apple",
	"git",
	"npm",
	"bun",
	"rust",
	"go",
	"linux",
	"supabase",
	"stripe",
	"notion",
	"discord",
	"youtube",
	"firebase",
	"mongodb",
	"redis",
	"mysql",
	"graphql",
	"vuedotjs",
	"angular",
	"svelte",
	"html5",
	"css",
	"android",
	"swift",
	"kotlin",
	"terraform",
	"nginx",
	"linear",
	"jira",
	"claude",
	"x",
	"meta",
	"excalidraw",
];
const POPULARITY = new Map(POPULAR_SLUGS.map((slug, position) => [slug, position]));

function popularity(icon: SimpleIcon): number {
	return POPULARITY.get(icon.slug) ?? POPULAR_SLUGS.length;
}

const COMBINING_MARKS = /\p{M}/gu;
const NOT_LETTER_OR_DIGIT = /[^\p{L}\p{N}]/gu;
const SLUG_SYMBOLS = /[+.&]/;

/** Lower case, without accents, with single spaces: "Dassault  Systèmes" → "dassault systemes". */
function fold(text: string): string {
	return text.toLowerCase().normalize("NFD").replace(COMBINING_MARKS, "").replace(/\s+/g, " ").trim();
}

/** Folded, then only letters and digits of any script: "Node.js" → "nodejs". */
function compact(text: string): string {
	return fold(text).replace(NOT_LETTER_OR_DIGIT, "");
}

/**
 * The forms a typed search is looked up in: as typed, and squeezed. A search containing "+",
 * "." or "&" is squeezed the way slugs are ("c++" → "cplusplus"), because dropping those
 * characters would leave "c" and match half the list.
 */
function searchNeedles(query: string): string[] {
	const squeezed = SLUG_SYMBOLS.test(query) ? titleToSlug(query) : compact(query);
	return [...new Set([fold(query), squeezed])].filter((needle) => needle !== "");
}

// How a name matched, best first.
const EXACT = 0;
const PREFIX = 1;
const WORD_PREFIX = 2;
const INSIDE = 3;
const NO_MATCH = 4;

function matchKind(name: string, needle: string): number {
	if (name === needle) return EXACT;
	if (name.startsWith(needle)) return PREFIX;
	if (name.includes(` ${needle}`)) return WORD_PREFIX;
	return name.includes(needle) ? INSIDE : NO_MATCH;
}

function bestMatchKind(names: readonly string[], needles: readonly string[]): number {
	return Math.min(NO_MATCH, ...names.flatMap((name) => needles.map((needle) => matchKind(name, needle))));
}

// Rank by match kind (indexed by the constants above; lower is better). A title or slug match
// beats the same kind of alias match, and the start of a name beats the middle of one.
const NAME_RANK = [0, 1, 3, 4, Number.POSITIVE_INFINITY];
const ALIAS_RANK = [2, 2, 5, 5, Number.POSITIVE_INFINITY];

function searchRank(icon: SimpleIcon, needles: readonly string[]): number {
	const nameKind = bestMatchKind([fold(icon.title), compact(icon.title), icon.slug], needles);
	const aliasKind = bestMatchKind(icon.aliases.flatMap((alias) => [fold(alias), compact(alias)]), needles);
	return Math.min(NAME_RANK[nameKind], ALIAS_RANK[aliasKind]);
}

function popularFirst(index: readonly SimpleIcon[]): SimpleIcon[] {
	// Sorting is stable, so brands that are not on the popular list keep the index's order.
	return [...index].sort((a, b) => popularity(a) - popularity(b));
}

/**
 * Finds brands by title, slug or alias, ignoring case and accents. Best matches first: exact,
 * then names starting with the search, then aliases, then matches inside a name. Ties go to
 * well-known brands, then shorter titles. An empty search lists well-known developer brands
 * first, then every brand in the index's own (alphabetical) order.
 */
export function searchSimpleIcons(index: readonly SimpleIcon[], query: string, limit = Number.POSITIVE_INFINITY): SimpleIcon[] {
	const count = Math.max(0, limit);
	const needles = searchNeedles(query);
	if (needles.length === 0) {
		return (query.trim() === "" ? popularFirst(index) : []).slice(0, count);
	}

	return index
		.map((icon) => ({ icon, rank: searchRank(icon, needles) }))
		.filter((match) => Number.isFinite(match.rank))
		.sort((a, b) => a.rank - b.rank || popularity(a.icon) - popularity(b.icon) || a.icon.title.length - b.icon.title.length)
		.slice(0, count)
		.map((match) => match.icon);
}
