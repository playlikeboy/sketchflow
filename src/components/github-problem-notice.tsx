"use client";

/**
 * GithubProblemNotice: explains one GitHub problem and offers the step that fixes it.
 *
 * Props
 *   code      A `GithubErrorCode` from src/lib/github-errors.ts. Get it with
 *             `githubProblemFromError(error)` for a thrown `ApiError`, or
 *             `githubProblemFromStatus(status)` for the `/api/github/status` response. Both
 *             return `{ code, retryAt? } | null`, which can be spread straight into this
 *             component: `{problem ? <GithubProblemNotice {...problem} onRetry={retry} /> : null}`.
 *   retryAt   Optional ISO time a rate limit lifts. While it is still ahead, the notice shows
 *             the time and hides the retry button, then offers the button once it passes.
 *   onRetry   Optional. Called by "Try again", and after a successful reconnect or token save.
 *             May return a promise; the button shows progress until it settles.
 *   compact   Optional. Stacks the layout for narrow panels such as the editor side panel.
 *
 * What it renders
 *   github_token_invalid, github_not_connected, github_token_unavailable, github_missing_scope
 *     -> the reconnect card (`GithubAccessCard`, with its personal access token fallback).
 *   every other code (rate limited, unavailable, not found, access denied, API error)
 *     -> a calm notice with "Try again" or the wait time, and never a reconnect prompt.
 *
 * The notice only informs. Place it beside the content, never instead of it: the app is local
 * first, and creating and editing keep working while GitHub does not.
 */

import Link from "next/link";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { GithubAccessCard } from "@/components/github-access-card";
import { StateGlyph } from "@/components/state-mark";
import { Button } from "@/components/ui/button";
import { githubErrorCopy, needsGithubReconnect, type GithubErrorCode } from "@/lib/github-errors";
import { GITHUB_ACCESS_SETTINGS_URL } from "@/lib/github-token";

// setTimeout cannot hold a delay longer than a signed 32-bit number of milliseconds.
const MAX_TIMER_MS = 2_000_000_000;

export type GithubProblemNoticeProps = {
	code: GithubErrorCode;
	retryAt?: string | null;
	onRetry?: () => Promise<void> | void;
	compact?: boolean;
};

/** True until the clock reaches `retryAt`; false straight away when there is no time to wait for. */
function useIsWaitingUntil(retryAt: string | null | undefined) {
	const [reachedRetryAt, setReachedRetryAt] = useState<string | null>(null);

	useEffect(() => {
		if (!retryAt) return;

		const remaining = Date.parse(retryAt) - Date.now();
		const delay = Number.isNaN(remaining) ? 0 : Math.min(Math.max(remaining, 0), MAX_TIMER_MS);
		const timer = setTimeout(() => setReachedRetryAt(retryAt), delay);

		return () => clearTimeout(timer);
	}, [retryAt]);

	return Boolean(retryAt) && reachedRetryAt !== retryAt;
}

function RetryButton({ onRetry }: { onRetry: () => Promise<void> | void }) {
	const [isRetrying, setIsRetrying] = useState(false);

	async function handleRetry() {
		setIsRetrying(true);
		try {
			await onRetry();
		} catch {
			// The caller shows its own error; a failed retry leaves this notice in place.
		} finally {
			setIsRetrying(false);
		}
	}

	return (
		<Button variant="outline" size="sm" disabled={isRetrying} onClick={() => void handleRetry()}>
			{isRetrying ? <Loader2 className="animate-spin" /> : <RefreshCw />}
			Try again
		</Button>
	);
}

export function GithubProblemNotice({ code, retryAt, onRetry, compact = false }: GithubProblemNoticeProps) {
	const isWaiting = useIsWaitingUntil(retryAt);
	const copy = githubErrorCopy(code, { retryAt: isWaiting ? retryAt : null });

	if (needsGithubReconnect(code)) {
		return <GithubAccessCard compact={compact} onRecovered={onRetry} title={copy.title} description={copy.message} />;
	}

	const canRetryNow = Boolean(onRetry) && !isWaiting;

	return (
		<div role="status" className="border-y border-rule py-3">
			<div className={compact ? "grid gap-2.5" : "flex flex-wrap items-start justify-between gap-3"}>
				<div className="min-w-0">
					<h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
						<StateGlyph state="offline" />
						{copy.title}
					</h2>
					<p className="mt-1 max-w-[60ch] text-sm text-muted-foreground">{copy.message}</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					{copy.action === "open-github" ? (
						<Button variant="ghost" size="sm" asChild>
							<Link href={GITHUB_ACCESS_SETTINGS_URL} target="_blank" rel="noopener noreferrer">
								<ExternalLink />
								Review access on GitHub
							</Link>
						</Button>
					) : null}
					{canRetryNow && onRetry ? <RetryButton onRetry={onRetry} /> : null}
				</div>
			</div>
		</div>
	);
}
