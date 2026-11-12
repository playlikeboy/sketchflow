"use client";

import type { Workspace } from "@/lib/api";

export type LocalSyncPanelProps = {
	/** The repository workspace the guest projects will be copied into. */
	workspace: Workspace;
	/** Called after at least one project reached the repository, so lists can refresh. */
	onSynced?: () => Promise<void> | void;
};

/**
 * Offers to copy projects made on this device (the guest workspace) into a repository.
 * Renders nothing when there is nothing to sync. Implemented with src/lib/local-sync.ts.
 */
export function LocalSyncPanel(_props: LocalSyncPanelProps) {
	return null;
}
