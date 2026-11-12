"use client";

import { Loader2, LogIn } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { signInWithGithub } from "@/lib/auth-client";

type GithubSignInButtonProps = {
	/** Where to come back to after sign-in. Defaults to the current page. */
	returnPath?: string;
	size?: "xs" | "sm" | "default";
	variant?: "default" | "outline" | "ghost";
	children?: ReactNode;
	title?: string;
};

/**
 * Starts GitHub sign-in in place. Never redirects on its own: it only acts when clicked, and
 * reports a failure to start inline instead of navigating away.
 */
export function GithubSignInButton({
	returnPath,
	size = "sm",
	variant = "default",
	children = "Sign in with GitHub",
	title,
}: GithubSignInButtonProps) {
	const [isPending, setIsPending] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	async function handleClick() {
		setIsPending(true);
		setErrorMessage(null);

		try {
			await signInWithGithub(returnPath);
			// On success the browser is already leaving for GitHub; keep the pending state.
		} catch (error) {
			setErrorMessage(error instanceof Error ? error.message : "GitHub sign-in did not start. Try again in a moment.");
			setIsPending(false);
		}
	}

	return (
		<span className="inline-flex flex-col items-start gap-1">
			<Button type="button" size={size} variant={variant} disabled={isPending} onClick={() => void handleClick()} title={title}>
				{isPending ? <Loader2 className="animate-spin" /> : <LogIn />}
				{children}
			</Button>
			{errorMessage ? (
				<span role="alert" className="text-xs text-destructive">
					{errorMessage}
				</span>
			) : null}
		</span>
	);
}
