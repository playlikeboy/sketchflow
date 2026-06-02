"use client";

import useSWR from "swr";

import {
	getExcalidrawLibraries,
	getAuthMe,
	getGithubStatus,
	getSketch,
	getWorkspaceProjects,
	getWorkspaces,
	type AuthMeResponse,
	type GithubStatus,
	type SketchLoadResponse,
	type WorkspaceProjectsResponse,
} from "@/lib/api";
import type { ExcalidrawLibrariesResponse } from "@/lib/excalidraw-libraries";

export const swrKeys = {
	authMe: "/api/auth/me",
	excalidrawLibraries: "/api/excalidraw/libraries",
	githubStatus: "/api/github/status",
	workspaces: "/api/workspaces",
	workspaceProjects: (workspaceId: string | null | undefined) =>
		workspaceId ? `/api/workspaces/${encodeURIComponent(workspaceId)}/projects` : null,
	sketch: (input: { workspaceId: string; projectId: string; sketchId: string } | null) =>
		input
			? `/api/workspaces/${encodeURIComponent(input.workspaceId)}/projects/${encodeURIComponent(
					input.projectId,
				)}/sketches/${encodeURIComponent(input.sketchId)}`
			: null,
};

export function useAuthMe() {
	return useSWR<AuthMeResponse>(swrKeys.authMe, getAuthMe);
}

export function useGithubStatus() {
	return useSWR<GithubStatus>(swrKeys.githubStatus, getGithubStatus);
}

export function useExcalidrawLibraries() {
	return useSWR<ExcalidrawLibrariesResponse>(swrKeys.excalidrawLibraries, getExcalidrawLibraries, {
		revalidateOnFocus: false,
	});
}

export function useWorkspaces() {
	return useSWR(swrKeys.workspaces, getWorkspaces);
}

export function useWorkspaceProjects(workspaceId: string | null | undefined) {
	return useSWR<WorkspaceProjectsResponse>(
		swrKeys.workspaceProjects(workspaceId),
		() => getWorkspaceProjects(workspaceId as string),
	);
}

export function useSketch(input: { workspaceId: string; projectId: string; sketchId: string } | null) {
	return useSWR<SketchLoadResponse>(swrKeys.sketch(input), () => getSketch(input as {
		workspaceId: string;
		projectId: string;
		sketchId: string;
	}), {
		revalidateOnFocus: false,
	});
}
