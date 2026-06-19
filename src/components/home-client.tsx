"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStackApp } from "@stackframe/stack";
import {
	ArrowRight,
	BookOpen,
	Boxes,
	BrainCircuit,
	CheckCircle2,
	Code2,
	FileText,
	GitBranch,
	Globe,
	Layers3,
	Loader2,
	Moon,
	Network,
	PenTool,
	RefreshCw,
	ShieldCheck,
	Sparkles,
	Sun,
	Users,
	Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { SKETCHFLOW_APP_URL } from "@/lib/config";
import { useAuthMe } from "@/lib/swr-hooks";

const repoFiles = [
	"projects/day1/sketches/system-map.excalidraw.json",
	"projects/day1/docs/notes.md",
	"projects/projects-metadata.json",
	".sketchflow/workspace.json",
];

const workflow = [
	{
		icon: GitBranch,
		title: "Connect a repo",
		description: "Create or connect a public GitHub workspace and keep every project folder portable.",
	},
	{
		icon: PenTool,
		title: "Sketch and write",
		description: "Use a full Excalidraw canvas with notes saved beside every project.",
	},
	{
		icon: RefreshCw,
		title: "Commit snapshots",
		description: "Local drafts stay instant. GitHub commits store durable project history.",
	},
	{
		icon: Globe,
		title: "Publish from GitHub",
		description: "Share public project pages and embeds backed by repo files.",
	},
];

const personas = [
	{
		icon: Network,
		title: "Architects",
		description: "Map systems, dependencies, services, and decision trails without losing context.",
	},
	{
		icon: Code2,
		title: "Developers",
		description: "Turn sketches into project docs, issue context, exports, and future AI memory.",
	},
	{
		icon: BookOpen,
		title: "Teachers",
		description: "Build lesson boards, explain flows, publish references, and reuse libraries.",
	},
];

const features = [
	{ icon: ShieldCheck, label: "User-owned data" },
	{ icon: FileText, label: "Docs beside sketches" },
	{ icon: Boxes, label: "Excalidraw libraries" },
	{ icon: BrainCircuit, label: "AI-ready memory" },
	{ icon: Users, label: "Collab-ready rooms" },
	{ icon: Layers3, label: "Project index" },
];

export function HomeClient() {
	const app = useStackApp();
	const router = useRouter();
	const { theme, setTheme } = useTheme();
	const [mounted, setMounted] = useState(false);
	const { data: auth, isLoading } = useAuthMe();

	useEffect(() => {
		setMounted(true);
	}, []);

	useEffect(() => {
		if (auth?.authenticated) {
			router.replace("/app");
		}
	}, [auth, router]);

	if (isLoading || auth?.authenticated) {
		return (
			<main className="grid min-h-screen place-items-center bg-background">
				<div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
					<Loader2 className="size-4 animate-spin text-primary" />
					Opening Sketchflow
				</div>
			</main>
		);
	}

	return (
		<main className="min-h-screen bg-background text-foreground">
			<header className="sticky top-0 z-30 border-b bg-background/88 backdrop-blur-xl">
				<div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
					<Link href="/" aria-label="Sketchflow home">
						<BrandMark subtitle="GitHub-native canvas" />
					</Link>
					<nav className="hidden items-center gap-5 text-sm font-bold text-muted-foreground md:flex">
						<a href="#workflow" className="hover:text-foreground">
							Workflow
						</a>
						<a href="#use-cases" className="hover:text-foreground">
							Use cases
						</a>
						<a href="#ownership" className="hover:text-foreground">
							Ownership
						</a>
						<Link href="/help" className="hover:text-foreground">
							Help
						</Link>
					</nav>
					<div className="flex items-center gap-2">
						<Button
							variant="ghost"
							size="icon-sm"
							onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
							aria-label="Toggle theme"
						>
							{mounted && theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
						</Button>
						<button
							className="btn-3d btn-3d--secondary h-9 px-4 text-xs font-extrabold cursor-pointer"
							onClick={() => void app.redirectToSignIn()}
						>
							Sign in
						</button>
						<Link
							href="https://github.com/SH20RAJ/sketch-flow"
							target="_blank"
							className="btn-3d btn-3d--secondary size-9 p-0 cursor-pointer flex items-center justify-center"
							aria-label="Sketchflow on GitHub"
						>
							<GitBranch className="size-4" />
						</Link>
						<button
							className="btn-3d btn-3d--primary h-9 px-4 text-xs font-extrabold cursor-pointer"
							onClick={() => void app.redirectToSignUp()}
						>
							Start free
							<ArrowRight className="size-4" />
						</button>
					</div>
				</div>
			</header>

			<section className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:py-20">
				<div>
					<div className="inline-flex items-center gap-2 rounded-full border bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">
						<Sparkles className="size-3.5 text-primary" />
						Excalidraw comfort, GitHub ownership
					</div>
					<h1 className="mt-5 max-w-4xl text-4xl font-black leading-[1.02] sm:text-6xl">
						The visual workspace that lives in your GitHub repo.
					</h1>
					<p className="mt-5 max-w-2xl text-base font-semibold leading-7 text-muted-foreground sm:text-lg">
						Sketchflow gives builders one place to sketch systems, write notes, publish project pages,
						and keep all durable files in a repo they control.
					</p>
					<div className="mt-8 flex flex-wrap gap-3">
						<button
							className="btn-3d btn-3d--primary h-12 px-6 text-sm font-extrabold cursor-pointer"
							onClick={() => void app.redirectToSignUp()}
						>
							Create workspace
							<ArrowRight className="size-4" />
						</button>
						<Link
							href="/app"
							className="btn-3d btn-3d--secondary h-12 px-6 text-sm font-extrabold cursor-pointer flex items-center justify-center"
						>
							Open app
							<GitBranch className="size-4 ml-1.5" />
						</Link>
					</div>
					<div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
						{[
							["GitHub", "source of truth"],
							["IndexedDB", "instant drafts"],
							["SWR", "active project cache"],
						].map(([title, label]) => (
							<div key={title} className="rounded-[16px] border bg-card px-4 py-3">
								<div className="text-lg font-black">{title}</div>
								<div className="text-xs font-bold text-muted-foreground">{label}</div>
							</div>
						))}
					</div>
				</div>

				<div className="rounded-[24px] border bg-card p-4 shadow-sm">
					<div className="rounded-[18px] border bg-muted p-4">
						<div className="flex items-center justify-between gap-3 text-xs font-bold text-muted-foreground">
							<span>SH20RAJ/sketchflow-workspace</span>
							<span>main</span>
						</div>
						<div className="mt-4 grid gap-2">
							{repoFiles.map((item) => (
								<div
									key={item}
									className="flex items-center gap-3 rounded-[14px] border bg-background px-3 py-3 font-mono text-xs font-semibold text-muted-foreground"
								>
									<GitBranch className="size-4 shrink-0 text-primary" />
									<span className="truncate">{item}</span>
								</div>
							))}
						</div>
					</div>
					<div className="mt-4 grid gap-3 sm:grid-cols-2">
						<div className="rounded-[18px] border bg-background p-4">
							<div className="flex items-center gap-2 text-sm font-black">
								<Zap className="size-4 text-primary" />
								Fast first
							</div>
							<p className="mt-2 text-sm font-semibold text-muted-foreground">
								Draft locally, then sync intentional snapshots.
							</p>
						</div>
						<div className="rounded-[18px] border bg-background p-4">
							<div className="flex items-center gap-2 text-sm font-black">
								<ShieldCheck className="size-4 text-primary" />
								Portable
							</div>
							<p className="mt-2 text-sm font-semibold text-muted-foreground">
								Files stay readable, public, and forkable.
							</p>
						</div>
					</div>
				</div>
			</section>

			<section id="workflow" className="border-y bg-muted/35">
				<div className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
					<div className="max-w-2xl">
						<h2 className="text-3xl font-black">A calmer way to build visual project memory.</h2>
						<p className="mt-3 text-sm font-semibold leading-6 text-muted-foreground">
							Sketchflow keeps the live editing surface light and the durable history explicit.
						</p>
					</div>
					<div className="mt-8 grid gap-4 md:grid-cols-4">
						{workflow.map((step) => {
							const Icon = step.icon;
							return (
								<div key={step.title} className="rounded-[20px] border bg-card p-5 shadow-sm">
									<div className="grid size-10 place-items-center rounded-[14px] bg-primary/10 text-primary">
										<Icon className="size-5" />
									</div>
									<h3 className="mt-4 text-base font-black">{step.title}</h3>
									<p className="mt-2 text-sm font-semibold leading-6 text-muted-foreground">{step.description}</p>
								</div>
							);
						})}
					</div>
				</div>
			</section>

			<section id="use-cases" className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
				<div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
					<div>
						<h2 className="text-3xl font-black">Built for people who explain systems.</h2>
						<p className="mt-3 text-sm font-semibold leading-6 text-muted-foreground">
							Architects, developers, teachers, founders, and teams get one organized workspace
							instead of scattered canvases and forgotten notes.
						</p>
					</div>
					<div className="grid gap-4 md:grid-cols-3">
						{personas.map((item) => {
							const Icon = item.icon;
							return (
								<div key={item.title} className="rounded-[20px] border bg-card p-5">
									<Icon className="size-5 text-primary" />
									<h3 className="mt-4 text-base font-black">{item.title}</h3>
									<p className="mt-2 text-sm font-semibold leading-6 text-muted-foreground">{item.description}</p>
								</div>
							);
						})}
					</div>
				</div>
				<div className="mt-8 flex flex-wrap gap-2">
					{features.map((item) => {
						const Icon = item.icon;
						return (
							<div
								key={item.label}
								className="inline-flex items-center gap-2 rounded-full border bg-muted px-3 py-2 text-sm font-bold text-muted-foreground"
							>
								<Icon className="size-4" />
								{item.label}
							</div>
						);
					})}
				</div>
			</section>

			<section id="ownership" className="mx-auto max-w-7xl px-5 pb-16 sm:px-8">
				<div className="grid gap-4 lg:grid-cols-3">
					<div className="rounded-[24px] border bg-card p-6 lg:col-span-2">
						<div className="flex items-center gap-2 text-sm font-black text-primary">
							<CheckCircle2 className="size-4" />
							Why this is different
						</div>
						<h2 className="mt-3 text-3xl font-black">Sketchflow is not another locked whiteboard.</h2>
						<p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-muted-foreground">
							The app database stays small. GitHub stores the real project files: scene JSON,
							notes, metadata, assets, exports, and public pages.
						</p>
						<div className="mt-6 grid gap-3 md:grid-cols-3">
							{["No sketch DB lock-in", "Commit-based history", "Public pages from repos"].map((item) => (
								<div key={item} className="rounded-[16px] border bg-muted/45 px-4 py-3 text-sm font-black">
									{item}
								</div>
							))}
						</div>
					</div>
					<div className="rounded-[24px] border bg-primary p-6 text-primary-foreground">
						<h2 className="text-2xl font-black">Start with one repo.</h2>
						<p className="mt-3 text-sm font-bold leading-6 opacity-80">
							Add projects, docs, canvases, libraries, exports, and public embeds from the same workspace.
						</p>
						<button
							className="btn-3d btn-3d--secondary mt-6 w-full h-11 text-xs font-extrabold cursor-pointer"
							onClick={() => void app.redirectToSignUp()}
						>
							Create workspace
							<ArrowRight className="size-4" />
						</button>
					</div>
				</div>
			</section>

			<footer className="border-t">
				<div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-xs font-bold text-muted-foreground sm:px-8">
					<span>Sketchflow</span>
					<div className="flex items-center gap-4">
						<a href={SKETCHFLOW_APP_URL} className="hover:text-foreground">
							sketchflow.space
						</a>
						<Link href="/app" className="hover:text-foreground">
							Open app
						</Link>
						<Link href="https://github.com/SH20RAJ/sketch-flow" target="_blank" className="hover:text-foreground">
							GitHub
						</Link>
					</div>
				</div>
			</footer>
		</main>
	);
}
