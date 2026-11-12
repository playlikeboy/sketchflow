import Link from "next/link";

import { GithubSignInButton } from "@/components/editor/github-sign-in-button";
import { Button } from "@/components/ui/button";
import { LOCAL_WORKSPACE_ID } from "@/lib/local-workspace";

function NoticeCard({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
	return (
		<div className="grid h-full place-items-center p-6">
			<div className="max-w-md rounded-lg border border-rule bg-card p-5">
				<h2 className="text-base font-bold">{title}</h2>
				<p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
				<div className="mt-4 flex flex-wrap items-start gap-2">{children}</div>
			</div>
		</div>
	);
}

/** Shown in place of the canvas when a repository project needs a GitHub session to load. */
export function RepositorySignInNotice() {
	return (
		<NoticeCard
			title="Sign in to open projects in this repository"
			body="This project lives in a GitHub repository. Sign in with GitHub to open it. Projects on this device keep working without an account."
		>
			<GithubSignInButton />
			<Button variant="outline" size="sm" asChild>
				<Link href={`/app?workspace=${LOCAL_WORKSPACE_ID}`}>Projects on this device</Link>
			</Button>
		</NoticeCard>
	);
}

/** Shown when a guest-workspace project has no data in this browser. */
export function LocalProjectMissingNotice() {
	return (
		<NoticeCard
			title="This project isn't on this device"
			body="Projects you make without signing in are stored in this browser only. It may have been made in another browser, or this browser's site data was cleared."
		>
			<Button variant="outline" size="sm" asChild>
				<Link href={`/app?workspace=${LOCAL_WORKSPACE_ID}`}>Back to projects on this device</Link>
			</Button>
		</NoticeCard>
	);
}
