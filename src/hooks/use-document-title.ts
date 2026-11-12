"use client";

import { useEffect } from "react";

const SITE_NAME = "Sketchflow";

/** "Payments architecture - Sketchflow", or just the site name when there is nothing to show yet. */
export function documentTitleFor(parts: readonly (string | null | undefined)[]) {
	const named = parts.map((part) => part?.trim()).filter((part): part is string => Boolean(part));
	return named.length > 0 ? `${named.join(" · ")} - ${SITE_NAME}` : SITE_NAME;
}

// Only the most recently mounted caller names the tab, so two can never fight over it.
let currentOwner: symbol | null = null;

/**
 * Names the browser tab after what is on screen. Pages here load their data in the browser,
 * so the title the server sends can only be generic; this replaces it once the real name
 * (a project, a workspace) is known.
 */
export function useDocumentTitle(...parts: (string | null | undefined)[]) {
	const title = documentTitleFor(parts);

	useEffect(() => {
		const owner = Symbol("document-title");
		currentOwner = owner;

		const applyTitle = () => {
			if (currentOwner === owner && document.title !== title) {
				document.title = title;
			}
		};
		applyTitle();

		// The framework writes the page's generic title when a navigation finishes, which can
		// be after this ran; put the real name back whenever that happens.
		const observer = new MutationObserver(applyTitle);
		observer.observe(document.head, { childList: true, subtree: true, characterData: true });

		return () => {
			observer.disconnect();
			if (currentOwner === owner) {
				currentOwner = null;
			}
		};
	}, [title]);
}
