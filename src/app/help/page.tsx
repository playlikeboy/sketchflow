import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { StateMark, type WorkState } from "@/components/state-mark";
import { Button } from "@/components/ui/button";
import { GITHUB_TOKEN_SETUP_URL } from "@/lib/github-token";

export const metadata: Metadata = {
	title: "Help",
	description: "How Sketchflow saves your sketches and notes to your own GitHub repository.",
};

const topics = [
	{ id: "basics", title: "The basics" },
	{ id: "try", title: "Using it without an account" },
	{ id: "insert", title: "Adding things to the canvas" },
	{ id: "saving", title: "Saving your work" },
	{ id: "states", title: "What the state marks mean" },
	{ id: "history", title: "History and restore" },
	{ id: "sharing", title: "Sharing and embedding" },
	{ id: "offline", title: "Working offline" },
	{ id: "github", title: "If GitHub access stops working" },
	{ id: "privacy", title: "What Sketchflow stores" },
];

const states: { state: WorkState; meaning: string }[] = [
	{ state: "synced", meaning: "Committed to your repository. What you see is what GitHub has." },
	{ state: "draft", meaning: "You have changes that are kept in this browser but not yet committed." },
	{ state: "local", meaning: "The project exists only in this browser. It has not reached GitHub yet." },
	{ state: "offline", meaning: "You paused sync. Nothing is sent to GitHub until you turn it back on." },
	{ state: "error", meaning: "The last save did not reach GitHub. Your work is still in this browser; retry from the top bar." },
];

function Topic({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
	return (
		<section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-20 border-t border-rule pt-8 pb-10">
			<h2 id={`${id}-heading`} className="text-xl font-bold">{title}</h2>
			<div className="mt-3 max-w-[68ch] space-y-3 text-base leading-7 text-foreground/90">{children}</div>
		</section>
	);
}

export default function HelpPage() {
	return (
		<div className="min-h-screen bg-background text-foreground">
			<header className="sticky top-0 z-20 border-b border-border bg-background">
				<div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
					<BrandMark href="/" subtitle="Help" />
					<Button size="sm" asChild>
						<Link href="/app">
							Open the app
							<ArrowRight />
						</Link>
					</Button>
				</div>
			</header>

			<div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
				<nav aria-label="Help topics" className="lg:sticky lg:top-24 lg:self-start">
					<p className="legend-label">On this page</p>
					<ul className="mt-2 space-y-0.5 text-sm">
						{topics.map((topic) => (
							<li key={topic.id}>
								<a href={`#${topic.id}`} className="block rounded-sm py-1 text-muted-foreground hover:text-foreground">
									{topic.title}
								</a>
							</li>
						))}
					</ul>
				</nav>

				<main>
					<h1 className="text-4xl font-extrabold tracking-tight">How Sketchflow works</h1>
					<p className="mt-3 mb-8 max-w-[60ch] text-lg text-muted-foreground">
						Sketchflow is a canvas with a notes editor beside it. It saves both as files in a GitHub repository that
						belongs to you.
					</p>

					<Topic id="basics" title="The basics">
						<p>
							A <strong>workspace</strong> is one GitHub repository. A <strong>project</strong> is a folder inside
							it, under <code className="datum">projects/</code>, holding a sketch and its notes.
						</p>
						<p>
							The sketch is saved as an <code className="datum">.excalidraw.json</code> file, which opens in
							Excalidraw. The notes are saved as <code className="datum">docs/notes.md</code>, plain Markdown that
							opens in any editor.
						</p>
					</Topic>

					<Topic id="try" title="Using it without an account">
						<p>
							You do not need to sign in. <Link href="/app" className="text-primary underline">Open the app</Link>{" "}
							and everything works: projects, the canvas and notes are saved in this browser under a workspace
							called <strong>This device</strong>.
						</p>
						<p>
							Work that lives only on this device is not backed up. Clearing the browser&apos;s site data removes
							it, and it does not appear on your other devices.
						</p>
						<p>
							When you want a backup, sign in with GitHub and choose a repository. Sketchflow then offers to copy
							the projects from this device into it. You choose which ones; nothing is uploaded on its own.
							Sharing a project needs a repository, so it needs sign-in too.
						</p>
					</Topic>

					<Topic id="insert" title="Adding things to the canvas">
						<p>
							<strong>Insert</strong> in the editor&apos;s top bar opens one panel for everything you can add:
							shape libraries, starter diagrams, company logos, photos, stickers and your own images. Whatever you
							pick lands in the middle of the view at a sensible size, ready to move.
						</p>
						<p>
							<strong>Diagrams</strong> has starters such as a flowchart, a sequence diagram and a mind map, and
							turns pasted Mermaid text into shapes you can edit. <strong>Photos</strong> come from Unsplash and
							are credited to their photographers. Images you upload stay in your browser and are stored inside
							the sketch.
						</p>
						<p>
							To grow a diagram quickly, select a rectangle, diamond or ellipse and click one of the
							<strong> +</strong> handles on its sides. That adds a matching shape joined by an arrow that follows
							when either shape moves. Holding <span className="datum">Ctrl</span> (or{" "}
							<span className="datum">Cmd</span>) and pressing an arrow key does the same from the keyboard.
						</p>
						<p>
							<strong>Present</strong> shows each frame as a slide. Draw frames with the frame tool (
							<span className="datum">F</span>), then use the arrow keys to move between them and{" "}
							<span className="datum">Esc</span> to finish.
						</p>
					</Topic>

					<Topic id="saving" title="Saving your work">
						<p>
							As you draw and type, every change is kept in your browser straight away. You do not need to save to
							avoid losing work if you close the tab.
						</p>
						<p>
							Pressing <strong>Save</strong> in the editor writes the sketch, the notes and the project record to
							your repository as a single Git commit.
						</p>
						<p>
							If the project changed on GitHub since you opened it, for example because you saved from another
							device, nothing is overwritten. You are asked which version to keep: yours, saved on top with the
							other one still in History, or the one on GitHub. You can download yours first either way.
						</p>
					</Topic>

					<Topic id="states" title="What the state marks mean">
						<p>The same five marks are used everywhere to say where a piece of work lives.</p>
						<dl className="overflow-hidden rounded-lg border border-rule bg-card text-[0.9375rem] leading-6">
							{states.map((entry) => (
								<div key={entry.state} className="grid gap-x-4 gap-y-0.5 border-b border-rule px-3 py-2.5 last:border-b-0 sm:grid-cols-[9.5rem_minmax(0,1fr)]">
									<dt><StateMark state={entry.state} className="text-sm" /></dt>
									<dd className="text-muted-foreground">{entry.meaning}</dd>
								</div>
							))}
						</dl>
					</Topic>

					<Topic id="history" title="History and restore">
						<p>
							Open <strong>History</strong> in the editor to see the commits that touched the project. You can
							preview any of them without changing anything.
						</p>
						<p>
							<strong>Restore</strong> copies that version of the project into a new commit. Nothing is deleted:
							the versions in between stay in the history, and other projects in the workspace are not affected.
						</p>
					</Topic>

					<Topic id="sharing" title="Sharing and embedding">
						<p>
							A project in a <strong>public</strong> repository has a read-only share page and an embed view that
							you can put in an iframe. Visitors can pan and zoom but cannot change the sketch.
						</p>
						<p>
							Projects in private repositories are never shared. To stop sharing one project in a public
							repository, set <code className="datum">sharing.enabled</code> to{" "}
							<code className="datum">false</code> in its <code className="datum">project.json</code>. Bear in mind
							that the files themselves are still public on GitHub.
						</p>
					</Topic>

					<Topic id="offline" title="Working offline">
						<p>
							The editor keeps working without a connection. Changes stay in your browser and are committed when
							you save once you are back online.
						</p>
						<p>
							You can also pause sync on purpose with the <strong>Sync on</strong> button in the top bar. While it
							is paused, nothing is sent to GitHub.
						</p>
						<p>
							Work that has not been committed lives only in the browser you made it in. Clearing that
							browser&apos;s site data removes it.
						</p>
					</Topic>

					<Topic id="github" title="If GitHub access stops working">
						<p>
							Sketchflow reaches GitHub through the connection you approved when you signed in. If that expires,
							you will see a notice with a <strong>Reconnect GitHub</strong> button. Use that first.
						</p>
						<p>
							If reconnecting does not work, you can paste a personal access token with repository access. It is
							kept in the current browser tab&apos;s session and is not stored by Sketchflow.
						</p>
						<p className="flex flex-wrap gap-2 pt-1">
							<Button variant="outline" size="sm" asChild>
								<Link href="/app/workspace">Go to workspaces</Link>
							</Button>
							<Button variant="outline" size="sm" asChild>
								<Link href={GITHUB_TOKEN_SETUP_URL} target="_blank" rel="noopener noreferrer">
									Create a token on GitHub
								</Link>
							</Button>
						</p>
					</Topic>

					<Topic id="privacy" title="What Sketchflow stores">
						<p>
							Your sketches, notes and project files are stored in your repository and nowhere else on our side.
						</p>
						<p>
							Sketchflow&apos;s own database holds your account details, your GitHub login, which repositories you
							connected, and a log of sync events such as the ID of each commit it made. It does not hold GitHub
							tokens or the contents of your work.
						</p>
						<p>
							The source code is public, so you can check this for yourself.{" "}
							<Link
								href="https://github.com/playlikeboy/sketchflow"
								target="_blank"
								rel="noopener noreferrer"
								className="text-primary underline"
							>
								Read it on GitHub
							</Link>
							.
						</p>
					</Topic>
				</main>
			</div>
		</div>
	);
}
