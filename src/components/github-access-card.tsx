"use client";

import Link from "next/link";
import { ChevronDown, ExternalLink, KeyRound, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { StateGlyph } from "@/components/state-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signInWithGithub } from "@/lib/auth-client";
import {
	GITHUB_TOKEN_SETUP_URL,
	clearStoredGithubToken,
	hasStoredGithubToken,
	setStoredGithubToken,
} from "@/lib/github-token";

const DEFAULT_TITLE = "Sketchflow can't reach GitHub";
const DEFAULT_DESCRIPTION = "Reconnect so Sketchflow can read and save to your repository.";

/**
 * The reconnect prompt, with the personal access token fallback. Show it only when signing
 * in again is the fix; for every other GitHub problem use `GithubProblemNotice`, which
 * renders this card itself when it is the right answer.
 */
export function GithubAccessCard({
	onRecovered,
	compact = false,
	title = DEFAULT_TITLE,
	description = DEFAULT_DESCRIPTION,
}: {
	onRecovered?: () => Promise<void> | void;
	compact?: boolean;
	/** Heading and first sentence, when the caller knows more precisely what went wrong. */
	title?: string;
	description?: string;
}) {
	const [token, setToken] = useState("");
	const [hasToken, setHasToken] = useState(false);
	const [busy, setBusy] = useState<"connect" | "token" | null>(null);
	const [message, setMessage] = useState<string | null>(null);

	useEffect(() => {
		setHasToken(hasStoredGithubToken());
	}, []);

	async function finish(messageText: string) {
		setMessage(messageText);
		await onRecovered?.();
	}

	async function reconnect() {
		setBusy("connect");
		setMessage(null);

		try {
			// Leaves this page for GitHub and comes back here with a fresh token, so the busy
			// state stays on until the browser navigates away.
			await signInWithGithub();
		} catch (error) {
			setMessage(error instanceof Error ? error.message : "GitHub did not finish reconnecting. Try again, or use a token.");
			setBusy(null);
		}
	}

	async function saveToken() {
		const nextToken = token.trim();
		if (!nextToken) {
			setMessage("Paste a token before saving.");
			return;
		}

		setBusy("token");
		try {
			setStoredGithubToken(nextToken);
			setToken("");
			setHasToken(true);
			await finish("Token saved for this session.");
		} finally {
			setBusy(null);
		}
	}

	async function clearToken() {
		setBusy("token");
		try {
			clearStoredGithubToken();
			setHasToken(false);
			await finish("Token removed.");
		} finally {
			setBusy(null);
		}
	}

	return (
		<div role="alert" className="border-y border-destructive/50 py-3">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0">
					<h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
						<StateGlyph state="error" />
						{title}
					</h2>
					<p className="mt-1 max-w-[60ch] text-sm text-muted-foreground">
						{description} Anything unsaved stays in this browser in the meantime.
					</p>
				</div>
				<Button size="sm" disabled={busy === "connect"} onClick={reconnect}>
					{busy === "connect" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
					Reconnect GitHub
				</Button>
			</div>

			<details className="group/token mt-3 text-sm" open={hasToken || undefined}>
				<summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
					<ChevronDown className="size-4 text-muted-foreground group-open/token:rotate-180" />
					Use a personal access token instead
				</summary>
				<p className="mt-2 max-w-[60ch] text-[0.8125rem] text-muted-foreground">
					The token is kept in this browser tab&apos;s session only and is sent with your requests. Sketchflow never
					stores it.
				</p>
				<div className={compact ? "mt-2 grid gap-2" : "mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]"}>
					<Input
						value={token}
						onChange={(event) => setToken(event.target.value)}
						placeholder={hasToken ? "A token is saved for this session" : "ghp_..."}
						type="password"
						autoComplete="off"
						aria-label="GitHub personal access token"
						className="datum"
					/>
					<Button variant="outline" disabled={busy === "token"} onClick={saveToken}>
						{busy === "token" ? <Loader2 className="animate-spin" /> : <KeyRound />}
						Save token
					</Button>
					<Button variant="ghost" disabled={!hasToken} onClick={clearToken}>
						<Trash2 />
						Remove
					</Button>
				</div>
				<Link
					href={GITHUB_TOKEN_SETUP_URL}
					target="_blank"
					rel="noopener noreferrer"
					className="mt-2 inline-flex items-center gap-1 text-[0.8125rem] text-primary underline"
				>
					Create a token with repository access
					<ExternalLink className="size-3.5" />
				</Link>
			</details>

			{hasToken || message ? (
				<p className="mt-2 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground" aria-live="polite">
					{hasToken ? <span>Using a personal access token for this session.</span> : null}
					{message ? <span>{message}</span> : null}
				</p>
			) : null}
		</div>
	);
}
