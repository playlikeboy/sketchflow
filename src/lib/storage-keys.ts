// Key scheme for browser-local storage (IndexedDB drafts and caches).
//
// Every key is namespaced by a scope: the Sketchflow user id when signed in, or the explicit
// "local" scope when nobody is signed in. Nothing is stored under an unscoped key, so one
// account can never read or purge another account's drafts on a shared browser.

export const LOCAL_SCOPE = "local";

export function storageScope(userId?: string | null) {
	return userId || LOCAL_SCOPE;
}

export function draftKey(workspaceId: string, projectId: string, sketchId: string, userId?: string | null) {
	return `sketchflow:${storageScope(userId)}:${workspaceId}:${projectId}:${sketchId}`;
}

export function projectDraftPrefix(workspaceId: string, projectId: string, userId?: string | null) {
	return `sketchflow:${storageScope(userId)}:${workspaceId}:${projectId}:`;
}

export function localProjectsKey(workspaceId: string, userId?: string | null) {
	return `local-projects:${storageScope(userId)}:${workspaceId}`;
}

export function workspacesKey(userId?: string | null) {
	return `workspaces:${storageScope(userId)}`;
}

export function projectsCacheKey(workspaceId: string, userId?: string | null) {
	return `projects-cache:${storageScope(userId)}:${workspaceId}`;
}

export function offlineCommitsKey(workspaceId: string, projectId: string, userId?: string | null) {
	return `offline-commits:${storageScope(userId)}:${workspaceId}:${projectId}`;
}

// Prefixes that hold everything belonging to one scope. Used when a user signs out and
// asks for their cached data to be removed.
export function scopePrefixes(userId: string) {
	return [
		`sketchflow:${userId}:`,
		`local-projects:${userId}:`,
		`projects-cache:${userId}:`,
		`offline-commits:${userId}:`,
	];
}

// Older builds wrote signed-out data under unscoped keys. Maps a "local"-scoped key to the
// unscoped key it replaced, so that data can be moved forward on first read.
export function legacyUnscopedKey(key: string) {
	if (key === `workspaces:${LOCAL_SCOPE}`) {
		return "workspaces:default";
	}

	for (const family of ["sketchflow", "local-projects", "projects-cache", "offline-commits"]) {
		const scopedPrefix = `${family}:${LOCAL_SCOPE}:`;
		if (key.startsWith(scopedPrefix)) {
			return `${family}:${key.slice(scopedPrefix.length)}`;
		}
	}

	return null;
}
