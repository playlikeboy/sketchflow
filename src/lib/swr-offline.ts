"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";

import {
	getSketch,
	getWorkspaceProjects,
	getWorkspaces,
	getProjectHistory,
	getProjectHistorySnapshot,
	type SketchLoadResponse,
	type Workspace,
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
} from "@/lib/indexeddb";
import {
	LOCAL_WORKSPACE,
	LOCAL_WORKSPACE_ID,
	isLocalWorkspace,
	listGuestProjects,
	storageUserId,
} from "@/lib/local-workspace";
import type { WorkspaceProject } from "@/lib/project-metadata";
import { draftKey, storageScope } from "@/lib/storage-keys";

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

const EMPTY_PROJECTS: WorkspaceProject[] = [];

async function readLocalSketchDraft(workspaceId: string, projectId: string, sketchId: string, userId?: string | null) {
	// Must match the key the editor writes drafts under. Guest drafts always use the "local" scope.
	const base = draftKey(workspaceId, projectId, sketchId, storageUserId(workspaceId, userId));
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
		readLocalSketchDraft(input.workspaceId, input.projectId, input.sketchId, stackUserId)
			.then((result) => {
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
						updatedAt: latest ?? new Date().toISOString(),
					});
					setHasLocalCache(true);
				} else {
					setLocalCache(null);
					setHasLocalCache(false);
				}
			})
			.catch(() => {
				if (active) setHasLocalCache(false);
			});

		return () => {
			active = false;
		};
	}, [input, stackUserId]);

	// The guest workspace has no repository behind it, so it is never fetched.
	const swrKey = useMemo(() => {
		if (!input || !stackUserId || isLocalWorkspace(input.workspaceId)) return null;
		return [
			`/api/workspaces/${encodeURIComponent(input.workspaceId)}/projects/${encodeURIComponent(
				input.projectId,
			)}/sketches/${encodeURIComponent(input.sketchId)}`,
			stackUserId,
		];
	}, [input, stackUserId]);

	const { data, error, isLoading, mutate } = useSWR<SketchLoadResponse>(
		swrKey,
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

/** Repository workspaces for a signed-in user. Null user: no request, empty list. */
export function useOfflineWorkspaces(stackUserId: string | null | undefined) {
	const [localWorkspaces, setLocalWorkspaces] = useState<Workspace[]>([]);

	useEffect(() => {
		if (!stackUserId) {
			setLocalWorkspaces([]);
			return;
		}
		let active = true;
		getOfflineWorkspaces(stackUserId)
			.then((cached) => {
				if (active && Array.isArray(cached) && cached.length > 0) {
					setLocalWorkspaces(cached as Workspace[]);
				}
			})
			.catch(() => {});
		return () => {
			active = false;
		};
	}, [stackUserId]);

	const swrKey = useMemo(() => {
		if (!stackUserId) return null;
		return ["/api/workspaces", stackUserId];
	}, [stackUserId]);

	const { data, error, isLoading, mutate } = useSWR<{ workspaces: Workspace[] }>(swrKey, getWorkspaces, {
		revalidateOnFocus: false,
		revalidateOnReconnect: true,
		dedupingInterval: 5_000,
		keepPreviousData: true,
		onSuccess: (res) => {
			if (res?.workspaces && stackUserId) {
				void saveOfflineWorkspaces(res.workspaces, stackUserId);
			}
		},
	});

	const workspaces = stackUserId ? (data?.workspaces ?? localWorkspaces) : [];

	return {
		data,
		workspaces,
		isLoading: isLoading && workspaces.length === 0,
		error,
		mutate,
	};
}

/** IndexedDB-backed SWR keys. They never reach the network; SWR is only the shared cache. */
function localProjectsSwrKey(workspaceId: string, scopeUserId: string | null) {
	return ["indexeddb:local-projects", workspaceId, storageScope(scopeUserId)];
}

const GUEST_PROJECTS_KEY = localProjectsSwrKey(LOCAL_WORKSPACE_ID, null);

/** Projects in the guest workspace ("This device"), newest first. Never calls the API. */
export function useGuestProjects() {
	const { data, error, isLoading, mutate } = useSWR<WorkspaceProject[]>(GUEST_PROJECTS_KEY, listGuestProjects, {
		revalidateOnFocus: true,
		dedupingInterval: 1_000,
		keepPreviousData: true,
	});

	return { projects: data ?? EMPTY_PROJECTS, isLoading: isLoading && !data, error, mutate };
}

export function useOfflineWorkspaceProjects(
	workspaceId: string | null | undefined,
	stackUserId: string | null | undefined,
) {
	const isGuest = isLocalWorkspace(workspaceId);
	// Guest data always lives in the "local" scope, whoever is signed in.
	const scopeUserId = storageUserId(workspaceId, stackUserId);

	const { data: localProjects = EMPTY_PROJECTS, mutate: mutateLocal } = useSWR<WorkspaceProject[]>(
		workspaceId ? localProjectsSwrKey(workspaceId, scopeUserId) : null,
		() =>
			isGuest
				? listGuestProjects()
				: (getLocalProjects(workspaceId as string, scopeUserId) as Promise<WorkspaceProject[]>),
		{ revalidateOnFocus: true, dedupingInterval: 1_000, keepPreviousData: true },
	);

	const { data: cachedRemote = EMPTY_PROJECTS } = useSWR<WorkspaceProject[]>(
		workspaceId && !isGuest ? ["indexeddb:projects-cache", workspaceId, storageScope(scopeUserId)] : null,
		() => getOfflineProjectsCache(workspaceId as string, scopeUserId) as Promise<WorkspaceProject[]>,
		{ revalidateOnFocus: false },
	);

	// The guest workspace has no repository behind it, so it is never fetched.
	const swrKey = useMemo(() => {
		if (!workspaceId || isGuest || !stackUserId) return null;
		return [`/api/workspaces/${encodeURIComponent(workspaceId)}/projects`, stackUserId];
	}, [workspaceId, isGuest, stackUserId]);

	const { data, error, isLoading, mutate: mutateRemote } = useSWR<WorkspaceProjectsResponse>(
		swrKey,
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
		const baseRemote = data?.projects ?? cachedRemote;
		const remoteIds = new Set(baseRemote.map((project) => project.id));
		return [...baseRemote, ...localProjects.filter((project) => !remoteIds.has(project.id))];
	}, [data?.projects, cachedRemote, localProjects]);

	const mutate = useCallback(
		async (...args: Parameters<typeof mutateRemote>) => {
			const [, remote] = await Promise.all([mutateLocal(), mutateRemote(...args)]);
			return remote;
		},
		[mutateLocal, mutateRemote],
	);

	return {
		data,
		projects,
		metadata: data?.metadata ?? null,
		metadataPresent: data?.metadataPresent ?? projects.length > 0,
		isLoading: isLoading && projects.length === 0,
		error,
		mutate,
	};
}

export type AppWorkspaces = {
	/** Repository workspaces, plus "This device" when it is relevant. */
	workspaces: Workspace[];
	selectedWorkspace: Workspace | null;
	/** True while a signed-in user's repository list has not arrived yet. */
	isLoading: boolean;
	error: unknown;
	guestProjectCount: number;
	refresh: () => Promise<void>;
};

/**
 * The workspaces to offer in a switcher, and which one is selected.
 *
 * Signed out: only the guest workspace. Signed in: the repository workspaces, plus the guest
 * workspace when it holds projects or is explicitly selected. With no explicit choice, a
 * signed-in user lands on their first repository and a guest on "This device".
 */
export function useAppWorkspaces(userId: string | null | undefined, selectedWorkspaceId: string | null): AppWorkspaces {
	const repo = useOfflineWorkspaces(userId);
	const guest = useGuestProjects();
	const guestProjectCount = guest.projects.length;

	const workspaces = useMemo(() => {
		if (!userId) return [LOCAL_WORKSPACE];
		const includeGuest = guestProjectCount > 0 || isLocalWorkspace(selectedWorkspaceId);
		return includeGuest ? [...repo.workspaces, LOCAL_WORKSPACE] : repo.workspaces;
	}, [userId, repo.workspaces, guestProjectCount, selectedWorkspaceId]);

	const selectedWorkspace = useMemo(
		() =>
			workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ??
			workspaces.find((workspace) => !isLocalWorkspace(workspace.id)) ??
			workspaces[0] ??
			null,
		[workspaces, selectedWorkspaceId],
	);

	const { mutate: mutateRepo } = repo;
	const { mutate: mutateGuest } = guest;
	const refresh = useCallback(async () => {
		await Promise.all([mutateGuest(), userId ? mutateRepo() : undefined]);
	}, [mutateGuest, mutateRepo, userId]);

	return {
		workspaces,
		selectedWorkspace,
		isLoading: Boolean(userId) && repo.isLoading,
		error: repo.error,
		guestProjectCount,
		refresh,
	};
}

export function useOfflineProjectHistory(
	workspaceId: string | null | undefined,
	projectId: string | null | undefined,
	stackUserId: string | null | undefined,
) {
	const swrKey = useMemo(() => {
		if (!workspaceId || !projectId || !stackUserId || isLocalWorkspace(workspaceId)) return null;
		return [
			`/api/workspaces/${encodeURIComponent(workspaceId)}/projects/${encodeURIComponent(projectId)}/history`,
			stackUserId,
		];
	}, [workspaceId, projectId, stackUserId]);

	const { data, error, isLoading, mutate } = useSWR<CommitHistoryResponse>(
		swrKey,
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
		isLoading,
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
		if (!workspaceId || !projectId || !commitSha || !stackUserId || isLocalWorkspace(workspaceId)) return null;
		return [
			`/api/workspaces/${encodeURIComponent(workspaceId)}/projects/${encodeURIComponent(
				projectId,
			)}/history/${encodeURIComponent(commitSha)}`,
			stackUserId,
		];
	}, [workspaceId, projectId, commitSha, stackUserId]);

	const { data, error, isLoading, mutate } = useSWR<ProjectSnapshotResponse>(
		swrKey,
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
