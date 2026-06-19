"use client";

import { useEffect, useState } from "react";
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
import { GITHUB_TOKEN_CHANGED_EVENT, getStoredGithubTokenFingerprint } from "@/lib/github-token";

function useGithubTokenFingerprint() {
	const [fingerprint, setFingerprint] = useState("none");

	useEffect(() => {
		const updateFingerprint = () => setFingerprint(getStoredGithubTokenFingerprint());

		updateFingerprint();
		window.addEventListener(GITHUB_TOKEN_CHANGED_EVENT, updateFingerprint);
		window.addEventListener("storage", updateFingerprint);

		return () => {
			window.removeEventListener(GITHUB_TOKEN_CHANGED_EVENT, updateFingerprint);
			window.removeEventListener("storage", updateFingerprint);
		};
	}, []);

	return fingerprint;
}

export const swrKeys = {
	authMe: "/api/auth/me",
	excalidrawLibraries: "/api/excalidraw/libraries",
	githubStatus: (stackUserId: string | null | undefined, githubTokenKey = "none") =>
		stackUserId ? ["/api/github/status", stackUserId, githubTokenKey] : null,
	workspaces: (stackUserId: string | null | undefined) => (stackUserId ? ["/api/workspaces", stackUserId] : null),
	workspaceProjects: (
		workspaceId: string | null | undefined,
		stackUserId: string | null | undefined,
		githubTokenKey = "none",
	) =>
		workspaceId && stackUserId
			? [`/api/workspaces/${encodeURIComponent(workspaceId)}/projects`, stackUserId, githubTokenKey]
			: null,
	sketch: (
		input: { workspaceId: string; projectId: string; sketchId: string } | null,
		stackUserId: string | null | undefined,
		githubTokenKey = "none",
	) =>
		input && stackUserId
			? [
					`/api/workspaces/${encodeURIComponent(input.workspaceId)}/projects/${encodeURIComponent(
						input.projectId,
					)}/sketches/${encodeURIComponent(input.sketchId)}`,
					stackUserId,
					githubTokenKey,
				]
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
	const githubTokenKey = useGithubTokenFingerprint();

	return useSWR<GithubStatus>(swrKeys.githubStatus(stackUserId, githubTokenKey), getGithubStatus, {
		revalidateOnFocus: false,
		revalidateOnReconnect: true,
		dedupingInterval: 5000,
	});
}

export function useExcalidrawLibraries() {
	return useSWR<ExcalidrawLibrariesResponse>(swrKeys.excalidrawLibraries, getExcalidrawLibraries, {
		revalidateOnFocus: false,
	});
}

export function useWorkspaces(stackUserId: string | null | undefined) {
	return useSWR(swrKeys.workspaces(stackUserId), getWorkspaces, {
		revalidateOnFocus: false,
		revalidateOnReconnect: true,
		dedupingInterval: 5000,
	});
}

export function useWorkspaceProjects(workspaceId: string | null | undefined, stackUserId: string | null | undefined) {
	const githubTokenKey = useGithubTokenFingerprint();

	return useSWR<WorkspaceProjectsResponse>(
		swrKeys.workspaceProjects(workspaceId, stackUserId, githubTokenKey),
		() => getWorkspaceProjects(workspaceId as string),
		{
			revalidateOnFocus: false,
			revalidateOnReconnect: true,
			dedupingInterval: 5000,
			keepPreviousData: false,
		},
	);
}

export function useSketch(
	input: { workspaceId: string; projectId: string; sketchId: string } | null,
	stackUserId: string | null | undefined,
) {
	const githubTokenKey = useGithubTokenFingerprint();

	return useSWR<SketchLoadResponse>(
		swrKeys.sketch(input, stackUserId, githubTokenKey),
		() =>
			getSketch(
				input as {
					workspaceId: string;
					projectId: string;
					sketchId: string;
				},
			),
		{
			revalidateOnFocus: false,
		},
	);
}
