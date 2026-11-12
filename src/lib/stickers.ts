// The Stickers tab's index and its pure helpers. No browser APIs, so it runs in tests.
//
// Graphics are Google's Noto Emoji SVGs (Apache-2.0, so no in-product credit is required),
// fetched from jsDelivr at one exact commit. A commit never changes, which is what makes it
// acceptable to load from a CDN: the same sticker is the same file for everyone, forever.

import { STICKER_CATEGORIES, STICKER_SEEDS, type StickerCategoryId, type StickerSeed } from "@/lib/sticker-data";

export { STICKER_CATEGORIES, type StickerCategoryId };

/** googlefonts/noto-emoji at tag v2.051. Pinned by commit, because a tag can be moved. */
export const NOTO_EMOJI_COMMIT = "8998f5dd683424a73e2314a8c1f1e359c19e8742";
export const STICKER_CDN_BASE = `https://cdn.jsdelivr.net/gh/googlefonts/noto-emoji@${NOTO_EMOJI_COMMIT}/svg`;

export type StickerCategory = (typeof STICKER_CATEGORIES)[number];

export type Sticker = {
	/** Lower-case hex codepoints of the emoji joined by "-", for example "26a0-fe0f". */
	id: string;
	/** The emoji character, shown when its picture cannot be loaded. */
	emoji: string;
	name: string;
	/** Lower-case search words beyond the name. */
	keywords: readonly string[];
	category: StickerCategoryId;
};

export type StickerGroup = { category: StickerCategory; stickers: Sticker[] };

/** The variation selector that asks for emoji presentation. Noto leaves it out of file names. */
const VARIATION_SELECTOR_16 = "fe0f";
const STICKER_ID = /^[0-9a-f]{2,6}(-[0-9a-f]{2,6})*$/;

/** "⚠️" → "26a0-fe0f". Iterates by codepoint, so characters outside the BMP stay whole. */
export function emojiToCodepoints(emoji: string): string {
	return Array.from(emoji, (character) => (character.codePointAt(0) ?? 0).toString(16)).join("-");
}

export function isStickerId(id: string): boolean {
	return STICKER_ID.test(id);
}

/**
 * The Noto Emoji file for a sticker id: "emoji_u", then each codepoint padded to four digits
 * and joined by "_", with the FE0F variation selector dropped ("26a0-fe0f" → "emoji_u26a0.svg").
 */
export function stickerFileName(id: string): string {
	const codepoints = id
		.toLowerCase()
		.split("-")
		.filter((codepoint) => codepoint !== VARIATION_SELECTOR_16)
		.map((codepoint) => codepoint.padStart(4, "0"));
	return `emoji_u${codepoints.join("_")}.svg`;
}

/** The pinned CDN address of a sticker's SVG. Throws for anything that is not a codepoint id. */
export function stickerUrl(id: string): string {
	if (!isStickerId(id)) {
		throw new Error(`"${id}" is not a sticker id.`);
	}
	return `${STICKER_CDN_BASE}/${stickerFileName(id)}`;
}

function toSticker(category: StickerCategoryId, [emoji, name, keywords]: StickerSeed): Sticker {
	return { id: emojiToCodepoints(emoji), emoji, name, keywords: keywords.toLowerCase().split(/\s+/).filter(Boolean), category };
}

/** Every sticker, in category order and then in the curated order within each category. */
export const STICKERS: readonly Sticker[] = STICKER_CATEGORIES.flatMap((category) =>
	STICKER_SEEDS[category.id].map((seed) => toSticker(category.id, seed)),
);

function withoutVariationSelector(text: string) {
	return text.replaceAll("️", "");
}

function matchesTerm(sticker: Sticker, term: string) {
	return (
		sticker.name.toLowerCase().includes(term) ||
		sticker.keywords.some((keyword) => keyword.includes(term)) ||
		// Lets someone paste the emoji itself into the search box.
		withoutVariationSelector(sticker.emoji) === withoutVariationSelector(term)
	);
}

/**
 * Stickers whose name or keywords contain every word of `query`, ignoring case. Stickers
 * matched by name come before those matched only by keyword. An empty query keeps everything.
 */
export function searchStickers(stickers: readonly Sticker[], query: string): Sticker[] {
	const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
	if (terms.length === 0) return [...stickers];

	const matches = stickers.filter((sticker) => terms.every((term) => matchesTerm(sticker, term)));
	const matchesByName = (sticker: Sticker) => terms.every((term) => sticker.name.toLowerCase().includes(term));
	return [...matches.filter(matchesByName), ...matches.filter((sticker) => !matchesByName(sticker))];
}

export type StickerFilter = { query?: string; category?: StickerCategoryId | "all" };

/** Applies the category chip and the search text together. */
export function filterStickers(stickers: readonly Sticker[], filter: StickerFilter): Sticker[] {
	const category = filter.category ?? "all";
	const inCategory = category === "all" ? stickers : stickers.filter((sticker) => sticker.category === category);
	return searchStickers(inCategory, filter.query ?? "");
}

/** Splits stickers into their categories, in display order, leaving out empty categories. */
export function groupStickersByCategory(stickers: readonly Sticker[]): StickerGroup[] {
	return STICKER_CATEGORIES.map((category) => ({
		category,
		stickers: stickers.filter((sticker) => sticker.category === category.id),
	})).filter((group) => group.stickers.length > 0);
}
