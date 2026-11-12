import { expect, test } from "bun:test";

import {
	emojiToCodepoints,
	filterStickers,
	groupStickersByCategory,
	isStickerId,
	NOTO_EMOJI_COMMIT,
	searchStickers,
	STICKER_CATEGORIES,
	STICKER_CDN_BASE,
	stickerFileName,
	STICKERS,
	stickerUrl,
	type Sticker,
} from "../src/lib/stickers";

function sticker(id: string, name: string, keywords: string[], category: Sticker["category"] = "marks"): Sticker {
	return { id, emoji: "", name, keywords, category };
}

const SAMPLE: Sticker[] = [
	sticker("2705", "check mark button", ["done", "yes", "tick"]),
	sticker("1f6a9", "triangular flag", ["risk", "milestone"]),
	sticker("1f3c1", "chequered flag", ["finish", "checkered"]),
	sticker("1f600", "grinning face", ["happy", "smile"], "reactions"),
	sticker("1f4cb", "clipboard", ["list", "check", "tasks"], "objects"),
];

const names = (stickers: readonly Sticker[]) => stickers.map((item) => item.name);

test("turns an emoji into its codepoints, keeping multi-codepoint sequences whole", () => {
	expect(emojiToCodepoints("😀")).toBe("1f600");
	expect(emojiToCodepoints("⚠️")).toBe("26a0-fe0f");
	expect(emojiToCodepoints("🧑‍💻")).toBe("1f9d1-200d-1f4bb");
	expect(emojiToCodepoints("1️⃣")).toBe("31-fe0f-20e3");
});

test("builds the Noto file name: padded codepoints joined by underscores, without FE0F", () => {
	expect(stickerFileName("1f600")).toBe("emoji_u1f600.svg");
	expect(stickerFileName("26a0-fe0f")).toBe("emoji_u26a0.svg");
	expect(stickerFileName("1f9d1-200d-1f4bb")).toBe("emoji_u1f9d1_200d_1f4bb.svg");
	expect(stickerFileName("31-fe0f-20e3")).toBe("emoji_u0031_20e3.svg");
	expect(stickerFileName("2764-FE0F")).toBe("emoji_u2764.svg");
});

test("serves stickers from jsDelivr pinned to one full commit, never a branch or a moving tag", () => {
	expect(NOTO_EMOJI_COMMIT).toMatch(/^[0-9a-f]{40}$/);
	expect(STICKER_CDN_BASE).toBe(`https://cdn.jsdelivr.net/gh/googlefonts/noto-emoji@${NOTO_EMOJI_COMMIT}/svg`);
	expect(stickerUrl("26a0-fe0f")).toBe(`${STICKER_CDN_BASE}/emoji_u26a0.svg`);
});

test("refuses to build a URL from anything that is not a codepoint id", () => {
	expect(isStickerId("1f9d1-200d-1f4bb")).toBe(true);
	for (const bad of ["", "../../package.json", "1f600/..", "1f600-", "grinning face", "1F600"]) {
		expect(isStickerId(bad)).toBe(false);
		expect(() => stickerUrl(bad)).toThrow();
	}
});

test("searches names and keywords without caring about letter case", () => {
	expect(names(searchStickers(SAMPLE, "FLAG"))).toEqual(["triangular flag", "chequered flag"]);
	expect(names(searchStickers(SAMPLE, "Happy"))).toEqual(["grinning face"]);
	expect(names(searchStickers(SAMPLE, "checkered"))).toEqual(["chequered flag"]);
});

test("requires every word of the search to match", () => {
	expect(names(searchStickers(SAMPLE, "flag finish"))).toEqual(["chequered flag"]);
	expect(searchStickers(SAMPLE, "flag happy")).toEqual([]);
});

test("lists stickers matched by name before those matched only by keyword", () => {
	expect(names(searchStickers(SAMPLE, "check"))).toEqual(["check mark button", "chequered flag", "clipboard"]);
});

test("keeps everything, in order, when the search is empty or only spaces", () => {
	expect(searchStickers(SAMPLE, "")).toEqual(SAMPLE);
	expect(searchStickers(SAMPLE, "   ")).toEqual(SAMPLE);
	expect(searchStickers(SAMPLE, "")).not.toBe(SAMPLE);
});

test("finds a sticker when the emoji itself is pasted, with or without the variation selector", () => {
	expect(names(searchStickers(STICKERS, "⚠️"))).toEqual(["warning"]);
	expect(names(searchStickers(STICKERS, "⚠"))).toEqual(["warning"]);
});

test("combines the category chip with the search", () => {
	expect(names(filterStickers(SAMPLE, { category: "marks", query: "check" }))).toEqual(["check mark button", "chequered flag"]);
	expect(names(filterStickers(SAMPLE, { category: "objects" }))).toEqual(["clipboard"]);
	expect(filterStickers(SAMPLE, { category: "all" })).toEqual(SAMPLE);
	expect(filterStickers(SAMPLE, { category: "nature", query: "flag" })).toEqual([]);
});

test("groups stickers under their categories in display order, leaving out empty ones", () => {
	const groups = groupStickersByCategory(SAMPLE);

	expect(groups.map((group) => group.category.id)).toEqual(["reactions", "marks", "objects"]);
	expect(groups.map((group) => group.stickers.length)).toEqual([1, 3, 1]);
	expect(groupStickersByCategory([])).toEqual([]);
});

test("ships a curated set, not the whole of Unicode, with every category populated", () => {
	expect(STICKERS.length).toBeGreaterThanOrEqual(150);
	expect(STICKERS.length).toBeLessThanOrEqual(250);
	expect(groupStickersByCategory(STICKERS).map((group) => group.category.id)).toEqual(STICKER_CATEGORIES.map((category) => category.id));
});

test("gives every curated sticker a unique, well-formed id, a name and lower-case keywords", () => {
	expect(new Set(STICKERS.map((item) => item.id)).size).toBe(STICKERS.length);
	expect(new Set(STICKERS.map((item) => stickerFileName(item.id))).size).toBe(STICKERS.length);

	for (const item of STICKERS) {
		expect(isStickerId(item.id)).toBe(true);
		expect(emojiToCodepoints(item.emoji)).toBe(item.id);
		expect(item.name.trim()).toBe(item.name);
		expect(item.name.length).toBeGreaterThan(0);
		expect(item.keywords.length).toBeGreaterThan(0);
		expect(item.keywords.every((keyword) => keyword === keyword.toLowerCase() && !/\s/.test(keyword))).toBe(true);
	}
});

test("includes the whiteboard essentials, mapped to the right files", () => {
	const fileFor = (name: string) => {
		const found = STICKERS.find((item) => item.name === name);
		return found ? stickerFileName(found.id) : null;
	};

	expect(fileFor("check mark button")).toBe("emoji_u2705.svg");
	expect(fileFor("cross mark")).toBe("emoji_u274c.svg");
	expect(fileFor("warning")).toBe("emoji_u26a0.svg");
	expect(fileFor("light bulb")).toBe("emoji_u1f4a1.svg");
	expect(fileFor("triangular flag")).toBe("emoji_u1f6a9.svg");
	expect(fileFor("technologist")).toBe("emoji_u1f9d1_200d_1f4bb.svg");
	expect(fileFor("keycap: 1")).toBe("emoji_u0031_20e3.svg");
});
