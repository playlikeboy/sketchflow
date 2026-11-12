"use client";

import { useEffect } from "react";

const SITE_NAME = "Sketchflow";

/** "Payments architecture - Sketchflow", or just the site name when there is nothing to show yet. */
export function documentTitleFor(parts: readonly (string | null | undefined)[]) {
	const named = parts.map((part) => part?.trim()).filter((part): part is string => Boolean(part));
	return named.length > 0 ? `${named.join(" · ")} - ${SITE_NAME}` : SITE_NAME;
}

/**
 * Names the browser tab after what is on screen. Pages here load their data in the browser,
 * so the title the server sends can only be generic; this replaces it once the real name
 * (a project, a workspace) is known.
 */
export function useDocumentTitle(...parts: (string | null | undefined)[]) {
	const title = documentTitleFor(parts);

	useEffect(() => {
		document.title = title;
	}, [title]);
}
