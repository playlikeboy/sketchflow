import { expect, test } from "bun:test";

import { svgDimensions } from "../src/lib/canvas-insert-geometry";
import {
	SIMPLE_ICONS_INDEX_URL,
	SIMPLE_ICONS_VERSION,
	colourSimpleIcon,
	contrastRatio,
	createSimpleIconsIndexLoader,
	fetchSimpleIconSvg,
	isVisibleOnCanvas,
	parseSimpleIconsIndex,
	resolveLogoColour,
	searchSimpleIcons,
	simpleIconUrl,
	titleToSlug,
	type SimpleIcon,
} from "../src/lib/simple-icons";

// The exact shape of icons/dotnet.svg in the pinned release: one path, no fill, no size.
const DOTNET_SVG =
	'<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>.NET</title><path d="M24 8.77h-2.468v7.565Z"/></svg>';

function icon(title: string, slug: string, hex = "000000", aliases: string[] = []): SimpleIcon {
	return { title, slug, hex, aliases };
}

const INDEX: SimpleIcon[] = [
	icon(".NET", "dotnet", "512BD4"),
	icon("AT&T", "atandt", "009FDB"),
	icon("C", "c", "A8B9CC"),
	icon("C++", "cplusplus", "00599C"),
	icon("Dassault Systèmes", "dassaultsystemes", "005386"),
	icon("Docker", "docker", "2496ED"),
	icon("GitHub", "github", "181717"),
	icon("GitHub Actions", "githubactions", "2088FF"),
	icon("Node.js", "nodedotjs", "5FA04E"),
	icon("React", "react", "61DAFB"),
	icon("Reactos", "reactos", "0088CC"),
	icon("Tailwind CSS", "tailwindcss", "06B6D4"),
	icon("Preact", "preact", "673AB8"),
	icon("X", "x", "000000", ["Twitter"]),
	icon("AFDIAN", "afdian", "946CE6", ["爱发电"]),
];

function titles(icons: readonly SimpleIcon[]) {
	return icons.map((entry) => entry.title);
}

function jsonResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("pins one exact Simple Icons release for the index and every icon", () => {
	expect(SIMPLE_ICONS_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
	expect(SIMPLE_ICONS_INDEX_URL).toBe(`https://cdn.jsdelivr.net/npm/simple-icons@${SIMPLE_ICONS_VERSION}/data/simple-icons.json`);
	expect(simpleIconUrl("nodedotjs")).toBe(`https://cdn.jsdelivr.net/npm/simple-icons@${SIMPLE_ICONS_VERSION}/icons/nodedotjs.svg`);
});

test("keeps an unexpected slug from changing the icon path", () => {
	expect(simpleIconUrl("../package.json")).toBe(
		`https://cdn.jsdelivr.net/npm/simple-icons@${SIMPLE_ICONS_VERSION}/icons/..%2Fpackage.json.svg`,
	);
});

test("derives slugs with the official Simple Icons rules", () => {
	// Each pair is a real title and its real file name in the pinned release.
	expect(titleToSlug(".NET")).toBe("dotnet");
	expect(titleToSlug("C++")).toBe("cplusplus");
	expect(titleToSlug("AT&T")).toBe("atandt");
	expect(titleToSlug("Dassault Systèmes")).toBe("dassaultsystemes");
	expect(titleToSlug("Node.js")).toBe("nodedotjs");
	expect(titleToSlug("1.1.1.1")).toBe("1dot1dot1dot1");
	expect(titleToSlug("shadcn/ui")).toBe("shadcnui");
	expect(titleToSlug("Tailwind CSS")).toBe("tailwindcss");
	// The rules predate some removed brands; they still apply to any title.
	expect(titleToSlug("Adobe After Effects")).toBe("adobeaftereffects");
});

test("replaces letters that Unicode cannot decompose", () => {
	expect(titleToSlug("Łódź Straße Ørsted")).toBe("lodzstrasseorsted");
});

test("reads the index, flattening every kind of alias", () => {
	const index = parseSimpleIconsIndex([
		{ title: ".NET", slug: "dotnet", hex: "512BD4", source: "https://example.com" },
		{ title: "Ameba", slug: "ameba", hex: "2D8C3C", aliases: { aka: ["Ameblo"], loc: { "ja-JP": "アメブロ" } } },
		{ title: "Activeloop", slug: "activeloop", hex: "5723EE", aliases: { dup: [{ title: "Deep Lake", hex: "5723EE" }], old: ["Snark"] } },
	]);

	expect(index).toEqual([
		{ title: ".NET", slug: "dotnet", hex: "512BD4", aliases: [] },
		{ title: "Ameba", slug: "ameba", hex: "2D8C3C", aliases: ["Ameblo", "アメブロ"] },
		{ title: "Activeloop", slug: "activeloop", hex: "5723EE", aliases: ["Snark", "Deep Lake"] },
	]);
});

test("keeps a disambiguated slug, and derives one only when the entry has none", () => {
	const index = parseSimpleIconsIndex([
		{ title: "Hive", slug: "hive_blockchain", hex: "E31337" },
		{ title: "C++", hex: "00599c" },
	]);

	expect(index.map((entry) => entry.slug)).toEqual(["hive_blockchain", "cplusplus"]);
	expect(index[1].hex).toBe("00599C");
});

test("skips entries that could not be drawn or fetched safely", () => {
	const index = parseSimpleIconsIndex([
		{ title: "Good", slug: "good", hex: "123456" },
		{ title: "No colour", slug: "nocolour" },
		{ title: "Bad colour", slug: "badcolour", hex: "red" },
		{ title: "Bad slug", slug: "../../evil", hex: "123456" },
		{ slug: "untitled", hex: "123456" },
		"not an entry",
		null,
	]);

	expect(titles(index)).toEqual(["Good"]);
});

test("rejects an index that is not a list of icons", () => {
	expect(() => parseSimpleIconsIndex({ icons: [] })).toThrow();
	expect(() => parseSimpleIconsIndex([{ nothing: true }])).toThrow();
});

test("loads the index once and shares it for the session", async () => {
	const requested: string[] = [];
	const load = createSimpleIconsIndexLoader(async (url) => {
		requested.push(url);
		return jsonResponse([{ title: "React", slug: "react", hex: "61DAFB" }]);
	});

	const [first, second] = await Promise.all([load(), load()]);
	const third = await load();

	expect(requested).toEqual([SIMPLE_ICONS_INDEX_URL]);
	expect(first).toBe(second);
	expect(third).toBe(first);
	expect(titles(first)).toEqual(["React"]);
});

test("does not remember a failed load, so a retry can succeed", async () => {
	let attempts = 0;
	const load = createSimpleIconsIndexLoader(async () => {
		attempts += 1;
		return attempts === 1 ? jsonResponse({ message: "nope" }, 503) : jsonResponse([{ title: "React", slug: "react", hex: "61DAFB" }]);
	});

	await expect(load()).rejects.toThrow();
	expect(titles(await load())).toEqual(["React"]);
	expect(attempts).toBe(2);
});

test("fetches one icon's SVG from the pinned release", async () => {
	const requested: string[] = [];
	const svg = await fetchSimpleIconSvg("dotnet", async (url) => {
		requested.push(url);
		return new Response(`${DOTNET_SVG}\n`);
	});

	expect(requested).toEqual([simpleIconUrl("dotnet")]);
	expect(svg).toBe(DOTNET_SVG);
});

test("refuses a missing icon or a response that is not a plain SVG drawing", async () => {
	await expect(fetchSimpleIconSvg("gone", async () => new Response("Not found", { status: 404 }))).rejects.toThrow();
	await expect(fetchSimpleIconSvg("page", async () => new Response("<!doctype html><html></html>"))).rejects.toThrow();
	await expect(
		fetchSimpleIconSvg("script", async () => new Response('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')),
	).rejects.toThrow();
	await expect(
		fetchSimpleIconSvg("handler", async () => new Response('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><path d="M0 0"/></svg>')),
	).rejects.toThrow();
});

test("refuses an SVG holding anything but a title and a path", async () => {
	const wrap = (inner: string) => async () => new Response(`<svg xmlns="http://www.w3.org/2000/svg">${inner}</svg>`);

	await expect(fetchSimpleIconSvg("ok", wrap('<title>A &amp; B</title><path d="M0 0h1z"/>'))).resolves.toContain("<path");
	await expect(fetchSimpleIconSvg("style", wrap('<style>@import url("https://example.com/x.css");</style>'))).rejects.toThrow();
	await expect(fetchSimpleIconSvg("image", wrap('<image href="https://example.com/x.png"/>'))).rejects.toThrow();
	await expect(fetchSimpleIconSvg("link", wrap('<a href="https://example.com"><path d="M0 0"/></a>'))).rejects.toThrow();
	await expect(fetchSimpleIconSvg("entity", wrap('<!ENTITY x "y"><path d="M0 0"/>'))).rejects.toThrow();
	await expect(fetchSimpleIconSvg("comment", wrap('<!-- note --><path d="M0 0"/>'))).rejects.toThrow();
});

test("an empty search lists well-known developer brands first, then everything else in order", () => {
	const results = searchSimpleIcons(INDEX, "");

	expect(titles(results).slice(0, 6)).toEqual(["GitHub", "React", "Node.js", "Docker", "Tailwind CSS", "X"]);
	expect(results).toHaveLength(INDEX.length);
	expect(titles(results).slice(6, 9)).toEqual([".NET", "AT&T", "C"]);
	expect(titles(searchSimpleIcons(INDEX, "   "))).toEqual(titles(results));
});

test("limits the number of results", () => {
	expect(searchSimpleIcons(INDEX, "", 3)).toHaveLength(3);
	expect(titles(searchSimpleIcons(INDEX, "react", 1))).toEqual(["React"]);
	expect(searchSimpleIcons(INDEX, "react", 0)).toEqual([]);
});

test("ranks an exact title first, then prefixes, then matches inside the name", () => {
	expect(titles(searchSimpleIcons(INDEX, "react"))).toEqual(["React", "Reactos", "Preact"]);
	expect(titles(searchSimpleIcons(INDEX, "git"))).toEqual(["GitHub", "GitHub Actions"]);
});

test("ranks the start of a later word above a match in the middle of a word", () => {
	const index = [icon("PostCSS", "postcss"), icon("Tailwind CSS", "tailwindcss"), icon("CSS", "css")];

	expect(titles(searchSimpleIcons(index, "css"))).toEqual(["CSS", "Tailwind CSS", "PostCSS"]);
});

test("ignores case and accents", () => {
	expect(titles(searchSimpleIcons(INDEX, "DOCKER"))).toEqual(["Docker"]);
	expect(titles(searchSimpleIcons(INDEX, "dassault systemes"))).toEqual(["Dassault Systèmes"]);
	expect(titles(searchSimpleIcons(INDEX, "Systèmes"))).toEqual(["Dassault Systèmes"]);
});

test("finds awkward titles however they are typed", () => {
	expect(titles(searchSimpleIcons(INDEX, ".net"))).toEqual([".NET"]);
	expect(titles(searchSimpleIcons(INDEX, "dotnet"))).toEqual([".NET"]);
	expect(titles(searchSimpleIcons(INDEX, "c++"))).toEqual(["C++"]);
	expect(titles(searchSimpleIcons(INDEX, "cplusplus"))).toEqual(["C++"]);
	expect(titles(searchSimpleIcons(INDEX, "at&t"))).toEqual(["AT&T"]);
	expect(titles(searchSimpleIcons(INDEX, "nodejs"))).toEqual(["Node.js"]);
	expect(titles(searchSimpleIcons(INDEX, "node js"))).toEqual(["Node.js"]);
	expect(titles(searchSimpleIcons(INDEX, "tailwindcss"))).toEqual(["Tailwind CSS"]);
});

test("matches aliases, including names in other scripts, below title matches", () => {
	const index = [icon("X", "x", "000000", ["Twitter"]), icon("Twitterrific", "twitterrific"), icon("AFDIAN", "afdian", "946CE6", ["爱发电"])];

	expect(titles(searchSimpleIcons(index, "twitter"))).toEqual(["Twitterrific", "X"]);
	expect(titles(searchSimpleIcons(index, "爱发电"))).toEqual(["AFDIAN"]);
});

test("returns nothing when no brand matches", () => {
	expect(searchSimpleIcons(INDEX, "zzzz-not-a-brand")).toEqual([]);
});

test("does not change the index it searches", () => {
	const before = JSON.stringify(INDEX);
	searchSimpleIcons(INDEX, "react");
	searchSimpleIcons(INDEX, "");

	expect(JSON.stringify(INDEX)).toBe(before);
});

test("colours an icon by setting the fill on the root element, and gives it a size", () => {
	const coloured = colourSimpleIcon(DOTNET_SVG, "512BD4");

	expect(coloured).toStartWith('<svg fill="#512BD4" width="256" height="256" role="img" viewBox="0 0 24 24"');
	expect(coloured).toEndWith('<path d="M24 8.77h-2.468v7.565Z"/></svg>');
	expect(coloured.match(/<svg\b/g)).toHaveLength(1);
});

test("replaces a fill and a size the icon already declares, without touching the drawing", () => {
	const coloured = colourSimpleIcon(
		'<svg fill="red" width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" stroke-width="2" d="M0 0h24v24z"/></svg>',
		"#fff",
	);

	expect(coloured).toBe(
		'<svg fill="#ffffff" width="256" height="256" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" stroke-width="2" d="M0 0h24v24z"/></svg>',
	);
});

test("sizes a wide icon by its longest side", () => {
	const coloured = colourSimpleIcon('<svg viewBox="0 0 48 24" xmlns="http://www.w3.org/2000/svg"><path d="M0 0h48v24z"/></svg>', "#000000");

	expect(coloured).toStartWith('<svg fill="#000000" width="256" height="128" viewBox="0 0 48 24"');
});

test("the coloured icon is read back at its new size and proportions", () => {
	expect(svgDimensions(colourSimpleIcon(DOTNET_SVG, "512BD4"))).toEqual({ width: 256, height: 256 });
});

test("refuses to colour with anything but a hex colour, or to colour something that is not an SVG", () => {
	expect(() => colourSimpleIcon(DOTNET_SVG, 'red" onload="alert(1)')).toThrow();
	expect(() => colourSimpleIcon(DOTNET_SVG, "rebeccapurple")).toThrow();
	expect(() => colourSimpleIcon("<p>not an icon</p>", "#000000")).toThrow();
});

test("measures contrast the way WCAG does", () => {
	expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
	expect(contrastRatio("ffffff", "#000")).toBeCloseTo(21, 5);
	expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
	expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
});

test("treats very dark brand colours as invisible on a dark canvas", () => {
	expect(isVisibleOnCanvas("181717", "#000000")).toBe(false); // GitHub
	expect(isVisibleOnCanvas("000000", "#000000")).toBe(false); // Vercel, X, Next.js
	expect(isVisibleOnCanvas("2D3748", "#000000")).toBe(false); // Prisma
	expect(isVisibleOnCanvas("512BD4", "#000000")).toBe(true); // .NET
	expect(isVisibleOnCanvas("61DAFB", "#000000")).toBe(true); // React
});

test("treats very light brand colours as invisible on a light canvas", () => {
	expect(isVisibleOnCanvas("FFFFFF", "#ffffff")).toBe(false);
	expect(isVisibleOnCanvas("FFFC00", "#ffffff")).toBe(false); // Snapchat-style yellow
	expect(isVisibleOnCanvas("F7DF1E", "#ffffff")).toBe(true); // JavaScript
	expect(isVisibleOnCanvas("61DAFB", "#ffffff")).toBe(true); // React
	expect(isVisibleOnCanvas("181717", "#ffffff")).toBe(true); // GitHub
});

test("treats a colour it cannot read as invisible", () => {
	expect(isVisibleOnCanvas("not-a-colour", "#ffffff")).toBe(false);
});

test("uses the brand colour when it shows up on the canvas", () => {
	expect(resolveLogoColour("2496ED", "brand", true)).toEqual({ colour: "#2496ED", isFallback: false });
	expect(resolveLogoColour("2496ED", "brand", false)).toEqual({ colour: "#2496ED", isFallback: false });
});

test("falls back to white on dark and near-black on light when the brand colour would vanish", () => {
	expect(resolveLogoColour("181717", "brand", true)).toEqual({ colour: "#ffffff", isFallback: true });
	expect(resolveLogoColour("181717", "brand", false)).toEqual({ colour: "#181717", isFallback: false });
	expect(resolveLogoColour("FFFFFF", "brand", false)).toEqual({ colour: "#1e1e1e", isFallback: true });
});

test("black/white ignores the brand colour", () => {
	expect(resolveLogoColour("2496ED", "mono", true)).toEqual({ colour: "#ffffff", isFallback: false });
	expect(resolveLogoColour("2496ED", "mono", false)).toEqual({ colour: "#1e1e1e", isFallback: false });
});
