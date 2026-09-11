"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR, { type Key } from "swr";

import {
	getSketch,
	getWorkspaceProjects,
	getWorkspaces,
	getProjectHistory,
	getProjectHistorySnapshot,
	type SketchLoadResponse,
	type WorkspaceProjectsResponse,
	type CommitHistoryResponse,
	type ProjectSnapshotResponse,
} from "@/lib/api";
import {
	getDraft,
	getLocalProjects,
	getOfflineWorkspaces,
	saveOfflineWorkspaces,
	getOfflineProjectsCache,
	saveOfflineProjectsCache,
	type DraftRecord,
} from "@/lib/indexeddb";

type DraftValue = {
	scene: unknown;
	updatedAt: string;
};

type NotesDraftValue = {
	notes: string;
	updatedAt: string;
};

type StateDraftValue = {
	state: unknown;
	updatedAt: string;
};

async function readLocalSketchDraft(workspaceId: string, projectId: string, sketchId: string, userId?: string | null) {
	const base = userId ? `sketch:${workspaceId}:${projectId}:${sketchId}:${userId}` : `sketch:${workspaceId}:${projectId}:${sketchId}`;
	const [scene, notes, state] = await Promise.all([
		getDraft<DraftValue>(base),
		getDraft<NotesDraftValue>(`${base}:notes`),
		getDraft<StateDraftValue>(`${base}:state`),
	]);
	return { scene, notes, state, base };
}

export function useOfflineSketch(
	input: { workspaceId: string; projectId: string; sketchId: string } | null,
	stackUserId: string | null | undefined,
) {
	const [localCache, setLocalCache] = useState<{
		scene: unknown;
		notes: string;
		state: unknown;
		updatedAt: string;
	} | null>(null);
	const [hasLocalCache, setHasLocalCache] = useState(false);

	useEffect(() => {
		if (!input) {
			setLocalCache(null);
			setHasLocalCache(false);
			return;
		}

		let active = true;
		readLocalSketchDraft(input.workspaceId, input.projectId, input.sketchId, stackUserId).then((result) => {
			if (!active) return;
			if (result.scene || result.notes || result.state) {
				const latest = [result.scene?.updatedAt, result.notes?.updatedAt, result.state?.updatedAt]
					.filter(Boolean)
					.sort()
					.pop();
				setLocalCache({
					scene: result.scene?.value?.scene ?? null,
					notes: result.notes?.value?.notes ?? "",
					state: result.state?.value?.state ?? null,
					updatedAt: latest ?? result.scene?.updatedAt ?? result.notes?.updatedAt ?? result.state?.updatedAt ?? new Date().toISOString(),
				});
				setHasLocalCache(true);
			} else {
				setLocalCache(null);
				setHasLocalCache(false);
			}
		});

		return () => {
			active = false;
		};
	}, [input, stackUserId]);

	const swrKey = useMemo(() => {
		if (!input || !stackUserId) return null;
		return [
			`/api/workspaces/${encodeURIComponent(input.workspaceId)}/projects/${encodeURIComponent(
				input.projectId,
			)}/sketches/${encodeURIComponent(input.sketchId)}`,
			stackUserId,
		];
	}, [input, stackUserId]);

	const { data, error, isLoading, mutate } = useSWR<SketchLoadResponse>(
		input && stackUserId ? swrKey : null,
		() => getSketch(input as { workspaceId: string; projectId: string; sketchId: string }),
		{
			revalidateOnFocus: false,
			revalidateOnReconnect: true,
			dedupingInterval: 5_000,
			keepPreviousData: true,
		},
	);

	const isLoaded = hasLocalCache || !isLoading;

	return {
		data: data ?? null,
		localCache,
		hasLocalCache,
		isLoading: isLoading && !hasLocalCache,
		isLoaded,
		error,
		mutate,
	};
}

export function useOfflineWorkspaces(stackUserId: string | null | undefined) {
	const [localWorkspaces, setLocalWorkspaces] = useState<SketchLoadResponse["workspace"][]>([]);

	useEffect(() => {
		if (!stackUserId) {
			setLocalWorkspaces([]);
			return;
		}
		let active = true;
		getOfflineWorkspaces(stackUserId).then((cached) => {
			if (active && Array.isArray(cached) && cached.length > 0) {
				setLocalWorkspaces(cached);
			}
		});
		return () => {
			active = false;
		};
	}, [stackUserId]);

	const swrKey = useMemo(() => {
		if (!stackUserId) return null;
		return ["/api/workspaces", stackUserId];
	}, [stackUserId]);

	const { data, error, isLoading, mutate } = useSWR<{ workspaces: SketchLoadResponse["workspace"][] }>(
		swrKey,
		getWorkspaces,
		{
			revalidateOnFocus: false,
			revalidateOnReconnect: true,
			dedupingInterval: 5_000,
			keepPreviousData: true,
			onSuccess: (res) => {
				if (res?.workspaces && stackUserId) {
					void saveOfflineWorkspaces(res.workspaces, stackUserId);
				}
			},
		},
	);

	const workspaces = data?.workspaces ?? localWorkspaces;

	return {
		data,
		workspaces,
		isLoading: isLoading && workspaces.length === 0,
		error,
		mutate,
	};
}

export function useOfflineWorkspaceProjects(
	workspaceId: string | null | undefined,
	stackUserId: string | null | undefined,
) {
	const [localProjects, setLocalProjects] = useState<WorkspaceProjectsResponse["projects"]>([]);
	const [cachedRemote, setCachedRemote] = useState<WorkspaceProjectsResponse["projects"]>([]);

	useEffect(() => {
		if (!workspaceId) {
			setLocalProjects([]);
			setCachedRemote([]);
			return;
		}
		let active = true;
		Promise.all([
			getLocalProjects(workspaceId, stackUserId),
			getOfflineProjectsCache(workspaceId, stackUserId),
		]).then(([locals, remotes]) => {
			if (!active) return;
			if (Array.isArray(locals)) setLocalProjects(locals as WorkspaceProjectsResponse["projects"]);
			if (Array.isArray(remotes)) setCachedRemote(remotes as WorkspaceProjectsResponse["projects"]);
		});
		return () => {
			active = false;
		};
	}, [workspaceId, stackUserId]);

	const swrKey = useMemo(() => {
		if (!workspaceId || !stackUserId) return null;
		return [`/api/workspaces/${encodeURIComponent(workspaceId)}/projects`, stackUserId];
	}, [workspaceId, stackUserId]);

	const { data, error, isLoading, mutate } = useSWR<WorkspaceProjectsResponse>(
		workspaceId && stackUserId ? swrKey : null,
		() => getWorkspaceProjects(workspaceId as string),
		{
			revalidateOnFocus: false,
			revalidateOnReconnect: true,
			dedupingInterval: 5_000,
			keepPreviousData: true,
			onSuccess: (res: WorkspaceProjectsResponse | undefined) => {
				if (res?.projects && workspaceId) {
					void saveOfflineProjectsCache(workspaceId, res.projects, stackUserId);
				}
			},
		},
	);

	const projects = useMemo(() => {
		const baseRemote = data?.projects ?? cachedRemote ?? [];
		const merged = [...baseRemote];
		for (const lp of localProjects) {
			if (!merged.some((p) => p.id === lp.id)) {
				merged.push(lp);
			}
		}
		return merged;
	}, [data?.projects, cachedRemote, localProjects]);

	return {
		data,
		projects,
		metadata: data?.metadata ?? null,
		metadataPresent: data?.metadataPresent ?? (projects.length > 0),
		isLoading: isLoading && projects.length === 0,
		error,
		mutate,
	};
}

export function useOfflineProjectHistory(
	workspaceId: string | null | undefined,
	projectId: string | null | undefined,
	stackUserId: string | null | undefined,
) {
	const swrKey = useMemo(() => {
		if (!workspaceId || !projectId || !stackUserId) return null;
		return [
			`/api/workspaces/${encodeURIComponent(workspaceId)}/projects/${encodeURIComponent(
				projectId,
			)}/history`,
			stackUserId,
		];
	}, [workspaceId, projectId, stackUserId]);

	const { data, error, isLoading, mutate } = useSWR<CommitHistoryResponse>(
		workspaceId && projectId && stackUserId ? swrKey : null,
		() => getProjectHistory(workspaceId as string, projectId as string),
		{
			revalidateOnFocus: false,
			revalidateOnReconnect: true,
			dedupingInterval: 5_000,
			keepPreviousData: true,
		},
	);

	return {
		data,
		commits: data?.commits ?? [],
		isLoading: isLoading,
		error,
		mutate,
	};
}

export function useOfflineProjectHistorySnapshot(
	workspaceId: string | null | undefined,
	projectId: string | null | undefined,
	commitSha: string | null | undefined,
	stackUserId: string | null | undefined,
) {
	const swrKey = useMemo(() => {
		if (!workspaceId || !projectId || !commitSha || !stackUserId) return null;
		return [
			`/api/workspaces/${encodeURIComponent(workspaceId)}/projects/${encodeURIComponent(
				projectId,
			)}/history/${encodeURIComponent(commitSha)}`,
			stackUserId,
		];
	}, [workspaceId, projectId, commitSha, stackUserId]);

	const { data, error, isLoading, mutate } = useSWR<ProjectSnapshotResponse>(
		workspaceId && projectId && commitSha && stackUserId ? swrKey : null,
		() => getProjectHistorySnapshot(workspaceId as string, projectId as string, commitSha as string),
		{
			revalidateOnFocus: false,
			revalidateOnReconnect: false,
			keepPreviousData: true,
		},
	);

	return {
		data,
		isLoading,
		error,
		mutate,
	};
}
