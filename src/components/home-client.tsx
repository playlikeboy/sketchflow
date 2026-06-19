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
	const [activeDemoTab, setActiveDemoTab] = useState<"canvas" | "notes" | "git">("canvas");
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
						The GitHub-native visual workspace.
					</h1>
					<p className="mt-5 max-w-2xl text-base font-semibold leading-7 text-muted-foreground sm:text-lg">
						Create visual architecture maps, draft documentation side-by-side, and keep every sketch, note, and asset cleanly versioned inside your own repository.
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

				<div className="rounded-[24px] border bg-card p-4 shadow-md flex flex-col min-h-[360px]">
					<div className="flex items-center justify-between border-b pb-2 mb-3">
						<div className="flex gap-2">
							<button 
								onClick={() => setActiveDemoTab("canvas")}
								className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
									activeDemoTab === "canvas" ? "bg-primary text-white shadow-[0_2px_0_var(--duo-feather-shadow)]" : "hover:bg-muted text-muted-foreground"
								}`}
							>
								🗺️ Canvas
							</button>
							<button 
								onClick={() => setActiveDemoTab("notes")}
								className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
									activeDemoTab === "notes" ? "bg-primary text-white shadow-[0_2px_0_var(--duo-feather-shadow)]" : "hover:bg-muted text-muted-foreground"
								}`}
							>
								📝 Notes
							</button>
							<button 
								onClick={() => setActiveDemoTab("git")}
								className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
									activeDemoTab === "git" ? "bg-primary text-white shadow-[0_2px_0_var(--duo-feather-shadow)]" : "hover:bg-muted text-muted-foreground"
								}`}
							>
								📜 Git Log
							</button>
						</div>
						<div className="text-[10px] font-extrabold text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
							demo-repo / main
						</div>
					</div>

					<div className="flex-1 rounded-[18px] border bg-muted/30 p-4 flex flex-col justify-center min-h-[220px]">
						{activeDemoTab === "canvas" && (
							<div className="space-y-4 flex flex-col items-center justify-center h-full py-4">
								<div className="flex items-center justify-center gap-6 w-full max-w-sm">
									<div className="flex flex-col items-center gap-1.5 p-3 rounded-xl border bg-card shadow-sm text-center w-24">
										<Globe className="size-5 text-[#1CB0F6]" />
										<span className="text-[10px] font-extrabold">Client</span>
									</div>
									<div className="text-muted-foreground">➔</div>
									<div className="flex flex-col items-center gap-1.5 p-3 rounded-xl border bg-card shadow-sm text-center w-24">
										<Code2 className="size-5 text-[#58CC02]" />
										<span className="text-[10px] font-extrabold">App API</span>
									</div>
									<div className="text-muted-foreground">➔</div>
									<div className="flex flex-col items-center gap-1.5 p-3 rounded-xl border bg-card shadow-sm text-center w-24">
										<GitBranch className="size-5 text-[#CE82FF]" />
										<span className="text-[10px] font-extrabold">GitHub</span>
									</div>
								</div>
								<div className="text-[10px] font-bold text-muted-foreground text-center max-w-xs mt-2 leading-relaxed">
									Visual whiteboards commit shapes directly as raw JSON commits
								</div>
							</div>
						)}

						{activeDemoTab === "notes" && (
							<div className="font-sans space-y-2 text-left text-xs leading-relaxed text-foreground">
								<div className="text-sm font-extrabold text-primary mb-1"># Project System Map</div>
								<p className="text-muted-foreground font-semibold">Architecture notes saved in `/docs/notes.md` alongside drawings:</p>
								<ul className="space-y-1.5 mt-2">
									<li className="flex items-center gap-2 font-bold"><span className="text-primary">✔</span> Data is stored in your private/public repo</li>
									<li className="flex items-center gap-2 font-bold"><span className="text-primary">✔</span> No proprietary server databases</li>
									<li className="flex items-center gap-2 font-bold"><span className="text-primary">✔</span> Simple portable markdown files</li>
								</ul>
							</div>
						)}

						{activeDemoTab === "git" && (
							<div className="space-y-2.5 font-mono text-[10px] text-left w-full">
								<div className="flex justify-between items-center p-2 rounded-lg bg-card border">
									<div className="flex items-center gap-2">
										<span className="w-1.5 h-1.5 rounded-full bg-primary" />
										<span className="font-bold text-foreground">feat: update product flow design</span>
									</div>
									<span className="text-muted-foreground">a1b2c3d</span>
								</div>
								<div className="flex justify-between items-center p-2 rounded-lg bg-card border opacity-85">
									<div className="flex items-center gap-2">
										<span className="w-1.5 h-1.5 rounded-full bg-primary" />
										<span className="font-bold text-foreground">docs: add api notes document</span>
									</div>
									<span className="text-muted-foreground">e4f5g6h</span>
								</div>
								<div className="flex justify-between items-center p-2 rounded-lg bg-card border opacity-70">
									<div className="flex items-center gap-2">
										<span className="w-1.5 h-1.5 rounded-full bg-primary" />
										<span className="font-bold text-foreground">Initial commit: setup</span>
									</div>
									<span className="text-muted-foreground">j7k8l9m</span>
								</div>
							</div>
						)}
					</div>
					<div className="mt-4 grid gap-3 sm:grid-cols-2">
						<div className="rounded-[18px] border bg-background p-4 shadow-sm hover:border-primary/45 transition-colors">
							<div className="flex items-center gap-2 text-sm font-black">
								<Zap className="size-4 text-primary" />
								Fast Drafts
							</div>
							<p className="mt-1.5 text-xs font-semibold text-muted-foreground leading-relaxed">
								Autosaves locally to IndexedDB instantly. Commit to GitHub only when ready.
							</p>
						</div>
						<div className="rounded-[18px] border bg-background p-4 shadow-sm hover:border-primary/45 transition-colors">
							<div className="flex items-center gap-2 text-sm font-black">
								<ShieldCheck className="size-4 text-primary" />
								100% Portable
							</div>
							<p className="mt-1.5 text-xs font-semibold text-muted-foreground leading-relaxed">
								Your sketches stay inside your repository. No vendor database lock-in.
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
