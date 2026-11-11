---
name: Sketchflow
description: A workspace drawn as a surveyed map sheet, where every project says where its files live and what state they are in.
colors:
  # Day sheet (:root)
  water: "#1558a8"
  water-tint: "#dfecfa"
  contour: "#9c4306"
  contour-tint: "#fbe9da"
  wood: "#256c31"
  wood-tint: "#e0f0df"
  grid: "#b3136f"
  grid-tint: "#fae2ee"
  destructive: "#a8261b"
  background: "#f9fbfa"
  card: "#ffffff"
  lowland: "#e9f1ee"
  muted: "#eef3f1"
  accent: "#e2ebe7"
  sidebar-accent: "#dae6e1"
  rule: "#cbd7d2"
  input: "#7f8f89"
  foreground: "#18211d"
  muted-foreground: "#505d55"
  primary-foreground: "#ffffff"
  # Night sheet (.dark)
  night-water: "#7fb4f5"
  night-water-tint: "#16304d"
  night-contour: "#f0a05a"
  night-contour-tint: "#3a2512"
  night-wood: "#7fcb8a"
  night-wood-tint: "#17321d"
  night-grid: "#f083c0"
  night-grid-tint: "#3d1730"
  night-destructive: "#f2877b"
  night-destructive-foreground: "#1f0906"
  night-background: "#0f1513"
  night-card: "#141c19"
  night-popover: "#18211e"
  night-lowland: "#121917"
  night-sidebar: "#0a100e"
  night-muted: "#171f1c"
  night-secondary: "#1a2420"
  night-accent: "#1f2a26"
  night-rule: "#28352f"
  night-input: "#63766e"
  night-foreground: "#e6ede8"
  night-muted-foreground: "#a3b3ab"
  night-primary-foreground: "#0a1622"
typography:
  display:
    fontFamily: "Atkinson Hyperlegible Next Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "3.75rem"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Atkinson Hyperlegible Next Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Atkinson Hyperlegible Next Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.55
    letterSpacing: "-0.015em"
  title-sm:
    fontFamily: "Atkinson Hyperlegible Next Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Atkinson Hyperlegible Next Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum"
  body-sm:
    fontFamily: "Atkinson Hyperlegible Next Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  caption:
    fontFamily: "Atkinson Hyperlegible Next Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.33
  label:
    fontFamily: "Atkinson Hyperlegible Next Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    letterSpacing: "0.06em"
  datum:
    fontFamily: "Atkinson Hyperlegible Mono Variable, ui-monospace, SFMono-Regular, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    letterSpacing: "-0.01em"
rounded:
  sm: "3px"
  md: "4px"
  lg: "6px"
  xl: "8px"
spacing:
  "1.5": "6px"
  "2": "8px"
  "2.5": "10px"
  "3": "12px"
  "5": "20px"
  "10": "40px"
  "16": "64px"
components:
  button-primary:
    backgroundColor: "{colors.water}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "0 14px"
  button-outline:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "0 14px"
  button-outline-hover:
    backgroundColor: "{colors.accent}"
  button-secondary:
    backgroundColor: "{colors.lowland}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "0 14px"
  button-secondary-hover:
    backgroundColor: "{colors.accent}"
  button-ghost:
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "0 14px"
  button-ghost-hover:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.foreground}"
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "0 14px"
  input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "4px 12px"
  badge-default:
    backgroundColor: "{colors.water-tint}"
    textColor: "{colors.water}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    height: "20px"
    padding: "0 6px"
  badge-draft:
    backgroundColor: "{colors.contour-tint}"
    textColor: "{colors.contour}"
    rounded: "{rounded.sm}"
    height: "20px"
    padding: "0 6px"
  badge-synced:
    backgroundColor: "{colors.wood-tint}"
    textColor: "{colors.wood}"
    rounded: "{rounded.sm}"
    height: "20px"
    padding: "0 6px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.lg}"
    padding: "16px"
  title-block-label:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.muted-foreground}"
    typography: "{typography.label}"
    padding: "6px 10px"
  title-block-value:
    textColor: "{colors.foreground}"
    typography: "{typography.body-sm}"
    padding: "6px 10px"
  table-head:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.muted-foreground}"
    typography: "{typography.label}"
    padding: "8px 12px"
  table-row:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    typography: "{typography.body-sm}"
    padding: "10px 12px"
  nav-item:
    textColor: "{colors.foreground}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    height: "32px"
    padding: "0 8px"
  nav-item-hover:
    backgroundColor: "{colors.sidebar-accent}"
  nav-item-current:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
  revision-selected:
    backgroundColor: "{colors.grid-tint}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "8px 10px"
---

# Design System: Sketchflow

## Overview

**Creative North Star: "The Survey Sheet"**

A Sketchflow workspace is a surveyed map sheet. The page is cool white paper, the text is green-black ink, structure is drawn with hairline rules, and four map inks each do exactly one job. Every project carries the equivalent of a sheet's title block: where its files live, when it was last revised, and what state it is in. The system exists so a person always knows whether a change is only in this browser or committed to their GitHub repository.

The interface is dense, calm and flat. Surfaces are told apart by tint and by ruled lines, not by shadow. Corners are tight (3 to 8px). One humanist sans built for legibility carries all UI and headings; its mono companion carries paths, branch names and SHAs, so machine values always look like machine values. The dark theme is the same sheet at night: the same roles, the same inks lightened for a dark ground, nothing re-assigned.

State is never carried by colour alone. Each sync state has its own legend shape (filled disc, half disc, ring, barred ring, filled square) and a plain-language label, so the sheet reads in greyscale and for colour-blind users.

**Key Characteristics:**
- Cool white paper, green-black ink, hairline rules; flat, with tint and rule doing the work of depth.
- Four map inks with fixed jobs: water blue acts, contour orange marks unsaved drafts, woodland green marks synced, grid magenta marks selection, current location and keyboard focus.
- State is a shape plus a label plus an ink, never an ink alone.
- Paths, branches and SHAs are always set in the mono face.
- Tight radii (3, 4, 6, 8px) and compact controls (28, 32, 36, 44px high).
- Day sheet and night sheet share every role; only values change.

## Colors

A cool, slightly green-tinted neutral sheet with four saturated map inks. All values live in `src/app/globals.css` as CSS custom properties (`--water`, `--rule`, and so on) and are exposed to Tailwind as `bg-water`, `text-contour`, `border-rule`. The frontmatter lists day values under the token name and night values under `night-*`.

### Primary
- **Water Blue** (`water`, tint `water-tint`): the action ink. Primary buttons, text links, the link hover on a project name, the default badge. `--primary` and `--sidebar-primary` alias it. Text on water is `primary-foreground` (white by day, near-black blue at night because night water is light).

### Secondary
- **Contour Orange** (`contour`, tint `contour-tint`): unsaved drafts. The half-disc draft mark, the `draft` badge, the dashed outline of an unsaved shape, the "Unsaved" label beside a changed file.
- **Woodland Green** (`wood`, tint `wood-tint`): synced with GitHub. The filled-disc synced mark, the `synced` badge, the newest tick and "Latest" tag on the revision ladder.

### Tertiary
- **Grid Magenta** (`grid`, tint `grid-tint`): selection, current location and keyboard focus. The 2px focus outline, the text caret, text selection background (the tint), the icon of the current navigation item, the selected revision (dot, border and tinted row), and the focused input border. `--ring` aliases it.
- **Fault Red** (`destructive`): failures and destructive actions only. The filled-square error mark, error notices (10% fill, 40% border), the destructive button, invalid field borders.

### Neutral
- **Sheet** (`background`): the page.
- **Paper** (`card`): work surfaces laid on the sheet: tables, panels, inputs, the current navigation item. Popovers use the same white by day and a slightly lighter `night-popover` at night.
- **Lowland** (`lowland`): the tinted side rail and tinted landing bands. `--secondary` and `--sidebar` alias it by day; at night the rail drops to `night-sidebar`, darker than the sheet.
- **Margin** (`muted`): table heads, title-block label cells, card footers, info notices, disabled inputs, row hover at 60%.
- **Hover Wash** (`accent`, `sidebar-accent` in the rail): hover and expanded fill for outline, secondary and ghost controls; skeleton bars.
- **Hairline** (`rule`): every structural line: table rules, panel borders, title-block cells. `--border` aliases it. Decorative only (about 1.5:1 on paper).
- **Control Edge** (`input`): the border of anything you can type in or click that needs a boundary: inputs, outline buttons, select triggers, dashed empty states, the scrollbar thumb. Just over 3:1 on paper in both themes.
- **Ink** (`foreground`): body text and headings (about 15:1 on the sheet in both themes).
- **Faded Ink** (`muted-foreground`): secondary text, labels, placeholder, resting ghost buttons and icons (at least 6:1 on sheet, paper and margin in both themes).

### Named Rules
**The One Job Rule.** Each map ink has one meaning. Water acts, contour is unsaved, wood is synced, grid is where you are. Never borrow an ink for decoration, and never use two inks for the same meaning.

**The Shape And Ink Rule.** State is always carried by shape as well as colour. Use `StateMark` or `StateGlyph` (synced filled disc, draft half disc, local ring, offline barred ring, error filled square) with its text label; a coloured dot or coloured text on its own is not a state indicator.

**The Tint Pair Rule.** An ink on a fill sits on its own tint (`water` on `water-tint`, `contour` on `contour-tint`, `wood` on `wood-tint`, `grid` on `grid-tint`). Every pair clears 5:1 in both themes. Do not put one ink on another ink's tint.

**The Same Sheet Rule.** The night sheet re-values tokens and re-assigns nothing. Build with tokens only and both themes follow; a literal hex or `rgb()` in a component breaks the night sheet.

## Typography

**Display Font:** Atkinson Hyperlegible Next Variable (with ui-sans-serif, system-ui, sans-serif)
**Body Font:** Atkinson Hyperlegible Next Variable (same stack)
**Label/Mono Font:** Atkinson Hyperlegible Mono Variable (with ui-monospace, SFMono-Regular, monospace)

Both are self-hosted through `@fontsource-variable` and imported in `src/app/layout.tsx`.

**Character:** One humanist sans designed for legibility, used at every size, with weight and size doing the hierarchy. Its mono sibling marks anything the machine wrote: a path, a branch, a commit SHA, a repository name.

### Hierarchy
- **Display** (800, 3rem rising to 3.75rem from `sm`, line-height 1.05, tracking -0.03em): the landing headline only.
- **Headline** (700, 1.875rem, tracking -0.025em): landing section headings, held to about 24 to 26ch.
- **Title** (700, 1.125rem): step and audience names on the landing page. **Title small** (700, 1rem): app page title in the top bar, card titles, empty-state titles, the wordmark. Panel headings drop to 0.875rem bold.
- **Body** (400, 0.9375rem, line-height 1.5, tabular numerals): the document default. Long text is capped at 52 to 60ch. Landing lead copy is 1.125rem; notes in the document editor are 1rem at 1.65.
- **Body small** (400 to 600, 0.875rem): the working size of the app: buttons (600), inputs, table cells, navigation (500, 600 when current), notices. 0.8125rem is used for descriptions under a row title and for `sm` buttons.
- **Caption** (0.75rem): state-mark labels (500), revision metadata, visibility, helper text under a demo, `xs` buttons.
- **Label** (600, 0.6875rem, tracking 0.06em, uppercase, faded ink): the `legend-label` utility. Field names in a title block, table column heads, side-rail group names, the heading of a list inside a panel.
- **Datum** (mono, 0.8125rem, tracking -0.01em): the `datum` utility. Paths (`projects/<id>`), `owner/repo`, branch names, 7-character SHAs, step numerals.

Base heading styles (h1 to h4) are weight 700, tracking -0.015em, `text-wrap: balance`; paragraphs use `text-wrap: pretty`. Links underline with a 1px line offset 0.2em.

### Named Rules
**The Datum Rule.** Anything a person could paste into a terminal or a URL is set in the mono face with `datum`. Prose never is.

**The Marginalia Rule.** `legend-label` names a field, a column or a group of controls. It is map marginalia, not a kicker: do not place it above a heading as an eyebrow.

## Layout

**App.** A collapsible tinted side rail (lowland, right hairline) beside a sheet-coloured work area. The rail has a 48px header with the mark, a workspace switcher, and labelled navigation groups of 32px items with 2px between them; it collapses to icons. The work area has a sticky 48px top bar (page title, mono subtitle, search, sync controls, account) over a main region padded 12px by 20px, rising to 20px by 20px from `sm`. Content is full width; lists are ruled tables on paper, not card grids. Side panels (history) are paper with a left hairline and a 40px header.

**Landing.** A sticky 56px header and full-bleed bands that alternate sheet and lowland, each with a centred 72rem container padded 16px (24px from `sm`). Section padding is 64px vertical; the hero is 56px rising to 80px at `lg`. Two-column sections use uneven tracks (1fr / 1.05fr, 0.9fr / 1.1fr) with a 40px gap and stack below `lg`. Lists of steps and audiences are ruled rows (top hairline, bottom hairline per row, 20px vertical padding), not cards. The hero may carry a field of hairline contour lines in `rule` behind the content.

**Rhythm.** Tight and uneven on purpose: 6px between an icon and its label or between adjacent controls, 10px inside title-block and revision cells, 12px as the standard cell and panel inset, 20px for page gutters, 40px and 64px for landing structure. Icons are 16px (14px in `xs` and `sm` controls, 12px in badges and state glyphs).

**Responsive.** Tailwind default breakpoints. Tables drop columns rather than reflow: the project table hides Folder below `lg`, row links below `md`, Revised below `sm`, always keeping name and state. The top bar hides search below `md`, the mono subtitle and sync text labels below `sm`.

## Elevation & Depth

Flat. Depth is tonal and ruled: lowland rail, sheet page, paper work surface, margin headers, separated by 1px hairlines. The current navigation item is a paper chip with a 1px inset hairline (`inset 0 0 0 1px var(--rule)`), not a raised one.

### Shadow Vocabulary
- **Lifted sheet** (`0 18px 40px -24px` at 35% ink, or `0 12px 28px -16px` at 50% ink): one soft, tight, downward shadow for a surface that genuinely floats over other content: the alert that floats over the canvas when a save fails, and the demo sheet over the landing hero's contour field. Menus, selects and dialogs keep the small shadows of the shadcn primitives in `src/components/ui`.

### Named Rules
**The Ruled Not Raised Rule.** A surface that sits in the layout gets a hairline border and no shadow. Only a surface that overlaps other content may be lifted, with the one soft shadow above.

## Shapes

Tight, drafted corners on a four-step scale: 3px (badges, skeleton bars, inline text links' focus box), 4px (buttons, inputs, select triggers, navigation items, title blocks, notices, revision cells), 6px (tables, cards, panels, empty states, the demo sheet), 8px (dialogs only). Nothing is pill-shaped; the only circles are the legend glyphs and the dots on the revision ladder.

Borders are 1px. Solid `rule` for structure, solid `input` for controls, dashed `input` for an empty state waiting to be filled, and a dashed contour stroke for something drawn but not yet saved. Ruled containers clip their contents (`overflow: hidden`) so inner rules meet the outer border cleanly.

Focus is one treatment everywhere: a 2px grid-magenta outline offset 2px. Inputs additionally turn their border magenta.

The Sketchflow mark is a rounded square sheet (paper fill, 1.5px ink stroke) with a water contour line, a woodland contour line and a magenta benchmark dot. It uses the tokens, so it follows the theme.

## Components

Compact, plain and legible: controls look like labelled parts of an instrument, and their states are drawn, not animated. All interactive elements transition colour, background, border, shadow and opacity over 160ms with `cubic-bezier(0.16, 1, 0.3, 1)`; `prefers-reduced-motion` collapses all animation and transitions.

### Buttons
- **Shape:** 4px corners, 1px transparent border, 0.875rem semibold label, 16px icons. Heights 28px (`xs`), 32px (`sm`), 36px (default), 44px (`lg`); horizontal padding 10, 12, 14, 20px; square icon buttons at the same heights.
- **Primary:** water fill, `primary-foreground` text. One per view is the norm (Save, New project, Start with GitHub).
- **Outline:** paper fill, control-edge border, ink text; hover and expanded take the hover wash.
- **Secondary:** lowland fill, ink text; hover wash on hover.
- **Ghost:** transparent, faded ink; hover wash and full ink on hover. The default for icon buttons in rows and bars.
- **Destructive:** fault-red fill. **Link:** water text, underlined, underline removed on hover.
- **Hover / Active / Focus / Disabled:** filled variants drop to 90% opacity of their fill on hover; every button moves down 1px while pressed; focus is the magenta outline; disabled is 50% opacity with no pointer events. Toggles use `aria-pressed`, and a pressed toggle also changes variant and label (for example "Preview" outline becomes "Stop previewing" primary).

### Chips
- **Badge:** 20px high, 3px corners, 6px side padding, the label style (0.6875rem semibold uppercase). `default` water on water tint, `draft` contour on contour tint, `synced` wood on wood tint, `destructive` red on 10% red, `secondary` ink on lowland, `outline` faded ink with a hairline border, `ghost` faded ink only.

### Cards / Containers
- **Corner Style:** 6px.
- **Background:** paper on the sheet.
- **Shadow Strategy:** none (see Elevation).
- **Border:** 1px hairline. Header bars and footers inside a container use the margin fill and a hairline divider.
- **Internal Padding:** 16px (12px for the `sm` card); ruled panels use 12px insets.
- **Empty panel:** paper with a dashed control-edge border, 20px by 32px padding, a 1rem bold title, one or two sentences in faded ink capped at 60ch that say what belongs here and how to put it there, and an optional row of actions.
- **Notice:** 4px corners, 12px by 8px padding, 0.875rem. Error: 10% red fill, 40% red border, red text, `role="alert"`. Info: margin fill, hairline border, faded ink, `role="status"`.
- **Skeleton:** the real container's border and header bar, with 14px-high 3px-cornered bars in hover wash and margin, pulsing; `aria-busy` on the container.

### Inputs / Fields
- **Style:** 36px high (32px in the top bar), 4px corners, paper fill, 1px control-edge border, 12px horizontal padding, 0.875rem text, faded-ink placeholder.
- **Hover:** border darkens toward faded ink.
- **Focus:** border turns grid magenta, plus the global magenta outline; the caret is magenta.
- **Error / Disabled:** `aria-invalid` gives a fault-red border; disabled takes the margin fill at 60% opacity.
- **Select trigger:** same box; set in `datum` when it holds a repository name.

### Navigation
- **Side rail:** lowland ground, group names in the label style, items 32px high with 4px corners, 16px icon, 10px gap, 0.875rem medium at 80% ink. Hover: `sidebar-accent` fill, full ink. Current (`aria-current="page"`): paper fill, 1px inset hairline, semibold, and the icon turns grid magenta. Collapsed: 32px icon squares with `title` tooltips. A state glyph at the right edge of an item flags work that needs attention.
- **Top bar:** 48px, sheet ground, bottom hairline, sticky. Bold 1rem title with a mono subtitle; controls are `sm` and `icon-sm` ghost buttons at 6px gaps.
- **Landing header:** 56px, sheet ground, bottom hairline; links are 0.875rem medium faded ink that turn ink on hover, hidden below `md`.

### State Mark (signature)
A 12px legend glyph plus a 0.75rem medium label, 6px apart, both in the state's ink. Five states: **Synced** (filled disc, wood), **Unsaved draft** (ring with the left half filled, contour), **Local only** (ring, faded ink), **Sync paused** (ring with a horizontal bar, faded ink), **Sync failed** (filled rounded square, fault red). `StateGlyph` is the glyph alone and is `aria-hidden`; when it appears without its label, supply the meaning in text (`sr-only` or a button label).

### Title Block (signature)
A ruled two-column definition list with 4px corners and a hairline border: label cells on the margin fill in the label style, a hairline between label and value and between rows, value cells in ink with 10px by 6px padding and truncation. Pass `mono` for values that are data (branch, commit). The last row is normally the state, shown with a `StateMark`. Use it wherever one piece of work is described: where it lives, its revision, its state.

### Ruled Table (signature)
The project list. A 6px-cornered paper container with a hairline border; a margin-filled head row in the label style; rows separated by hairlines with 12px by 10px cells, top-aligned. Each row is that project's title block laid out sideways: a semibold name that turns water and underlines on hover, with a one-line faded description; the folder in `datum`; the revised date as "12 Nov 2026"; a `StateMark` over a visibility caption; then right-aligned ghost `icon-sm` links, each with an `aria-label` and `title`. Row hover is the margin fill at 60%.

### Revision Ladder (signature)
History as a map scale bar. Down the left edge of an ordered list runs a 6px bar with 1px ink sides, divided into one segment per commit, alternating ink and paper, newest at the top. Each commit has a 14px hairline tick leaving the bar; the tick turns grid magenta and 2px thick for the version being previewed. Beside it, a 4px-cornered cell holds the message (0.875rem medium, two lines at most), a caption line with the 7-character SHA in `datum`, date, author and a wood "Latest" tag, then `xs` actions. Hover draws a hairline and a margin wash; the selected cell takes the grid tint with a 60% magenta border.

## Do's and Don'ts

### Do:
- **Do** build from the tokens in `src/app/globals.css` (`bg-card`, `border-rule`, `text-water`, `bg-contour-tint`) so the night sheet follows automatically.
- **Do** show state with `StateMark` or `StateGlyph`: shape, label and ink together, using the five existing states and their wording (Synced, Unsaved draft, Local only, Sync paused, Sync failed).
- **Do** keep each ink to its job: water for the primary action and links, contour for unsaved drafts, wood for synced, grid magenta for selection, current location and focus.
- **Do** set paths, `owner/repo`, branch names and SHAs in `datum`, and shorten SHAs to 7 characters.
- **Do** describe a single piece of work with a `TitleBlock` (location, revision, state) and list many with the ruled table.
- **Do** separate surfaces with a 1px `rule` hairline and a tint step (lowland, sheet, paper, margin) rather than a shadow.
- **Do** use `border-input` for the edge of anything interactive; `rule` is too faint to bound a control.
- **Do** use the radius scale as assigned: 3px badges, 4px controls, 6px containers, 8px dialogs.
- **Do** keep the single focus treatment (2px grid-magenta outline, 2px offset) and leave it visible on every interactive element.
- **Do** give every icon-only button an `aria-label` and a `title`, and use lucide-react icons at 16px (14px in small controls).
- **Do** write empty states that say what belongs here and how to put it there, with the action attached.
- **Do** cap running text at 52 to 60ch and leave tables and panels full width.

### Don't:
- **Don't** signal state with colour alone: no bare coloured dots, no coloured text without a glyph and a label.
- **Don't** use an ink outside its job: no orange for warnings in general, no green for generic success, no magenta as a brand accent, no blue on things that are not actions or links.
- **Don't** write literal colours in components. A hex or `rgb()` value does not change with the theme.
- **Don't** add shadows to surfaces that sit in the layout, and don't stack shadows on top of borders for decoration.
- **Don't** use pills, fully rounded buttons or radii above 8px.
- **Don't** use `legend-label` as an eyebrow above a heading; it names fields, columns and groups.
- **Don't** set prose or UI labels in the mono face, or data in the sans.
- **Don't** lay projects or lists out as a grid of identical cards; this system rules its lists.
- **Don't** add gradients, glass or blur, or a second typeface.
- **Don't** restyle the insides of Excalidraw or BlockNote beyond the token overrides already in `globals.css`.
- **Don't** add motion beyond the 160ms state transitions, skeleton pulse and spinner, and never without honouring `prefers-reduced-motion`.
