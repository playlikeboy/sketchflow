# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Anyone who explains an idea by drawing it and writing beside it. Confirmed audiences, with none ranked above the others:

- Developers and engineering teams mapping systems and writing specs.
- Students sketching a topic to understand it or to hand it in.
- Teachers preparing lesson boards and explanations they reuse and share.
- Open-source maintainers publishing architecture guides with their code.

They work on a laptop or desktop for long sessions, and want the drawing and its notes to still exist, unchanged and readable, years later.

## Product Purpose

Sketchflow is a visual workspace: an Excalidraw canvas beside a notes editor, per project. Saving writes both as plain files (`.excalidraw.json` and Markdown) in one Git commit to a GitHub repository the user owns. Success is a person finishing a sketch and its notes, saving, and trusting that the result lives in their own repo with full history.

## Positioning

The user's GitHub repository is the database. Sketchflow stores no sketch content of its own, so a workspace keeps working in Excalidraw, any text editor and Git even if Sketchflow goes away.

## Operating Context

- Sign in, connect GitHub, create or connect a workspace repository, create projects, draw and write, save snapshots.
- Edits are written to the browser's IndexedDB first; the editor never waits on the network. An offline mode pauses sync.
- A save is one multi-file Git commit. If the branch moved since the draft was based on it, the commit is rejected instead of overwriting.
- History lists the commits that touched a project, previews an old version, and restores it as a new commit.
- Projects in public repositories have read-only share and embed pages, and can be forked into another workspace.
- Community Excalidraw shape libraries can be browsed and installed.

## Capabilities and Constraints

- Stack: Next.js App Router, React, Tailwind CSS, lucide-react icons, shadcn-style primitives in `src/components/ui`. No other component framework without an explicit decision.
- Excalidraw and BlockNote are embedded third-party editors with their own UI; they render client-side only.
- Light and dark themes both ship.
- The app is app-first: the landing page exists, but the product is the workspace.
- Terminology: workspace (one repo), project (a folder under `projects/`), sketch, notes, snapshot (a commit), share page, embed.
- Undecided: pricing, team features, multi-sketch projects in the UI.

## Brand Commitments

- The name is Sketchflow. Nothing else of the earlier identity is binding: the mark, colour and type may all change.
- Voice: plain and specific. Say what happens to the user's files; no hype.
- The repository is open source under MIT.

## Evidence on Hand

- A working app and its real file formats and repository layout (see `README.md`, `docs/ARCHITECTURE.md`).
- No customers, testimonials, usage numbers, benchmarks or pricing exist. Do not invent any, and do not claim latency figures.
- The owner also presents this project as portfolio work, so the craft of the interface is itself on show.

## Product Principles

1. The user's files are the product. Always show where work lives and what a save will write.
2. Never lose work: local first, explicit snapshots, conflicts reported rather than overwritten.
3. The canvas and the notes are the work; everything else stays out of the way.
4. Legible to a first-time student and efficient for a daily developer on the same screen.

## Accessibility & Inclusion

WCAG 2.2 AA: full keyboard access, visible focus, sufficient contrast in both themes, and reduced-motion support.
