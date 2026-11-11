---
version: 1
slug: "src-app"
primary_target: "src/app"
related_targets: []
---

# Surface brief: Sketchflow app and site

Scope: the whole product surface (app shell, projects, workspace, editor chrome, history, share and embed pages, help, landing). Visitor mode: Operate for the app, Read for help, Persuade for the landing page.

Audience and job: developers, students, teachers and maintainers who draw an idea, write beside it, and save both to their own GitHub repository. Constraints: every flow keeps working; Excalidraw and BlockNote keep their own UI; no invented claims.

Unresolved: pricing, team features, multi-sketch projects.

## Direction contract

THESIS: A workspace is a surveyed sheet: every project carries a title block that says where its files live, when it was last revised, and what state it is in. Refuses the grey-app-with-one-accent default and the earlier Duolingo costume.

OWN-WORLD: Printed survey map. Cool near-white sheet with white cards, green-black ink, hairline rules, 3-8px corners. Four map inks with fixed jobs: water blue acts, contour orange marks unsaved drafts, woodland green marks synced, grid magenta marks selection and focus. One humanist sans built for legibility, with its mono for paths and SHAs. Dark theme is the same sheet at night.

STORY: The visitor sees their work as files they own, always knows whether a change is local or committed, and saves with confidence.

FIRST VIEWPORT: App: a tinted side rail with workspace switcher and navigation, a work area listing projects as ruled rows that carry the title block as columns (path, revised date, state mark), and one blue primary action. Landing: the product name and one sentence on the left, a working sheet on the right showing a small diagram, a title block, and the files a save writes, each with its state mark.

FORM: Survey map sheet, position 7 of 7 on the grounded list. seed:d7cccd6d9ae78588. Signature move: the title block and legend state marks on every project, and the same title block behind the project name in the editor, and history drawn as a scale bar with one segment and tick per commit.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
