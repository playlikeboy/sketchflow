export type WorkspaceVisibility = "private" | "public";

export type WorkspaceInput = {
	repoOwner: string;
	repoName: string;
	defaultBranch?: string;
	visibility?: WorkspaceVisibility;
	latestCommitSha?: string | null;
};

// Only overwrite columns the caller actually provided, so partial updates (e.g. a visibility
// sync) never reset an existing workspace's branch back to the insert default.
export function workspaceConflictUpdate(input: WorkspaceInput) {
	return {
		...(input.defaultBranch ? { defaultBranch: input.defaultBranch } : {}),
		...(input.visibility ? { visibility: input.visibility } : {}),
	};
}
