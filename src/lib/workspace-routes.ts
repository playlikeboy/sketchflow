import type { Workspace } from "@/lib/api";

export const DEFAULT_PROJECT_ID = "first-project";
export const DEFAULT_SKETCH_ID = "system-map";

export function sketchHref(
	workspaceId: string,
	projectId = DEFAULT_PROJECT_ID,
	sketchId = DEFAULT_SKETCH_ID,
) {
	return `/app/workspaces/${workspaceId}/projects/${projectId}/sketches/${sketchId}`;
}

export function repoHref(workspace: Pick<Workspace, "repoOwner" | "repoName">) {
	return `https://github.com/${workspace.repoOwner}/${workspace.repoName}`;
}

export function repoFileHref(
	workspace: Pick<Workspace, "repoOwner" | "repoName" | "defaultBranch">,
	path: string,
) {
	return `${repoHref(workspace)}/blob/${workspace.defaultBranch}/${path}`;
}

export function repoFolderHref(
	workspace: Pick<Workspace, "repoOwner" | "repoName" | "defaultBranch">,
	path: string,
) {
	return `${repoHref(workspace)}/tree/${workspace.defaultBranch}/${path}`;
}

export function commitsHref(
	workspace: Pick<Workspace, "repoOwner" | "repoName" | "defaultBranch">,
	path = `projects/${DEFAULT_PROJECT_ID}`,
) {
	return `${repoHref(workspace)}/commits/${workspace.defaultBranch}/${path}`;
}

export function shareHref(
	workspace: Pick<Workspace, "repoOwner" | "repoName">,
	projectId = DEFAULT_PROJECT_ID,
) {
	return `/share/${workspace.repoOwner}/${workspace.repoName}/${projectId}`;
}

export function embedHref(
	workspace: Pick<Workspace, "repoOwner" | "repoName">,
	projectId = DEFAULT_PROJECT_ID,
) {
	return `/embed/${workspace.repoOwner}/${workspace.repoName}/${projectId}`;
}
