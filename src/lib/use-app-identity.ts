"use client";

import { getActiveUserId } from "@/lib/github-token";
import { useAuthMe } from "@/lib/swr-hooks";

export type AppIdentity = {
	/** True until the first answer about the session arrives. Guest UI can render meanwhile. */
	isLoading: boolean;
	/** A GitHub account is connected for this request. */
	isSignedIn: boolean;
	/**
	 * The user whose repository-backed caches to show. When the session check fails (for
	 * example offline), this falls back to the last signed-in user on this browser so their
	 * cached workspaces stay visible. Null for guests.
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
	const offlineFallbackUserId = error && typeof window !== "undefined" ? getActiveUserId() : null;

	return {
		isLoading: isLoading && !data && !error,
		isSignedIn: Boolean(user),
		userId: user?.id ?? offlineFallbackUserId,
		user,
	};
}
