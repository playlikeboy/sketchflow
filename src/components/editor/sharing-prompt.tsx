"use client";

import Link from "next/link";

import { GithubSignInButton } from "@/components/editor/github-sign-in-button";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

/** Where the sync panel lives: the place to move a device project into a repository. */
export const WORKSPACE_SYNC_PATH = "/app/workspace";

type SharingPromptProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	isSignedIn: boolean;
	/** What the person tried to do, for the title: "Sharing", "Forking". */
	action?: string;
	/** Replaces the default explanation, e.g. for forking someone else's project. */
	description?: string;
};

/**
 * Sharing, embedding and forking need a GitHub repository. Instead of navigating anywhere or
 * calling an API, this explains what is missing and offers the one step that unblocks it.
 */
export function SharingPrompt({ open, onOpenChange, isSignedIn, action = "Sharing", description }: SharingPromptProps) {
	const explanation =
		description ??
		(isSignedIn
			? "Sync this project to a repository first. Share and embed links point at the copy in your repository."
			: "Sign in and sync this project to a repository. Share and embed links point at the copy in your repository.");

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>{action} needs GitHub</DialogTitle>
					<DialogDescription>{explanation}</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
						Not now
					</Button>
					{isSignedIn ? (
						<Button size="sm" asChild>
							<Link href={WORKSPACE_SYNC_PATH}>Sync to a repository</Link>
						</Button>
					) : (
						<GithubSignInButton />
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
