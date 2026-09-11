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
import { ThemeToggle } from "@/components/theme-toggle";
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
		title: "Connect your repo",
		description: "Point to any existing GitHub repository or initialize a new workspace. Private or public, personal or org.",
	},
	{
		icon: PenTool,
		title: "Sketch & write side-by-side",
		description: "Infinite Excalidraw canvas on one side, rich Markdown documentation on the other. Zero context switching.",
	},
	{
		icon: RefreshCw,
		title: "Atomic snapshot commits",
		description: "Local drafts save in 0ms to IndexedDB. One click pushes atomic Git commits to your repo tree.",
	},
	{
		icon: Globe,
		title: "Share & embed anywhere",
		description: "Embed live diagrams in GitHub READMEs, share immutable public links, or inspect raw files in your IDE.",
	},
];

const personas = [
	{
		icon: Network,
		title: "System Architects",
		description: "Map distributed microservices, cloud topologies, and database schemas with visual clarity that stays linked to code.",
	},
	{
		icon: Code2,
		title: "Engineers & Tech Leads",
		description: "Draft technical RFCs, system design specs, and PR architecture side-by-side with visual diagrams.",
	},
	{
		icon: BookOpen,
		title: "Open Source Maintainers",
		description: "Deliver crystal-clear contributor onboarding, interactive architecture guides, and reproducible diagrams in your repo.",
	},
];

const features = [
	{ icon: ShieldCheck, label: "Zero database lock-in" },
	{ icon: FileText, label: "Markdown docs beside sketches" },
	{ icon: Boxes, label: "Reusable Excalidraw libraries" },
	{ icon: BrainCircuit, label: "AI-ready architecture context" },
	{ icon: Users, label: "0ms offline-first drafts" },
	{ icon: Layers3, label: "Multi-file atomic Git commits" },
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
						<a href="#workflow" className="hover:text-foreground transition-colors">
							Workflow
						</a>
						<a href="#use-cases" className="hover:text-foreground transition-colors">
							Use cases
						</a>
						<a href="#ownership" className="hover:text-foreground transition-colors">
							Manifesto
						</a>
						<Link href="/help" className="hover:text-foreground transition-colors">
							Help
						</Link>
					</nav>
					<div className="flex items-center gap-2">
						<ThemeToggle className="size-9 rounded-xl border border-border/50" />
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
					<div className="inline-flex items-center gap-2 rounded-full border bg-muted/60 px-3.5 py-1 text-xs font-bold text-muted-foreground backdrop-blur-sm">
						<Sparkles className="size-3.5 text-primary" />
						Zero Vendor Lock-In · Git-Backed Visual Workspace
					</div>
					<h1 className="mt-5 max-w-4xl text-4xl font-black leading-[1.02] tracking-tight sm:text-6xl">
						Visual thinking meets <span className="text-primary">Git reality</span>.
					</h1>
					<p className="mt-5 max-w-2xl text-base font-semibold leading-7 text-muted-foreground sm:text-lg">
						Sketch architecture maps, draft technical specs side-by-side, and commit atomic .excalidraw and Markdown snapshots directly to your repository.
					</p>
					<div className="mt-8 flex flex-wrap gap-3">
						<button
							className="btn-3d btn-3d--primary h-12 px-6 text-sm font-extrabold cursor-pointer"
							onClick={() => void app.redirectToSignUp()}
						>
							Start with GitHub
							<ArrowRight className="size-4" />
						</button>
						<Link
							href="/app"
							className="btn-3d btn-3d--secondary h-12 px-6 text-sm font-extrabold cursor-pointer flex items-center justify-center"
						>
							Open workspace
							<GitBranch className="size-4 ml-1.5" />
						</Link>
					</div>
					<div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
						{[
							["GitHub", "Durable source of truth"],
							["0ms Latency", "Offline-first local drafts"],
							["Open Formats", "Standard .json & .md files"],
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
							your-org / cloud-arch · main
						</div>
					</div>

					<div className="flex-1 rounded-[18px] border bg-muted/30 p-4 flex flex-col justify-center min-h-[220px]">
						{activeDemoTab === "canvas" && (
							<div className="space-y-4 flex flex-col items-center justify-center h-full py-4">
								<div className="flex items-center justify-center gap-6 w-full max-w-sm">
									<div className="flex flex-col items-center gap-1.5 p-3 rounded-xl border bg-card shadow-sm text-center w-24">
										<Globe className="size-5 text-[#1CB0F6]" />
										<span className="text-[10px] font-extrabold">Web Client</span>
									</div>
									<div className="text-muted-foreground font-bold">➔</div>
									<div className="flex flex-col items-center gap-1.5 p-3 rounded-xl border bg-card shadow-sm text-center w-24">
										<Code2 className="size-5 text-[#58CC02]" />
										<span className="text-[10px] font-extrabold">Edge Worker</span>
									</div>
									<div className="text-muted-foreground font-bold">➔</div>
									<div className="flex flex-col items-center gap-1.5 p-3 rounded-xl border bg-card shadow-sm text-center w-24">
										<GitBranch className="size-5 text-[#CE82FF]" />
										<span className="text-[10px] font-extrabold">GitHub Repo</span>
									</div>
								</div>
								<div className="text-[11px] font-bold text-muted-foreground text-center max-w-xs mt-2 leading-relaxed">
									Infinite Excalidraw canvas saved as clean, portable <code className="text-foreground bg-muted px-1 py-0.5 rounded text-[10px]">.excalidraw.json</code> files.
								</div>
							</div>
						)}

						{activeDemoTab === "notes" && (
							<div className="font-sans space-y-2.5 text-left text-xs leading-relaxed text-foreground p-1">
								<div className="text-sm font-extrabold text-primary mb-1"># System Architecture & RFC Spec</div>
								<p className="text-muted-foreground font-semibold">Markdown documentation versioned right beside your visual diagrams in <code className="text-foreground bg-muted px-1 py-0.5 rounded text-[10px]">/docs/notes.md</code>:</p>
								<ul className="space-y-2 mt-2">
									<li className="flex items-center gap-2 font-bold"><span className="text-primary font-black">✔</span> Stored in your private or public GitHub repository</li>
									<li className="flex items-center gap-2 font-bold"><span className="text-primary font-black">✔</span> Zero proprietary database silos or locked formats</li>
									<li className="flex items-center gap-2 font-bold"><span className="text-primary font-black">✔</span> Fully readable and editable in VS Code, Obsidian, or Neovim</li>
								</ul>
							</div>
						)}

						{activeDemoTab === "git" && (
							<div className="space-y-2.5 font-mono text-[10px] text-left w-full">
								<div className="flex justify-between items-center p-2 rounded-lg bg-card border">
									<div className="flex items-center gap-2">
										<span className="w-1.5 h-1.5 rounded-full bg-primary" />
										<span className="font-bold text-foreground">feat(arch): add edge worker & queue topology</span>
									</div>
									<span className="text-muted-foreground">7f2a1b9</span>
								</div>
								<div className="flex justify-between items-center p-2 rounded-lg bg-card border opacity-85">
									<div className="flex items-center gap-2">
										<span className="w-1.5 h-1.5 rounded-full bg-primary" />
										<span className="font-bold text-foreground">docs(rfc): document failover & caching strategies</span>
									</div>
									<span className="text-muted-foreground">3c8d4e2</span>
								</div>
								<div className="flex justify-between items-center p-2 rounded-lg bg-card border opacity-70">
									<div className="flex items-center gap-2">
										<span className="w-1.5 h-1.5 rounded-full bg-primary" />
										<span className="font-bold text-foreground">chore: sync multi-file snapshot from sketchflow</span>
									</div>
									<span className="text-muted-foreground">b5e1a04</span>
								</div>
							</div>
						)}
					</div>
					<div className="mt-4 grid gap-3 sm:grid-cols-2">
						<div className="rounded-[18px] border bg-background p-4 shadow-sm hover:border-primary/45 transition-colors">
							<div className="flex items-center gap-2 text-sm font-black">
								<Zap className="size-4 text-primary" />
								0ms Local Drafts
							</div>
							<p className="mt-1.5 text-xs font-semibold text-muted-foreground leading-relaxed">
								Autosaves locally to IndexedDB with zero latency. Push atomic Git snapshots to GitHub when you are ready.
							</p>
						</div>
						<div className="rounded-[18px] border bg-background p-4 shadow-sm hover:border-primary/45 transition-colors">
							<div className="flex items-center gap-2 text-sm font-black">
								<ShieldCheck className="size-4 text-primary" />
								Zero Lock-In Guarantee
							</div>
							<p className="mt-1.5 text-xs font-semibold text-muted-foreground leading-relaxed">
								Every diagram is standard Excalidraw JSON; every note is standard Markdown. Your work stays yours forever.
							</p>
						</div>
					</div>
				</div>
			</section>

			<section id="workflow" className="border-y bg-muted/35">
				<div className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
					<div className="max-w-2xl">
						<h2 className="text-3xl font-black tracking-tight">A calmer, Git-native workflow for engineering teams.</h2>
						<p className="mt-3 text-sm font-semibold leading-6 text-muted-foreground">
							Stop losing diagrams across Slack threads and expired whiteboard subscriptions. Your codebase and your architecture evolve together.
						</p>
					</div>
					<div className="mt-8 grid gap-4 md:grid-cols-4">
						{workflow.map((step) => {
							const Icon = step.icon;
							return (
								<div key={step.title} className="rounded-[20px] border bg-card p-5 shadow-sm hover:border-primary/40 transition-colors">
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
						<h2 className="text-3xl font-black tracking-tight">Built for developers who explain complex systems.</h2>
						<p className="mt-3 text-sm font-semibold leading-6 text-muted-foreground">
							Architects, developers, technical writers, and teams get one unified workspace instead of scattered canvases, lost passwords, and abandoned tabs.
						</p>
					</div>
					<div className="grid gap-4 md:grid-cols-3">
						{personas.map((item) => {
							const Icon = item.icon;
							return (
								<div key={item.title} className="rounded-[20px] border bg-card p-5 hover:border-primary/40 transition-colors">
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
								className="inline-flex items-center gap-2 rounded-full border bg-muted px-3.5 py-2 text-xs font-bold text-muted-foreground"
							>
								<Icon className="size-4 text-primary" />
								{item.label}
							</div>
						);
					})}
				</div>
			</section>

			<section id="ownership" className="mx-auto max-w-7xl px-5 pb-16 sm:px-8">
				<div className="grid gap-4 lg:grid-cols-3">
					<div className="rounded-[24px] border bg-card p-6 lg:col-span-2">
						<div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-primary">
							<CheckCircle2 className="size-4" />
							The Anti-Lock-In Manifesto
						</div>
						<h2 className="mt-3 text-3xl font-black tracking-tight">Your drawings belong in Git, not our database.</h2>
						<p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-muted-foreground">
							Traditional visual tools trap your architectural thinking inside proprietary subscription silos. Sketchflow is built differently: our database only handles auth pointers. Your actual diagrams, documentation, metadata, and exports live safely inside your own GitHub repository.
						</p>
						<div className="mt-6 grid gap-3 md:grid-cols-3">
							{[
								{ title: "No DB Silos", desc: "Files live in your GitHub repo" },
								{ title: "Atomic Git Commits", desc: "Canvas + docs update in 1 SHA" },
								{ title: "100% Open Standards", desc: "Standard .json & .md formats" },
							].map((item) => (
								<div key={item.title} className="rounded-[16px] border bg-muted/45 px-4 py-3">
									<div className="text-sm font-black">{item.title}</div>
									<div className="text-xs font-semibold text-muted-foreground mt-0.5">{item.desc}</div>
								</div>
							))}
						</div>
					</div>
					<div className="rounded-[24px] border bg-primary p-6 text-primary-foreground flex flex-col justify-between">
						<div>
							<h2 className="text-2xl font-black">Own your project blueprints.</h2>
							<p className="mt-3 text-sm font-bold leading-6 opacity-85">
								Connect your GitHub repo in seconds. Design systems, write specs, and commit atomic snapshots with zero subscription locks.
							</p>
						</div>
						<button
							className="btn-3d btn-3d--secondary mt-6 w-full h-12 text-xs font-extrabold cursor-pointer"
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
					<div className="flex items-center gap-3">
						<span>Sketchflow · Open Source GitHub-Native Workspace</span>
						<Link
							href="https://github.com/SH20RAJ/sketch-flow"
							target="_blank"
							className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-extrabold text-amber-500 hover:bg-amber-500/20 transition-colors"
						>
							🎃 Hacktoberfest Ready
						</Link>
					</div>
					<div className="flex items-center gap-4">
						<a href={SKETCHFLOW_APP_URL} className="hover:text-foreground transition-colors">
							sketchflow.space
						</a>
						<Link href="/app" className="hover:text-foreground transition-colors">
							Open app
						</Link>
						<Link href="https://github.com/SH20RAJ/sketch-flow" target="_blank" className="hover:text-foreground transition-colors">
							GitHub
						</Link>
						<Link href="/help" className="hover:text-foreground transition-colors">
							Docs & Guides
						</Link>
					</div>
				</div>
			</footer>
		</main>
	);
}
