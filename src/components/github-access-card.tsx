"use client";

import Link from "next/link";
import { useStackApp } from "@stackframe/stack";
import { ExternalLink, KeyRound, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { StateMark } from "@/components/state-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { connectGithubAccount } from "@/lib/github-connect";
import {
	GITHUB_TOKEN_SETUP_URL,
	clearStoredGithubToken,
	hasStoredGithubToken,
	setStoredGithubToken,
} from "@/lib/github-token";

export function GithubAccessCard({
	scopes,
	onRecovered,
	compact = false,
}: {
	scopes?: string[];
	onRecovered?: () => Promise<void> | void;
	compact?: boolean;
}) {
	const app = useStackApp();
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
			await connectGithubAccount(app, scopes);
			await finish("GitHub reconnected.");
		} catch (error) {
			setMessage(error instanceof Error ? error.message : "GitHub did not finish reconnecting. Try again, or use a token.");
		} finally {
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
		<div className="rounded-lg border border-contour/40 bg-contour-tint/40 p-3 sm:p-4">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0">
					<h2 className="text-sm font-bold text-foreground">Sketchflow can&apos;t reach GitHub</h2>
					<p className="mt-1 max-w-[60ch] text-sm text-muted-foreground">
						Reconnect so Sketchflow can read and save to your repository. Anything unsaved stays in this
						browser in the meantime.
					</p>
				</div>
				<Button size="sm" disabled={busy === "connect"} onClick={reconnect}>
					{busy === "connect" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
					Reconnect GitHub
				</Button>
			</div>

			<details className="mt-3 text-sm" open={hasToken || undefined}>
				<summary className="cursor-pointer rounded-sm font-medium text-foreground">
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

			<div className="mt-2 flex min-h-5 flex-wrap items-center gap-3 text-xs" aria-live="polite">
				{hasToken ? <StateMark state="synced" label="Using a personal access token" /> : null}
				{message ? <span className="text-muted-foreground">{message}</span> : null}
			</div>
		</div>
	);
}
