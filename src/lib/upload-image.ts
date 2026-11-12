// Rules for the Upload tab: which files are accepted, and what is taken out of an SVG.
//
// An uploaded SVG is only ever drawn through an <img> or a canvas, where scripts cannot run.
// It is still cleaned, because the sketch is later committed to the person's repository and
// the picture may be opened on its own somewhere else. The decisions are plain functions so
// they can be tested without a browser; only `sanitizeSvg` needs a real DOMParser.

export const MAX_SVG_BYTES = 1024 * 1024;
export const MAX_RASTER_BYTES = 15 * 1024 * 1024;
/** How many files one drop or selection adds. More than this is almost always a mistake. */
export const MAX_FILES_PER_UPLOAD = 20;

export const SVG_MIME_TYPE = "image/svg+xml";
export const RASTER_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export const UPLOAD_ACCEPT = [SVG_MIME_TYPE, ...RASTER_MIME_TYPES].join(",");

export type RasterMimeType = (typeof RASTER_MIME_TYPES)[number];
export type UploadMimeType = typeof SVG_MIME_TYPE | RasterMimeType;

/** The parts of a `File` the checks read, so tests can pass plain objects. */
export type UploadCandidate = { name: string; type: string; size: number };

export type UploadCheck =
	| { ok: true; kind: "svg" }
	| { ok: true; kind: "raster"; mimeType: RasterMimeType; keepTransparency: boolean }
	| { ok: false; message: string };

export type UploadFailure = { name: string; message: string };
export type UploadReport = { added: number; failures: readonly UploadFailure[] };

const EXTENSION_TYPES: Record<string, UploadMimeType> = {
	svg: SVG_MIME_TYPE,
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	webp: "image/webp",
	gif: "image/gif",
};
/** What a browser reports when it does not know a file's type. */
const UNKNOWN_TYPES: readonly string[] = ["", "application/octet-stream"];
// JPEG has no transparency, so it is the only format stored as a (smaller) JPEG.
const OPAQUE_TYPES: readonly RasterMimeType[] = ["image/jpeg"];

export const UPLOAD_MESSAGES = {
	unsupported: "Not a supported image. Use SVG, PNG, JPEG, WebP or GIF.",
	empty: "The file is empty.",
	unreadable: "Could not be read. The file may be damaged.",
	invalidSvg: "Not a valid SVG file.",
	noSvgSupport: "This browser cannot check SVG files.",
	overLimit: `Left out. Up to ${MAX_FILES_PER_UPLOAD} files can be added at once.`,
} as const;

function isUploadMimeType(type: string): type is UploadMimeType {
	return type === SVG_MIME_TYPE || (RASTER_MIME_TYPES as readonly string[]).includes(type);
}

/**
 * The image type of a file, from its declared type or, when the browser gives none or only
 * "some bytes" (common for dragged files), from its extension. Null when it is not an image
 * this tab accepts.
 */
export function resolveUploadType(file: Pick<UploadCandidate, "name" | "type">): UploadMimeType | null {
	const declared = file.type.trim().toLowerCase();
	if (!UNKNOWN_TYPES.includes(declared)) return isUploadMimeType(declared) ? declared : null;

	const extension = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".") + 1).toLowerCase() : "";
	return EXTENSION_TYPES[extension] ?? null;
}

/** "1.5 MB", "340 KB". Sizes are binary, matching the limits above. */
export function formatBytes(bytes: number): string {
	const kilobytes = Math.round(bytes / 1024);
	// Switches unit on the rounded value, so a file just under 1 MB is not written as "1024 KB".
	if (kilobytes >= 1024) return `${Number((bytes / (1024 * 1024)).toFixed(1))} MB`;
	if (bytes >= 1024) return `${kilobytes} KB`;
	return `${bytes} bytes`;
}

function tooLarge(size: number, limit: number, subject: string) {
	return `Too large (${formatBytes(size)}). ${subject} can be up to ${formatBytes(limit)}.`;
}

/** Decides, from name, type and size alone, whether a file can be added and how. */
export function checkUpload(file: UploadCandidate): UploadCheck {
	const mimeType = resolveUploadType(file);
	if (!mimeType) return { ok: false, message: UPLOAD_MESSAGES.unsupported };
	if (file.size <= 0) return { ok: false, message: UPLOAD_MESSAGES.empty };

	if (mimeType === SVG_MIME_TYPE) {
		return file.size > MAX_SVG_BYTES ? { ok: false, message: tooLarge(file.size, MAX_SVG_BYTES, "SVG files") } : { ok: true, kind: "svg" };
	}
	if (file.size > MAX_RASTER_BYTES) {
		return { ok: false, message: tooLarge(file.size, MAX_RASTER_BYTES, "Images") };
	}
	return { ok: true, kind: "raster", mimeType, keepTransparency: !OPAQUE_TYPES.includes(mimeType) };
}

/** Splits a selection into the files that will be processed and the ones over the limit. */
export function takeUploadBatch<T>(files: readonly T[], limit = MAX_FILES_PER_UPLOAD): { accepted: T[]; skipped: T[] } {
	return { accepted: files.slice(0, limit), skipped: files.slice(limit) };
}

/** One plain sentence for the status line after a batch finishes. */
export function summarizeUpload(report: UploadReport): string {
	const failed = report.failures.length;
	const images = (count: number) => (count === 1 ? "1 image" : `${count} images`);
	if (report.added === 0 && failed === 0) return "";
	if (failed === 0) return `Added ${images(report.added)}.`;
	if (report.added === 0) return failed === 1 ? "That file could not be added." : `None of the ${failed} files could be added.`;
	return `Added ${images(report.added)}. ${failed === 1 ? "1 file was" : `${failed} files were`} left out.`;
}

// ---------------------------------------------------------------------------------------
// SVG cleaning rules
// ---------------------------------------------------------------------------------------

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const XHTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
const BLOCKED_ELEMENTS: readonly string[] = ["script", "foreignobject"];
const ANIMATION_ELEMENTS: readonly string[] = ["set", "animate", "animatetransform", "animatemotion"];
const DATA_IMAGE_ELEMENTS: readonly string[] = ["image", "feimage"];
const SAFE_DATA_IMAGE = /^data:image\/[a-z0-9.+-]+[;,]/i;
const BLOCKED_TAG = /<\s*(?:[\w.-]+:)?(?:script|foreignobject)\b/i;

function localPart(name: string) {
	const trimmed = name.trim();
	return trimmed.slice(trimmed.indexOf(":") + 1).toLowerCase();
}

/** True for `href` and `xlink:href`, the attributes that can point outside the file. */
export function isLinkAttribute(name: string): boolean {
	return localPart(name) === "href";
}

/** True for event handlers such as `onload` and `onclick`, whatever their letter case. */
export function isEventHandlerAttribute(name: string): boolean {
	return /^on/i.test(name.trim());
}

/**
 * A link may stay only when it points inside the file (`#id`) or, on an <image> or <feImage>,
 * embeds a picture (`data:image/…`). Embedded data is not allowed anywhere else: a <use> that
 * points at a data URL pulls that document's elements, handlers included, into this one.
 */
export function isSafeHref(value: string, elementName = ""): boolean {
	const trimmed = value.trim();
	if (trimmed.startsWith("#")) return true;
	return DATA_IMAGE_ELEMENTS.includes(elementName.toLowerCase()) && SAFE_DATA_IMAGE.test(trimmed);
}

/** `elementName` is the local name of the element carrying the attribute. */
export function shouldRemoveAttribute(name: string, value: string, elementName = ""): boolean {
	return isEventHandlerAttribute(name) || (isLinkAttribute(name) && !isSafeHref(value, elementName));
}

export type SvgElementFacts = {
	localName: string;
	namespaceURI: string | null;
	/** The element's `attributeName` attribute, which says what an animation changes. */
	animatedAttribute?: string | null;
};

/**
 * Elements that are taken out whole: scripts, <foreignObject>, any HTML element placed
 * directly in the SVG, and animations that rewrite a link or an event handler (which would
 * put back what the attribute rules took out).
 */
export function shouldRemoveElement(element: SvgElementFacts): boolean {
	const name = element.localName.toLowerCase();
	if (BLOCKED_ELEMENTS.includes(name)) return true;
	if (element.namespaceURI === XHTML_NAMESPACE) return true;
	const target = element.animatedAttribute ?? "";
	return ANIMATION_ELEMENTS.includes(name) && (isLinkAttribute(target) || isEventHandlerAttribute(target));
}

const PROCESSING_INSTRUCTION_NODE = 7;
const COMMENT_NODE = 8;

/**
 * Comments and processing instructions are dropped. They do nothing in an SVG, but their text
 * is copied out untouched, and would be read as markup if the file were pasted into a web page.
 */
export function shouldRemoveNodeType(nodeType: number): boolean {
	return nodeType === COMMENT_NODE || nodeType === PROCESSING_INSTRUCTION_NODE;
}

/** The slice of a DOM `Element` the cleaner uses. Real elements satisfy it; so do test doubles. */
export type SvgElementLike = {
	readonly localName: string;
	readonly namespaceURI: string | null;
	readonly attributes: ArrayLike<{ readonly name: string; readonly value: string }>;
	readonly children: ArrayLike<SvgElementLike>;
	/** Every child, including text, comments and processing instructions. */
	readonly childNodes: ArrayLike<{ readonly nodeType: number; remove(): void }>;
	getAttribute(name: string): string | null;
	removeAttribute(name: string): void;
	remove(): void;
};

/**
 * Applies the rules above to an element and everything inside it. This edits the tree it is
 * given, which is always a private copy that `sanitizeSvg` has just parsed.
 */
export function cleanSvgElement(element: SvgElementLike): void {
	for (const attribute of Array.from(element.attributes)) {
		if (shouldRemoveAttribute(attribute.name, attribute.value, element.localName)) {
			element.removeAttribute(attribute.name);
		}
	}
	for (const node of Array.from(element.childNodes)) {
		if (shouldRemoveNodeType(node.nodeType)) {
			node.remove();
		}
	}
	for (const child of Array.from(element.children)) {
		const facts = { localName: child.localName, namespaceURI: child.namespaceURI, animatedAttribute: child.getAttribute("attributeName") };
		if (shouldRemoveElement(facts)) {
			child.remove();
		} else {
			cleanSvgElement(child);
		}
	}
}

export type SvgSizeAttributes = { width: string | null; height: string | null; viewBox: string | null };

function isFixedLength(value: string | null) {
	return Boolean(value?.trim()) && !value?.includes("%") && value?.trim() !== "auto";
}

/**
 * The width and height to write onto an <svg> that declares no fixed size but has a viewBox.
 * Some browsers cannot draw a size-less SVG onto a canvas, which is how the sketch renders
 * images. Null when the size is already fixed, or when there is no viewBox to take it from.
 */
export function missingSvgSize(attributes: SvgSizeAttributes): { width: number; height: number } | null {
	if (isFixedLength(attributes.width) && isFixedLength(attributes.height)) return null;

	const box = attributes.viewBox?.trim().split(/[\s,]+/).map(Number) ?? [];
	const [, , width, height] = box;
	return box.length === 4 && box.every(Number.isFinite) && width > 0 && height > 0 ? { width, height } : null;
}

function escapeXmlText(text: string) {
	return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/**
 * Rewrites CDATA sections in serialised markup as ordinary escaped text, which means the same
 * thing to an XML reader. Left as CDATA, their contents would be read as markup by an HTML one.
 */
export function flattenCdata(markup: string): string {
	return markup.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_section, text: string) => escapeXmlText(text));
}

/** A last check on cleaned markup: true if a script or foreignObject tag is still present. */
export function containsBlockedSvgTag(markup: string): boolean {
	return BLOCKED_TAG.test(markup);
}

export type SvgSanitizeResult = { ok: true; svg: string } | { ok: false; message: string };

/**
 * Parses SVG text, requires a real <svg> document, removes everything `shouldRemoveElement`
 * and `shouldRemoveAttribute` name, drops comments and processing instructions, gives the
 * drawing a fixed size if it only has a viewBox, and returns the cleaned markup. Only the root
 * element is written back out, so a doctype or stylesheet instruction before it is dropped too.
 * Refuses the file (rather than passing it through) when the browser cannot parse XML.
 */
export function sanitizeSvg(markup: string): SvgSanitizeResult {
	if (typeof DOMParser === "undefined" || typeof XMLSerializer === "undefined") {
		return { ok: false, message: UPLOAD_MESSAGES.noSvgSupport };
	}

	// Trimmed because an XML declaration must be the very first thing in the text.
	const parsed = new DOMParser().parseFromString(markup.trim(), SVG_MIME_TYPE);
	const root = parsed.documentElement;
	const isSvgDocument = root?.localName === "svg" && root.namespaceURI === SVG_NAMESPACE;
	if (!isSvgDocument || parsed.getElementsByTagName("parsererror").length > 0) {
		return { ok: false, message: UPLOAD_MESSAGES.invalidSvg };
	}

	cleanSvgElement(root);
	const size = missingSvgSize({ width: root.getAttribute("width"), height: root.getAttribute("height"), viewBox: root.getAttribute("viewBox") });
	if (size) {
		root.setAttribute("width", String(size.width));
		root.setAttribute("height", String(size.height));
	}
	const svg = flattenCdata(new XMLSerializer().serializeToString(root));
	return containsBlockedSvgTag(svg) ? { ok: false, message: UPLOAD_MESSAGES.invalidSvg } : { ok: true, svg };
}
