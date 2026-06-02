import Link from "next/link";
import {
	ArrowRight,
	GitBranch,
	History,
	KeyRound,
	Layers3,
	RefreshCw,
	RotateCcw,
	ShieldCheck,
	WifiOff,
} from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { GITHUB_TOKEN_SETUP_URL } from "@/lib/github-token";

const sections = [
	{
		icon: Layers3,
		title: "Workspace",
		copy: "A workspace is one GitHub repo. Projects are folders inside /projects.",
	},
	{
		icon: ShieldCheck,
		title: "Storage",
		copy: "Sketches, docs, assets, and metadata stay in GitHub. Postgres stores only app metadata.",
	},
	{
		icon: RefreshCw,
		title: "Sync",
		copy: "Drafts save locally first. Use Save to create a GitHub commit.",
	},
	{
		icon: KeyRound,
		title: "Access",
		copy: "Reconnect GitHub from the app, or paste a local token when OAuth needs a refresh.",
	},
];

const roadmap = [
	{
		icon: History,
		title: "Project history",
		copy: "Sketchflow will list commits that touched the selected project folder and let you preview each version.",
	},
	{
		icon: RotateCcw,
		title: "Project restore",
		copy: "Restores will copy only that project from an older commit into a new commit, keeping the workspace history intact.",
	},
	{
		icon: WifiOff,
		title: "Offline work",
		copy: "Connected workspaces can pause sync, and pure offline workspaces can stay in IndexedDB until you choose GitHub sync.",
	},
];

export default function HelpPage() {
	return (
		<main className="min-h-screen bg-background text-foreground">
			<header className="border-b bg-background/90 backdrop-blur">
				<div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
					<BrandMark href="/" subtitle="Help" />
					<div className="flex items-center gap-2">
						<Button variant="outline" size="sm" asChild>
							<Link href="https://github.com/SH20RAJ/sketch-flow" target="_blank">
								<GitBranch className="size-4" />
								GitHub
							</Link>
						</Button>
						<Button size="sm" asChild>
							<Link href="/app">
								Open app
								<ArrowRight className="size-4" />
							</Link>
						</Button>
					</div>
				</div>
			</header>

			<section className="mx-auto max-w-6xl px-5 py-12">
				<div className="max-w-3xl">
					<h1 className="text-4xl font-black tracking-tight">Sketchflow help</h1>
					<p className="mt-4 text-base font-semibold leading-7 text-muted-foreground">
						Sketchflow is a GitHub-native canvas for projects, diagrams, and docs.
					</p>
				</div>

				<div className="mt-8 grid gap-4 md:grid-cols-2">
					{sections.map((section) => {
						const Icon = section.icon;
						return (
							<div key={section.title} className="rounded-[18px] border bg-card p-5">
								<div className="flex items-center gap-2 text-sm font-extrabold">
									<Icon className="size-4 text-primary" />
									{section.title}
								</div>
								<p className="mt-2 text-sm font-semibold leading-6 text-muted-foreground">{section.copy}</p>
							</div>
						);
					})}
				</div>

				<div className="mt-8 rounded-[18px] border bg-card p-5">
					<h2 className="text-lg font-black">GitHub token fallback</h2>
					<p className="mt-2 text-sm font-semibold leading-6 text-muted-foreground">
						If GitHub OAuth needs a refresh, reconnect from Sketchflow first. If that still fails, create a
						local token with repo access and paste it into the recovery card. The token stays in this browser.
					</p>
					<div className="mt-4 flex flex-wrap gap-2">
						<Button asChild>
							<Link href={GITHUB_TOKEN_SETUP_URL} target="_blank">
								Create token
								<ArrowRight className="size-4" />
							</Link>
						</Button>
						<Button variant="outline" asChild>
							<Link href="/app/workspace">Reconnect GitHub</Link>
						</Button>
					</div>
				</div>

				<div className="mt-8 rounded-[18px] border bg-card p-5">
					<div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
						<div>
							<h2 className="text-lg font-black">Versioning and offline plan</h2>
							<p className="mt-2 text-sm font-semibold leading-6 text-muted-foreground">
								History and offline mode are designed around user-owned repos without forcing full workspace
								rollbacks.
							</p>
						</div>
						<Button variant="outline" asChild>
							<Link
								href="https://github.com/SH20RAJ/sketch-flow/blob/main/docs/project-versioning-offline-plan.md"
								target="_blank"
							>
								Read plan
								<ArrowRight className="size-4" />
							</Link>
						</Button>
					</div>

					<div className="mt-5 grid gap-3 md:grid-cols-3">
						{roadmap.map((item) => {
							const Icon = item.icon;
							return (
								<div key={item.title} className="rounded-2xl border bg-background p-4">
									<div className="flex items-center gap-2 text-sm font-extrabold">
										<Icon className="size-4 text-primary" />
										{item.title}
									</div>
									<p className="mt-2 text-sm font-semibold leading-6 text-muted-foreground">{item.copy}</p>
								</div>
							);
						})}
					</div>
				</div>
			</section>
		</main>
	);
}
