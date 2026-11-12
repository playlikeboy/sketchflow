"use client";

import { getActiveUserId } from "@/lib/github-token";
import { useAuthMe } from "@/lib/swr-hooks";

export type AppIdentity = {
	/** True until the first answer about the session arrives. Guest UI can render meanwhile. */
	isLoading: boolean;
	/** A GitHub account is connected for this request. */
	isSignedIn: boolean;
	/**
	 * The user whose repository-backed caches to show. Only while the browser is offline, and
	 * so cannot ask the server, this falls back to the last signed-in user on this browser so
	 * their cached workspaces stay usable. Null for guests.
	 */
	userId: string | null;
	user: { id: string; primaryEmail: string | null; displayName: string | null; profileImageUrl: string | null } | null;
};

/**
 * Who is using the app. Sketchflow works fully without signing in, so nothing here should be
 * used to block the app; it only decides whether GitHub-backed features are offered.
 */
export function useAppIdentity(): AppIdentity {
	const { data, error, isLoading } = useAuthMe();
	const user = data?.authenticated ? data.user : null;
	// The fallback is deliberately narrow. A server error or an expired session must not put
	// a previous user's cached repositories on screen for whoever is at the keyboard now, so
	// it applies only when the browser itself reports no connection.
	const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
	const offlineFallbackUserId = error && isOffline ? getActiveUserId() : null;

	return {
		isLoading: isLoading && !data && !error,
		isSignedIn: Boolean(user),
		userId: user?.id ?? offlineFallbackUserId,
		user,
	};
}
