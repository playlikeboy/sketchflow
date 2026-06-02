"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStackApp } from "@stackframe/stack";
import {
	ArrowRight,
	BookOpen,
	Boxes,
	FileText,
	GitBranch,
	LayoutDashboard,
	Loader2,
	Moon,
	Network,
	PenTool,
	ShieldCheck,
	Sparkles,
	Sun,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { useAuthMe } from "@/lib/swr-hooks";

const pillars = [
	{
		icon: PenTool,
		title: "Sketch",
		description: "A full Excalidraw canvas with libraries, quick diagrams, and local autosave.",
	},
	{
		icon: FileText,
		title: "Document",
		description: "Project notes live beside the canvas and save back into the same repo.",
	},
	{
		icon: GitBranch,
		title: "Own",
		description: "Sketches, docs, metadata, assets, and public pages stay in your GitHub repo.",
	},
];

const useCases = [
	{ icon: Network, label: "Architecture maps" },
	{ icon: LayoutDashboard, label: "Product flows" },
	{ icon: BookOpen, label: "Teaching boards" },
	{ icon: Boxes, label: "Reusable libraries" },
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
			<header className="border-b bg-background/95">
				<div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
					<BrandMark subtitle="GitHub-native canvas" />
					<div className="flex items-center gap-2">
						<Button
							variant="ghost"
							size="icon-sm"
							onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
							aria-label="Toggle theme"
						>
							{mounted && theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
						</Button>
						<Button variant="ghost" size="sm" onClick={() => void app.redirectToSignIn()}>
							Sign in
						</Button>
						<Button size="sm" onClick={() => void app.redirectToSignUp()}>
							Get started
							<ArrowRight className="size-4" />
						</Button>
					</div>
				</div>
			</header>

			<section className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[1fr_460px] lg:items-center lg:py-24">
				<div>
					<div className="inline-flex items-center gap-2 rounded-full border bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">
						<Sparkles className="size-3.5 text-primary" />
						GitHub-native visual workspace
					</div>
					<h1 className="mt-5 max-w-3xl text-4xl font-extrabold tracking-normal text-foreground sm:text-6xl">
						Sketch, document, and publish from your own repo.
					</h1>
					<p className="mt-5 max-w-2xl text-base font-semibold leading-7 text-muted-foreground">
						Sketchflow is a focused workspace for builders who want diagrams, project docs,
						public pages, and visual memory without giving up data ownership.
					</p>
					<div className="mt-8 flex flex-wrap gap-3">
						<Button size="lg" onClick={() => void app.redirectToSignUp()}>
							Create workspace
							<ArrowRight className="size-4" />
						</Button>
						<Button variant="outline" size="lg" onClick={() => void app.redirectToSignIn()}>
							Sign in
						</Button>
					</div>
				</div>

				<div className="rounded-2xl border bg-card p-4 shadow-sm">
					<div className="rounded-xl border bg-muted p-3">
						<div className="flex items-center justify-between text-xs font-bold text-muted-foreground">
							<span>SH20RAJ/sketchflow-workspace</span>
							<span>main</span>
						</div>
					</div>
					<div className="mt-4 grid gap-3">
						{[
							"projects/day1/sketches/system-map.excalidraw.json",
							"projects/day1/docs/notes.md",
							"projects/projects-metadata.json",
						].map((item) => (
							<div key={item} className="rounded-xl border bg-background px-3 py-3 font-mono text-xs font-semibold text-muted-foreground">
								{item}
							</div>
						))}
					</div>
					<div className="mt-4 rounded-xl border bg-background p-4">
						<div className="flex items-center gap-2 text-sm font-extrabold">
							<ShieldCheck className="size-4 text-primary" />
							Your repo is the source of truth
						</div>
						<p className="mt-2 text-sm font-semibold text-muted-foreground">
							Sketchflow stores only app metadata. Your project files stay in GitHub.
						</p>
					</div>
				</div>
			</section>

			<section className="mx-auto max-w-6xl px-5 pb-16 sm:px-8">
				<div className="grid gap-4 md:grid-cols-3">
					{pillars.map((pillar) => {
						const Icon = pillar.icon;
						return (
							<div key={pillar.title} className="rounded-2xl border bg-card p-5 shadow-sm">
								<div className="grid size-10 place-items-center rounded-xl bg-muted text-primary">
									<Icon className="size-5" />
								</div>
								<h2 className="mt-4 text-lg font-extrabold">{pillar.title}</h2>
								<p className="mt-2 text-sm font-semibold leading-6 text-muted-foreground">{pillar.description}</p>
							</div>
						);
					})}
				</div>

				<div className="mt-8 flex flex-wrap gap-2">
					{useCases.map((item) => {
						const Icon = item.icon;
						return (
							<div key={item.label} className="inline-flex items-center gap-2 rounded-full border bg-muted px-3 py-2 text-sm font-bold text-muted-foreground">
								<Icon className="size-4" />
								{item.label}
							</div>
						);
					})}
				</div>
			</section>

			<footer className="border-t">
				<div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6 text-xs font-bold text-muted-foreground sm:px-8">
					<span>Sketchflow</span>
					<Link href="/app" className="hover:text-foreground">
						Open app
					</Link>
				</div>
			</footer>
		</main>
	);
}
