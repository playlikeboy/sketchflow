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
	githubStatus: (stackUserId: string | null | undefined) => (stackUserId ? ["/api/github/status", stackUserId] : null),
	workspaces: (stackUserId: string | null | undefined) => (stackUserId ? ["/api/workspaces", stackUserId] : null),
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
	return useSWR<AuthMeResponse>(swrKeys.authMe, getAuthMe, {
		revalidateOnFocus: true,
		revalidateOnReconnect: true,
		dedupingInterval: 2000,
	});
}

export function useGithubStatus(stackUserId: string | null | undefined) {
	return useSWR<GithubStatus>(swrKeys.githubStatus(stackUserId), getGithubStatus, {
		revalidateOnFocus: true,
		revalidateOnReconnect: true,
		refreshInterval: 30_000,
		dedupingInterval: 3000,
	});
}

export function useExcalidrawLibraries() {
	return useSWR<ExcalidrawLibrariesResponse>(swrKeys.excalidrawLibraries, getExcalidrawLibraries, {
		revalidateOnFocus: false,
	});
}

export function useWorkspaces(stackUserId: string | null | undefined) {
	return useSWR(swrKeys.workspaces(stackUserId), getWorkspaces, {
		revalidateOnFocus: true,
		revalidateOnReconnect: true,
		refreshInterval: 20_000,
		dedupingInterval: 2000,
	});
}

export function useWorkspaceProjects(workspaceId: string | null | undefined) {
	return useSWR<WorkspaceProjectsResponse>(
		swrKeys.workspaceProjects(workspaceId),
		() => getWorkspaceProjects(workspaceId as string),
		{
			revalidateOnFocus: true,
			revalidateOnReconnect: true,
			refreshInterval: 10_000,
			dedupingInterval: 1000,
			keepPreviousData: true,
		},
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
