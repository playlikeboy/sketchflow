"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getLocalProjects, saveLocalProject } from "@/lib/indexeddb";
import { LOCAL_WORKSPACE_ID, storageUserId } from "@/lib/local-workspace";
import type { WorkspaceProject } from "@/lib/project-metadata";

/** Bump the project's updatedAt at most this often while someone is editing. */
const TOUCH_INTERVAL_MS = 5_000;

// Guest projects always live in the "local" storage scope, whoever is signed in.
const GUEST_SCOPE = storageUserId(LOCAL_WORKSPACE_ID, null);

async function findGuestProject(projectId: string): Promise<WorkspaceProject | null> {
	const projects = (await getLocalProjects(LOCAL_WORKSPACE_ID, GUEST_SCOPE)) as WorkspaceProject[];
	return projects.find((project) => project.id === projectId) ?? null;
}

async function touchGuestProject(projectId: string, updatedAt: string): Promise<WorkspaceProject | null> {
	const existing = await findGuestProject(projectId);
	if (!existing) return null;
	const updated: WorkspaceProject = { ...existing, updatedAt };
	await saveLocalProject(LOCAL_WORKSPACE_ID, updated, GUEST_SCOPE);
	return updated;
}

/**
 * The guest-workspace record for a project (title and so on), plus `touch`, which keeps the
 * record's updatedAt in step with draft saves so project lists sort by recent edits.
 * Does nothing when `enabled` is false (repository workspaces).
 */
export function useGuestProject(projectId: string, enabled: boolean) {
	const [project, setProject] = useState<WorkspaceProject | null>(null);
	const lastTouchAtRef = useRef(0);
	const pendingTouchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (!enabled) return;
		let isActive = true;

		findGuestProject(projectId)
			.then((record) => {
				if (isActive) setProject(record);
			})
			.catch((error: unknown) => {
				console.warn("Could not read this device's project list:", error);
			});

		return () => {
			isActive = false;
		};
	}, [projectId, enabled]);

	useEffect(() => {
		return () => {
			if (pendingTouchRef.current) clearTimeout(pendingTouchRef.current);
		};
	}, []);

	const runTouch = useCallback(() => {
		lastTouchAtRef.current = Date.now();
		touchGuestProject(projectId, new Date().toISOString())
			.then((record) => {
				if (record) setProject(record);
			})
			.catch((error: unknown) => {
				console.warn("Could not update this project's last-edited time:", error);
			});
	}, [projectId]);

	/** Throttled: runs now if it has not run recently, otherwise once the interval has passed. */
	const touch = useCallback(() => {
		if (!enabled || pendingTouchRef.current) return;

		const wait = TOUCH_INTERVAL_MS - (Date.now() - lastTouchAtRef.current);
		if (wait <= 0) {
			runTouch();
			return;
		}

		pendingTouchRef.current = setTimeout(() => {
			pendingTouchRef.current = null;
			runTouch();
		}, wait);
	}, [enabled, runTouch]);

	return { project, touch };
}
