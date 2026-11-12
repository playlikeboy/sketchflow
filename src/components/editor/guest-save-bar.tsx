"use client";

import { CloudUpload, Share2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { GithubSignInButton } from "@/components/editor/github-sign-in-button";
import { SharingPrompt, WORKSPACE_SYNC_PATH } from "@/components/editor/sharing-prompt";
import { StateMark } from "@/components/state-mark";
import { Button } from "@/components/ui/button";

function savedLabel(savedAt: string | null) {
	const date = savedAt ? new Date(savedAt) : null;
	if (!date || Number.isNaN(date.getTime())) return "Saved on this device";
	return `Saved on this device · ${date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
}

type GuestSaveBarProps = {
	/** When the last draft reached IndexedDB. */
	savedAt: string | null;
	isSignedIn: boolean;
};

/**
 * The guest workspace's replacement for Commit/Sync: drafts save to this browser on their own,
 * so this only reports that, and offers the optional backup and sharing paths.
 */
export function GuestSaveBar({ savedAt, isSignedIn }: GuestSaveBarProps) {
	const [isSharingPromptOpen, setIsSharingPromptOpen] = useState(false);
	// An icon alone on a phone, where the header has no room; the name stays for screen readers.
	const backupLabel = <span className="sr-only sm:not-sr-only">Back up to GitHub</span>;

	return (
		<>
			<span className="hidden px-1 sm:inline-flex" aria-live="polite">
				<StateMark state="local" label={savedLabel(savedAt)} />
			</span>

			<Button variant="ghost" size="sm" onClick={() => setIsSharingPromptOpen(true)} title="Share or embed this project">
				<Share2 />
				<span className="hidden lg:inline">Share</span>
			</Button>

			{isSignedIn ? (
				<Button size="sm" asChild title="Copy this project into a GitHub repository">
					<Link href={WORKSPACE_SYNC_PATH}>
						<CloudUpload />
						{backupLabel}
					</Link>
				</Button>
			) : (
				<GithubSignInButton title="Sign in to copy this project into a GitHub repository">{backupLabel}</GithubSignInButton>
			)}

			<SharingPrompt open={isSharingPromptOpen} onOpenChange={setIsSharingPromptOpen} isSignedIn={isSignedIn} />
		</>
	);
}
