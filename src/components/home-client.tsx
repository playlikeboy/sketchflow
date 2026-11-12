"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Pencil, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";

import { BrandMark } from "@/components/brand-mark";
import { StateGlyph, StateMark } from "@/components/state-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { TitleBlock, TitleBlockRow } from "@/components/title-block";
import { Button } from "@/components/ui/button";
import { SIGN_IN_PATH } from "@/lib/return-path";
import { useAuthMe } from "@/lib/swr-hooks";
import { cn } from "@/lib/utils";

const REPO_URL = "https://github.com/playlikeboy/sketchflow";
const APP_PATH = "/app";

const steps = [
	{
		title: "Draw and write side by side",
		body: "Open Sketchflow and start, no account needed. Each project is an Excalidraw canvas next to a notes editor, saved in your browser as you work, so nothing waits on the network.",
	},
	{
		title: "Connect a repository",
		body: "When you want a backup, sign in with GitHub and name a repository. Sketchflow creates it, or connects one you already own without touching the files in it, and copies your projects in.",
	},
	{
		title: "Save a snapshot",
		body: "Saving writes the sketch, the notes and the project record in a single Git commit. If someone else changed the branch first, you are told instead of overwritten.",
	},
	{
		title: "Go back, or share",
		body: "List the commits that touched a project, preview an old version, and restore it as a new commit. Projects in public repositories get a read-only share page and an embed view.",
	},
];

const repoTree = [
	{ depth: 0, name: ".sketchflow/", note: "Workspace settings" },
	{ depth: 0, name: "projects/", note: "One folder per project" },
	{ depth: 1, name: "projects-metadata.json", note: "The project index" },
	{ depth: 1, name: "payments-architecture/", note: "" },
	{ depth: 2, name: "project.json", note: "Title, visibility, sharing" },
	{ depth: 2, name: "sketches/system-map.excalidraw.json", note: "Opens in Excalidraw" },
	{ depth: 2, name: "docs/notes.md", note: "Opens in any editor" },
];

const audiences = [
	{
		who: "Developers",
		what: "Map a system and write the spec beside it. The diagram is reviewed, versioned and blamed like the code it describes.",
	},
	{
		who: "Students",
		what: "Sketch a topic to understand it, keep the notes with the drawing, and hand in a link or the files themselves.",
	},
	{
		who: "Teachers",
		what: "Build a lesson board once, reuse it every term, and publish it as a page students can pan and zoom but not change.",
	},
	{
		who: "Maintainers",
		what: "Keep architecture guides in the repository they explain, and embed the live diagram in the documentation.",
	},
];

type DemoRevision = { sha: string; message: string };

const demoFiles = [
	"sketches/system-map.excalidraw.json",
	"docs/notes.md",
	"project.json",
];

const initialRevisions: DemoRevision[] = [
	{ sha: "3c8d4e2", message: "Add queue between API and worker" },
	{ sha: "b5e1a04", message: "First system map" },
];

const demoEdits: DemoRevision[] = [
	{ sha: "7f2a1b9", message: "Add cache in front of the database" },
	{ sha: "e41c7d0", message: "Mark the worker as retry-safe" },
];

/** A working miniature of the product: edit, see the draft state, save, see the commit land. */
function SheetDemo() {
	const [revisions, setRevisions] = useState(initialRevisions);
	const [dirty, setDirty] = useState(false);
	const editCount = revisions.length - initialRevisions.length;
	const nextEdit = demoEdits[editCount];
	const showCache = editCount > 0 || dirty;

	return (
		<div className="rounded-lg border border-rule bg-card shadow-(--float-shadow)">
			<div className="flex items-center justify-between gap-3 border-b border-rule px-3 py-2">
				<span className="datum truncate text-muted-foreground">projects/payments-architecture</span>
				<span className="legend-label shrink-0">Example</span>
			</div>

			<div className="grid grid-cols-[minmax(0,1fr)] sm:grid-cols-[minmax(0,1fr)_15rem]">
				<div className="border-b border-rule p-3 sm:border-r sm:border-b-0">
					<svg viewBox="0 0 320 190" role="img" aria-label="A small system diagram: a client calls an API, which uses a database and a worker" className="h-auto w-full">
						<g className="fill-none stroke-foreground" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
							<rect x="12" y="74" width="72" height="42" rx="4" />
							<rect x="124" y="74" width="72" height="42" rx="4" />
							<rect x="236" y="22" width="72" height="42" rx="4" />
							<rect x="236" y="126" width="72" height="42" rx="4" />
							<path d="M84 95h36m-7-5 7 5-7 5" />
							<path d="M196 86c14-6 22-22 36-34m-9-1 9 1-2 9" />
							<path d="M196 104c14 6 22 22 36 34m-2-9 2 9-9 1" />
						</g>
						<g className="fill-foreground text-[11px] font-semibold" textAnchor="middle">
							<text x="48" y="99">Client</text>
							<text x="160" y="99">API</text>
							<text x="272" y="47">Database</text>
							<text x="272" y="151">Worker</text>
						</g>
						<g className={cn("transition-opacity duration-300", showCache ? "opacity-100" : "opacity-0")}>
							<rect
								x="204"
								y="2"
								width="52"
								height="24"
								rx="4"
								className={cn("fill-card", dirty ? "stroke-contour" : "stroke-foreground")}
								strokeWidth="1.5"
								strokeDasharray={dirty ? "4 3" : undefined}
							/>
							<text x="230" y="18" textAnchor="middle" className={cn("text-[0.6875rem] font-semibold", dirty ? "fill-contour" : "fill-foreground")}>
								Cache
							</text>
						</g>
					</svg>
				</div>

				<div className="flex flex-col gap-3 p-3">
					<TitleBlock>
						<TitleBlockRow label="Branch" mono>main</TitleBlockRow>
						<TitleBlockRow label="Commit" mono>{revisions[0].sha}</TitleBlockRow>
						<TitleBlockRow label="State">
							<StateMark state={dirty ? "draft" : "synced"} />
						</TitleBlockRow>
					</TitleBlock>

					<div className="flex gap-2">
						<Button
							variant="outline"
							size="sm"
							className="flex-1"
							disabled={dirty || !nextEdit}
							onClick={() => setDirty(true)}
						>
							<Pencil />
							Edit
						</Button>
						<Button
							size="sm"
							className="flex-1"
							disabled={!dirty || !nextEdit}
							onClick={() => {
								if (!nextEdit) return;
								setRevisions((current) => [nextEdit, ...current]);
								setDirty(false);
							}}
						>
							Save
						</Button>
					</div>
				</div>
			</div>

			<div className="border-t border-rule px-3 py-2.5">
				<div className="flex items-center justify-between gap-3">
					<span className="legend-label">Files in the repository</span>
					{editCount > 0 || dirty ? (
						<button
							type="button"
							className="inline-flex cursor-pointer items-center gap-1 rounded-sm text-xs text-muted-foreground underline hover:text-foreground"
							onClick={() => {
								setRevisions(initialRevisions);
								setDirty(false);
							}}
						>
							<RotateCcw className="size-3" />
							Reset example
						</button>
					) : null}
				</div>
				<ul className="mt-1.5" aria-live="polite">
					{demoFiles.map((file, index) => {
						const changed = dirty && index === 0;
						return (
							<li key={file} className="flex items-center gap-2.5 py-1">
								<StateGlyph state={changed ? "draft" : "synced"} />
								<span className="datum min-w-0 flex-1 truncate">{file}</span>
								<span className={cn("shrink-0 text-xs", changed ? "font-medium text-contour" : "text-muted-foreground")}>
									{changed ? "Unsaved" : "Synced"}
								</span>
							</li>
						);
					})}
				</ul>
				<p className="mt-1.5 border-t border-rule pt-2 text-[0.8125rem] text-muted-foreground">
					Last commit <span className="datum text-foreground">{revisions[0].sha}</span> {revisions[0].message}
				</p>
			</div>
		</div>
	);
}

function ContourField() {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 1200 600"
			preserveAspectRatio="xMidYMid slice"
			className="pointer-events-none absolute inset-0 h-full w-full fill-none stroke-rule"
			strokeWidth="1"
		>
			<path d="M-40 420c160-90 300-20 430-110s210-190 390-170 260 130 470 60" />
			<path d="M-40 470c170-80 310-10 440-100s220-180 390-160 250 120 460 70" />
			<path d="M-40 525c180-70 320 0 450-90s230-170 390-150 240 110 450 80" />
			<path d="M-40 365c150-100 290-30 420-120s200-200 390-180 270 140 480 50" />
			<path d="M620 120c60-50 170-60 230-10s40 130-40 160-190 10-220-50 -10-70 30-100z" />
			<path d="M670 140c40-34 110-40 150-8s28 86-26 106-126 6-146-34-6-44 22-64z" />
			<path d="M716 160c22-18 58-20 80-4s14 46-14 56-66 4-78-18-4-24 12-34z" />
		</svg>
	);
}

export function HomeClient() {
	const router = useRouter();
	const { data: auth, isLoading } = useAuthMe();

	useEffect(() => {
		if (auth?.authenticated) {
			router.replace("/app");
		}
	}, [auth, router]);

	if (isLoading || auth?.authenticated) {
		return (
			<main className="grid min-h-screen place-items-center bg-background">
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<Loader2 className="size-4 animate-spin" />
					Opening Sketchflow
				</div>
			</main>
		);
	}

	return (
		<div className="min-h-screen bg-background text-foreground">
			<header className="sticky top-0 z-30 border-b border-border bg-background">
				<div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
					<BrandMark />
					<nav aria-label="Page sections" className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
						<a href="#how" className="rounded-sm hover:text-foreground">How it works</a>
						<a href="#files" className="rounded-sm hover:text-foreground">Your files</a>
						<a href="#who" className="rounded-sm hover:text-foreground">Who it&apos;s for</a>
						<Link href="/help" className="rounded-sm hover:text-foreground">Help</Link>
					</nav>
					<div className="flex items-center gap-1.5">
						<ThemeToggle />
						<Button variant="ghost" size="sm" asChild>
							<Link href={SIGN_IN_PATH}>Sign in</Link>
						</Button>
						<Button size="sm" asChild>
							<Link href={APP_PATH}>Open Sketchflow</Link>
						</Button>
					</div>
				</div>
			</header>

			<main>
				<section className="relative overflow-hidden border-b border-border bg-lowland">
					<ContourField />
					<div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:py-20">
						<div className="min-w-0">
							<h1 className="text-5xl leading-[1.05] font-extrabold tracking-[-0.03em] sm:text-6xl">
								Sketch it. Write it down. Keep the files.
							</h1>
							<p className="mt-5 max-w-[34rem] text-lg text-muted-foreground">
								Sketchflow is a canvas with a notes editor beside it. Start drawing straight away, no account
								needed. Connect GitHub when you want every save to be a Git commit to a repository you own, in
								file formats that open without us.
							</p>
							<div className="mt-7 flex flex-wrap items-center gap-3">
								<Button size="lg" asChild>
									<Link href={APP_PATH}>
										<Pencil />
										Open Sketchflow
									</Link>
								</Button>
								<Button variant="outline" size="lg" asChild>
									<Link href={SIGN_IN_PATH}>
										Sign in with GitHub
										<ArrowRight />
									</Link>
								</Button>
							</div>
							<p className="mt-4 text-sm text-muted-foreground">
								Open source under the MIT licence.{" "}
								<Link href={REPO_URL} target="_blank" rel="noopener noreferrer" className="text-primary underline">
									Read the source
								</Link>
							</p>
						</div>

						<div className="min-w-0">
							<SheetDemo />
							<p className="mt-2.5 text-xs text-muted-foreground">
								Try it: press Edit, then Save. The commit IDs here are made up for the example.
							</p>
						</div>
					</div>
				</section>

				<section id="how" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
					<h2 className="max-w-[24ch] text-3xl font-bold tracking-tight">From a blank canvas to a commit in four steps</h2>
					<ol className="mt-8 border-t border-rule">
						{steps.map((step, index) => (
							<li key={step.title} className="grid gap-x-6 gap-y-1 border-b border-rule py-5 md:grid-cols-[3rem_minmax(0,18rem)_minmax(0,1fr)]">
								<span className="datum text-muted-foreground" aria-hidden="true">{index + 1}</span>
								<h3 className="text-lg font-bold">{step.title}</h3>
								<p className="max-w-[60ch] text-muted-foreground">{step.body}</p>
							</li>
						))}
					</ol>
				</section>

				<section id="files" className="border-y border-border bg-lowland">
					<div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
						<div>
							<h2 className="text-3xl font-bold tracking-tight">This is everything Sketchflow writes</h2>
							<p className="mt-4 max-w-[52ch] text-muted-foreground">
								Your repository is the database. Sketchflow&apos;s own database holds your account, your GitHub
								login, a pointer to each workspace repository, and a log of sync events. It holds no sketches and no notes.
							</p>
							<p className="mt-3 max-w-[52ch] text-muted-foreground">
								If Sketchflow went away tomorrow, the sketch would still open in Excalidraw, the notes in any text
								editor, and the history in Git.
							</p>
						</div>
						<div className="overflow-hidden rounded-lg border border-rule bg-card">
							<div className="border-b border-rule bg-muted px-3 py-2">
								<span className="datum text-muted-foreground">your-name/sketchflow-workspace</span>
							</div>
							<ul>
								{repoTree.map((entry) => (
									<li
										key={entry.name}
										className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-rule py-2 pr-3 last:border-b-0"
										style={{ paddingLeft: `${0.75 + entry.depth * 1.25}rem` }}
									>
										<span className="datum min-w-0 break-all">{entry.name}</span>
										{entry.note ? <span className="text-[0.8125rem] text-muted-foreground">{entry.note}</span> : null}
									</li>
								))}
							</ul>
						</div>
					</div>
				</section>

				<section id="who" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
					<h2 className="max-w-[26ch] text-3xl font-bold tracking-tight">For anyone who explains things by drawing them</h2>
					<dl className="mt-8 grid gap-x-10 border-t border-rule sm:grid-cols-2">
						{audiences.map((audience) => (
							<div key={audience.who} className="border-b border-rule py-5">
								<dt className="text-lg font-bold">{audience.who}</dt>
								<dd className="mt-1 max-w-[52ch] text-muted-foreground">{audience.what}</dd>
							</div>
						))}
					</dl>
				</section>

				<section className="border-t border-border bg-primary text-primary-foreground">
					<div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-4 py-12 sm:px-6">
						<div>
							<h2 className="text-3xl font-bold tracking-tight">Put your next diagram where your work already lives</h2>
							<p className="mt-2 max-w-[56ch] opacity-90">
								Start without an account. Add GitHub when you want your files in a repository.
							</p>
						</div>
						<Button
							size="lg"
							variant="outline"
							className="border-transparent bg-card text-foreground hover:bg-card/90"
							asChild
						>
							<Link href={APP_PATH}>
								Open Sketchflow
								<ArrowRight />
							</Link>
						</Button>
					</div>
				</section>
			</main>

			<footer className="border-t border-border">
				<div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:px-6">
					<span>Sketchflow · MIT licence</span>
					<nav aria-label="Footer" className="flex items-center gap-5">
						<Link href="/help" className="rounded-sm hover:text-foreground">Help</Link>
						<Link href={APP_PATH} className="rounded-sm hover:text-foreground">Open the app</Link>
						<Link href={SIGN_IN_PATH} className="rounded-sm hover:text-foreground">Sign in</Link>
						<Link href={REPO_URL} target="_blank" rel="noopener noreferrer" className="rounded-sm hover:text-foreground">
							GitHub
						</Link>
					</nav>
				</div>
			</footer>
		</div>
	);
}
