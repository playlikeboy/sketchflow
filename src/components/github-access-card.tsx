"use client";

import Link from "next/link";
import { useStackApp } from "@stackframe/stack";
import { CheckCircle2, ExternalLink, GitBranch, KeyRound, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

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
			await finish("GitHub refreshed.");
		} catch (error) {
			setMessage(error instanceof Error ? error.message : "GitHub refresh did not finish.");
		} finally {
			setBusy(null);
		}
	}

	async function saveToken() {
		const nextToken = token.trim();
		if (!nextToken) {
			setMessage("Paste a GitHub token first.");
			return;
		}

		setBusy("token");
		setStoredGithubToken(nextToken);
		setToken("");
		setHasToken(true);
		await finish("Local GitHub token saved.");
		setBusy(null);
	}

	async function clearToken() {
		clearStoredGithubToken();
		setHasToken(false);
		await finish("Local GitHub token removed.");
	}

	return (
		<div className="rounded-[16px] border bg-card p-4">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="flex items-center gap-2 text-sm font-extrabold text-foreground">
						<GitBranch className="size-4 text-primary" />
						Refresh GitHub access
					</div>
					<p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-muted-foreground">
						Reconnect OAuth, or use a local token for this browser.
					</p>
				</div>
				<Button variant="outline" size="sm" disabled={busy === "connect"} onClick={reconnect}>
					{busy === "connect" ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
					Reconnect
				</Button>
			</div>

			{compact ? null : (
				<div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
					<Input
						value={token}
						onChange={(event) => setToken(event.target.value)}
						placeholder={hasToken ? "Local token saved" : "Paste GitHub token"}
						type="password"
						autoComplete="off"
						aria-label="GitHub personal access token"
					/>
					<Button variant="outline" disabled={busy === "token"} onClick={saveToken}>
						{busy === "token" ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
						Use local token
					</Button>
					<Button variant="ghost" disabled={!hasToken} onClick={clearToken}>
						<Trash2 className="size-4" />
						Clear
					</Button>
				</div>
			)}

			<div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-semibold text-muted-foreground">
				{hasToken ? (
					<span className="inline-flex items-center gap-1.5 text-primary">
						<CheckCircle2 className="size-3.5" />
						Local fallback active
					</span>
				) : null}
				<Link href={GITHUB_TOKEN_SETUP_URL} target="_blank" className="inline-flex items-center gap-1 hover:text-foreground">
					Create token with repo access
					<ExternalLink className="size-3.5" />
				</Link>
				{message ? <span>{message}</span> : null}
			</div>
		</div>
	);
}
