import { expect, test } from "bun:test";

import {
	checkUpload,
	cleanSvgElement,
	containsBlockedSvgTag,
	flattenCdata,
	formatBytes,
	isEventHandlerAttribute,
	isLinkAttribute,
	isSafeHref,
	MAX_FILES_PER_UPLOAD,
	MAX_RASTER_BYTES,
	MAX_SVG_BYTES,
	missingSvgSize,
	resolveUploadType,
	sanitizeSvg,
	shouldRemoveAttribute,
	shouldRemoveElement,
	shouldRemoveNodeType,
	summarizeUpload,
	takeUploadBatch,
	UPLOAD_ACCEPT,
	UPLOAD_MESSAGES,
	type SvgElementLike,
} from "../src/lib/upload-image";

const SVG_NS = "http://www.w3.org/2000/svg";
const XHTML_NS = "http://www.w3.org/1999/xhtml";
const MB = 1024 * 1024;

// A minimal stand-in for a DOM element, so the tree walk runs without a browser.
type FakeNode = { nodeType: number; remove(): void };
type FakeElement = SvgElementLike & {
	attributes: { name: string; value: string }[];
	children: FakeElement[];
	childNodes: FakeNode[];
	parent: FakeElement | null;
};

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const PROCESSING_INSTRUCTION_NODE = 7;
const COMMENT_NODE = 8;

function el(localName: string, attributes: Record<string, string> = {}, children: FakeElement[] = [], namespaceURI: string | null = SVG_NS): FakeElement {
	const element: FakeElement = {
		localName,
		namespaceURI,
		attributes: Object.entries(attributes).map(([name, value]) => ({ name, value })),
		children,
		childNodes: children.map((child) => ({ nodeType: ELEMENT_NODE, remove: child.remove })),
		parent: null,
		getAttribute: (name) => element.attributes.find((attribute) => attribute.name === name)?.value ?? null,
		removeAttribute: (name) => {
			element.attributes = element.attributes.filter((attribute) => attribute.name !== name);
		},
		remove: () => {
			if (element.parent) {
				element.parent.children = element.parent.children.filter((child) => child !== element);
			}
		},
	};
	for (const child of children) {
		child.parent = element;
	}
	return element;
}

/** Adds a comment, processing instruction or text node to a fake element. */
function withNode(element: FakeElement, nodeType: number): FakeElement {
	const node: FakeNode = {
		nodeType,
		remove: () => {
			element.childNodes = element.childNodes.filter((candidate) => candidate !== node);
		},
	};
	element.childNodes = [...element.childNodes, node];
	return element;
}

/** A compact picture of a fake tree: `svg[viewBox](g(path[d]))`. */
function outline(element: FakeElement): string {
	const attributes = element.attributes.length > 0 ? `[${element.attributes.map((attribute) => attribute.name).join(",")}]` : "";
	const children = element.children.length > 0 ? `(${element.children.map(outline).join(",")})` : "";
	return `${element.localName}${attributes}${children}`;
}

test("accepts the same image types the file picker offers", () => {
	expect(UPLOAD_ACCEPT).toBe("image/svg+xml,image/png,image/jpeg,image/webp,image/gif");
	expect(checkUpload({ name: "logo.svg", type: "image/svg+xml", size: 2000 })).toEqual({ ok: true, kind: "svg" });
	expect(checkUpload({ name: "photo.jpg", type: "image/jpeg", size: 2000 })).toEqual({ ok: true, kind: "raster", mimeType: "image/jpeg", keepTransparency: false });
});

test("keeps transparency for PNG, WebP and GIF but not for JPEG", () => {
	const transparency = (type: string) => {
		const check = checkUpload({ name: "image", type, size: 10 });
		return check.ok && check.kind === "raster" ? check.keepTransparency : null;
	};

	expect(transparency("image/png")).toBe(true);
	expect(transparency("image/webp")).toBe(true);
	expect(transparency("image/gif")).toBe(true);
	expect(transparency("image/jpeg")).toBe(false);
});

test("falls back to the file extension when the browser reports no type", () => {
	expect(resolveUploadType({ name: "Diagram.SVG", type: "" })).toBe("image/svg+xml");
	expect(resolveUploadType({ name: "holiday.photo.JPEG", type: "" })).toBe("image/jpeg");
	expect(resolveUploadType({ name: "README", type: "" })).toBeNull();
	expect(resolveUploadType({ name: "notes.txt", type: "" })).toBeNull();
	expect(resolveUploadType({ name: "icon.webp", type: "application/octet-stream" })).toBe("image/webp");
	expect(resolveUploadType({ name: "archive.zip", type: "application/octet-stream" })).toBeNull();
});

test("trusts a declared type over a misleading extension", () => {
	expect(resolveUploadType({ name: "invoice.png", type: "application/pdf" })).toBeNull();
	expect(resolveUploadType({ name: "picture", type: "IMAGE/PNG" })).toBe("image/png");
});

test("rejects files that are not images, in plain language", () => {
	for (const file of [
		{ name: "report.pdf", type: "application/pdf", size: 100 },
		{ name: "photo.heic", type: "image/heic", size: 100 },
		{ name: "icon.bmp", type: "image/bmp", size: 100 },
		{ name: "script.js", type: "", size: 100 },
	]) {
		expect(checkUpload(file)).toEqual({ ok: false, message: UPLOAD_MESSAGES.unsupported });
	}
});

test("rejects an empty file", () => {
	expect(checkUpload({ name: "blank.png", type: "image/png", size: 0 })).toEqual({ ok: false, message: UPLOAD_MESSAGES.empty });
});

test("limits SVG files to 1 MB and other images to 15 MB, inclusive", () => {
	expect(MAX_SVG_BYTES).toBe(MB);
	expect(MAX_RASTER_BYTES).toBe(15 * MB);

	expect(checkUpload({ name: "a.svg", type: "image/svg+xml", size: MB }).ok).toBe(true);
	expect(checkUpload({ name: "a.svg", type: "image/svg+xml", size: MB + 1 })).toEqual({
		ok: false,
		message: "Too large (1 MB). SVG files can be up to 1 MB.",
	});
	expect(checkUpload({ name: "a.png", type: "image/png", size: 15 * MB }).ok).toBe(true);
	expect(checkUpload({ name: "a.png", type: "image/png", size: 18.4 * MB })).toEqual({
		ok: false,
		message: "Too large (18.4 MB). Images can be up to 15 MB.",
	});
});

test("writes file sizes the way people say them", () => {
	expect(formatBytes(512)).toBe("512 bytes");
	expect(formatBytes(340 * 1024)).toBe("340 KB");
	expect(formatBytes(MB)).toBe("1 MB");
	expect(formatBytes(2.5 * MB)).toBe("2.5 MB");
	expect(formatBytes(MB - 1)).toBe("1 MB");
});

test("takes at most the batch limit from one selection and reports the rest", () => {
	const files = Array.from({ length: MAX_FILES_PER_UPLOAD + 3 }, (_, index) => `file-${index}`);
	const batch = takeUploadBatch(files);

	expect(batch.accepted).toHaveLength(MAX_FILES_PER_UPLOAD);
	expect(batch.skipped).toEqual([`file-${MAX_FILES_PER_UPLOAD}`, `file-${MAX_FILES_PER_UPLOAD + 1}`, `file-${MAX_FILES_PER_UPLOAD + 2}`]);
	expect(takeUploadBatch(["a", "b"])).toEqual({ accepted: ["a", "b"], skipped: [] });
	expect(files).toHaveLength(MAX_FILES_PER_UPLOAD + 3);
});

test("summarises a finished batch in one sentence", () => {
	const failure = { name: "x.pdf", message: UPLOAD_MESSAGES.unsupported };

	expect(summarizeUpload({ added: 0, failures: [] })).toBe("");
	expect(summarizeUpload({ added: 1, failures: [] })).toBe("Added 1 image.");
	expect(summarizeUpload({ added: 3, failures: [] })).toBe("Added 3 images.");
	expect(summarizeUpload({ added: 0, failures: [failure] })).toBe("That file could not be added.");
	expect(summarizeUpload({ added: 0, failures: [failure, failure] })).toBe("None of the 2 files could be added.");
	expect(summarizeUpload({ added: 2, failures: [failure] })).toBe("Added 2 images. 1 file was left out.");
	expect(summarizeUpload({ added: 1, failures: [failure, failure] })).toBe("Added 1 image. 2 files were left out.");
});

test("recognises event-handler attributes whatever their case", () => {
	for (const name of ["onload", "onclick", "ONERROR", "onBegin", " onmouseover"]) {
		expect(isEventHandlerAttribute(name)).toBe(true);
	}
	for (const name of ["opacity", "d", "points", "orient", "offset", "xlink:href", "font-family"]) {
		expect(isEventHandlerAttribute(name)).toBe(false);
	}
});

test("recognises link attributes with or without a namespace prefix", () => {
	expect(isLinkAttribute("href")).toBe(true);
	expect(isLinkAttribute("xlink:href")).toBe(true);
	expect(isLinkAttribute("XLINK:HREF")).toBe(true);
	expect(isLinkAttribute("x:href")).toBe(true);
	expect(isLinkAttribute(" href ")).toBe(true);
	expect(isLinkAttribute("hreflang")).toBe(false);
	expect(isLinkAttribute("")).toBe(false);
});

test("allows links only to a fragment of the same file or, on an image, to embedded picture data", () => {
	for (const value of ["#gradient-1", "  #a"]) {
		expect(isSafeHref(value)).toBe(true);
		expect(isSafeHref(value, "use")).toBe(true);
	}
	for (const value of ["data:image/png;base64,iVBORw0KGgo=", "DATA:IMAGE/SVG+XML,%3Csvg/%3E", "data:image/jpeg;base64,/9j/"]) {
		expect(isSafeHref(value, "image")).toBe(true);
		expect(isSafeHref(value, "feImage")).toBe(true);
		// A <use> or <a> pointing at embedded data would import or open a whole other document.
		expect(isSafeHref(value, "use")).toBe(false);
		expect(isSafeHref(value, "a")).toBe(false);
		expect(isSafeHref(value)).toBe(false);
	}
	for (const value of [
		"javascript:alert(1)",
		" JaVaScRiPt:alert(1)",
		"java\nscript:alert(1)",
		"https://example.com/tracker.png",
		"//example.com/sprite.svg#icon",
		"other.svg#icon",
		"data:text/html,<script>alert(1)</script>",
		"data:application/javascript,alert(1)",
		"data:image/",
		"",
	]) {
		expect(isSafeHref(value)).toBe(false);
		expect(isSafeHref(value, "image")).toBe(false);
	}
});

test("decides which attributes are removed", () => {
	expect(shouldRemoveAttribute("onload", "alert(1)")).toBe(true);
	expect(shouldRemoveAttribute("xlink:href", "javascript:alert(1)")).toBe(true);
	expect(shouldRemoveAttribute("href", "https://example.com")).toBe(true);
	expect(shouldRemoveAttribute("href", "#clip")).toBe(false);
	expect(shouldRemoveAttribute("xlink:href", "data:image/png;base64,AAAA", "image")).toBe(false);
	expect(shouldRemoveAttribute("xlink:href", "data:image/svg+xml,%3Csvg/%3E#x", "use")).toBe(true);
	expect(shouldRemoveAttribute("fill", "url(#gradient)")).toBe(false);
	expect(shouldRemoveAttribute("viewBox", "0 0 24 24")).toBe(false);
});

test("decides which elements are removed whole", () => {
	expect(shouldRemoveElement({ localName: "script", namespaceURI: SVG_NS })).toBe(true);
	expect(shouldRemoveElement({ localName: "SCRIPT", namespaceURI: null })).toBe(true);
	expect(shouldRemoveElement({ localName: "script", namespaceURI: XHTML_NS })).toBe(true);
	expect(shouldRemoveElement({ localName: "foreignObject", namespaceURI: SVG_NS })).toBe(true);
	expect(shouldRemoveElement({ localName: "iframe", namespaceURI: XHTML_NS })).toBe(true);
	expect(shouldRemoveElement({ localName: "set", namespaceURI: SVG_NS, animatedAttribute: "xlink:href" })).toBe(true);
	expect(shouldRemoveElement({ localName: "animate", namespaceURI: SVG_NS, animatedAttribute: "href" })).toBe(true);
	expect(shouldRemoveElement({ localName: "animate", namespaceURI: SVG_NS, animatedAttribute: " href" })).toBe(true);
	expect(shouldRemoveElement({ localName: "set", namespaceURI: SVG_NS, animatedAttribute: "onclick" })).toBe(true);

	expect(shouldRemoveElement({ localName: "animate", namespaceURI: SVG_NS, animatedAttribute: "opacity" })).toBe(false);
	expect(shouldRemoveElement({ localName: "path", namespaceURI: SVG_NS })).toBe(false);
	expect(shouldRemoveElement({ localName: "style", namespaceURI: SVG_NS })).toBe(false);
	expect(shouldRemoveElement({ localName: "a", namespaceURI: SVG_NS, animatedAttribute: null })).toBe(false);
});

test("leaves an ordinary drawing untouched", () => {
	const drawing = el("svg", { viewBox: "0 0 24 24", width: "24" }, [
		el("defs", {}, [el("linearGradient", { id: "g" }, [el("stop", { offset: "0" })])]),
		el("g", { fill: "url(#g)" }, [el("path", { d: "M0 0h24v24H0z" }), el("use", { "xlink:href": "#shape" })]),
	]);

	cleanSvgElement(drawing);

	expect(outline(drawing)).toBe("svg[viewBox,width](defs(linearGradient[id](stop[offset])),g[fill](path[d],use[xlink:href]))");
});

test("removes scripts, foreignObject, event handlers and outside links at any depth", () => {
	const hostile = el("svg", { viewBox: "0 0 10 10", onload: "alert(1)" }, [
		el("script", {}, []),
		el("g", { onclick: "steal()" }, [
			el("foreignObject", { width: "10" }, [el("div", { onclick: "x()" }, [], XHTML_NS)]),
			el("a", { href: "javascript:alert(1)" }, [el("rect", { width: "5", ONMOUSEOVER: "x()" })]),
			el("image", { "xlink:href": "https://example.com/pixel.png", width: "1" }),
			el("image", { href: "data:image/png;base64,AAAA" }),
			el("use", { href: "data:image/svg+xml,%3Csvg id='x'%3E%3C/svg%3E#x", x: "1" }),
			el("g", {}, [el("script", { "xlink:href": "https://example.com/evil.js" })]),
		]),
	]);

	cleanSvgElement(hostile);

	expect(outline(hostile)).toBe("svg[viewBox](g(a(rect[width]),image[width],image[href],use[x],g))");
});

test("removes HTML elements placed straight into the drawing, and animations that rewrite a link", () => {
	const hostile = el("svg", {}, [
		el("iframe", { src: "javascript:alert(1)" }, [], XHTML_NS),
		el("a", { href: "#top" }, [
			el("set", { attributeName: "xlink:href", to: "javascript:alert(1)" }),
			el("animate", { attributeName: "href", values: "javascript:alert(1)" }),
			el("animate", { attributeName: "opacity", values: "0;1" }),
		]),
	]);

	cleanSvgElement(hostile);

	expect(outline(hostile)).toBe("svg(a[href](animate[attributeName,values]))");
});

test("takes a fixed size from the viewBox when a drawing declares none", () => {
	expect(missingSvgSize({ width: null, height: null, viewBox: "0 0 128 128" })).toEqual({ width: 128, height: 128 });
	expect(missingSvgSize({ width: "100%", height: "100%", viewBox: "0,0,640,480" })).toEqual({ width: 640, height: 480 });
	expect(missingSvgSize({ width: "24", height: null, viewBox: " 0 0 48.5 24 " })).toEqual({ width: 48.5, height: 24 });
	expect(missingSvgSize({ width: "auto", height: "10", viewBox: "0 0 20 10" })).toEqual({ width: 20, height: 10 });
});

test("leaves the size alone when it is already fixed or there is nothing to take it from", () => {
	expect(missingSvgSize({ width: "24", height: "24", viewBox: "0 0 48 48" })).toBeNull();
	expect(missingSvgSize({ width: "10mm", height: "5mm", viewBox: null })).toBeNull();
	expect(missingSvgSize({ width: null, height: null, viewBox: null })).toBeNull();
	expect(missingSvgSize({ width: null, height: null, viewBox: "0 0 0 10" })).toBeNull();
	expect(missingSvgSize({ width: null, height: null, viewBox: "0 0 abc 10" })).toBeNull();
	expect(missingSvgSize({ width: null, height: null, viewBox: "0 0 10" })).toBeNull();
});

test("drops comments and processing instructions but keeps text", () => {
	expect(shouldRemoveNodeType(COMMENT_NODE)).toBe(true);
	expect(shouldRemoveNodeType(PROCESSING_INSTRUCTION_NODE)).toBe(true);
	expect(shouldRemoveNodeType(TEXT_NODE)).toBe(false);
	expect(shouldRemoveNodeType(ELEMENT_NODE)).toBe(false);

	const inner = withNode(withNode(el("title"), TEXT_NODE), COMMENT_NODE);
	const drawing = withNode(withNode(el("svg", {}, [inner]), PROCESSING_INSTRUCTION_NODE), COMMENT_NODE);

	cleanSvgElement(drawing);

	expect(drawing.childNodes.map((node) => node.nodeType)).toEqual([ELEMENT_NODE]);
	expect(inner.childNodes.map((node) => node.nodeType)).toEqual([TEXT_NODE]);
});

test("rewrites CDATA sections as escaped text, so an HTML reader cannot take them for markup", () => {
	expect(flattenCdata("<title><![CDATA[</title><img src=x onerror=alert(1)>]]></title>")).toBe(
		"<title>&lt;/title&gt;&lt;img src=x onerror=alert(1)&gt;</title>",
	);
	expect(flattenCdata("<style><![CDATA[a > b { fill: red } /* R&D */]]></style>")).toBe("<style>a &gt; b { fill: red } /* R&amp;D */</style>");
	expect(flattenCdata("<a><![CDATA[one]]></a><b><![CDATA[two\nlines]]></b>")).toBe("<a>one</a><b>two\nlines</b>");
	expect(flattenCdata('<svg><path d="M0 0"/></svg>')).toBe('<svg><path d="M0 0"/></svg>');
});

test("spots a script or foreignObject tag left in markup, with or without a prefix", () => {
	for (const markup of ["<svg><script>alert(1)</script></svg>", "<svg><SCRIPT/></svg>", "<svg><html:script xmlns:html='x'/></svg>", "<svg>< script></svg>", "<svg><foreignObject/></svg>"]) {
		expect(containsBlockedSvgTag(markup)).toBe(true);
	}
	for (const markup of ['<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>', "<svg><desc>about scripts &lt;script&gt;</desc></svg>", "<svg><g id=\"scripted\"/></svg>"]) {
		expect(containsBlockedSvgTag(markup)).toBe(false);
	}
});

test("refuses an SVG rather than passing it through when it cannot be parsed here", () => {
	// Bun has no DOMParser, which is exactly the case this guards: fail closed.
	expect(typeof DOMParser).toBe("undefined");
	expect(sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')).toEqual({
		ok: false,
		message: UPLOAD_MESSAGES.noSvgSupport,
	});
});
