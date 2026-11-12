"use client";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { Loader2 } from "lucide-react";
import { useId, useState, type FormEvent, type KeyboardEvent } from "react";

import type { InsertTabProps } from "@/components/editor/insert/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DIAGRAM_TEMPLATES, templatePreview, type DiagramTemplate, type DiagramTheme, type PreviewShape, type TemplatePreview } from "@/lib/diagram-templates";
import { insertMermaid, insertTemplate } from "@/lib/diagram-templates/insert";
import { describeMermaidError, EDITABLE_MERMAID_KINDS, MERMAID_EXAMPLES, mermaidInputProblem } from "@/lib/diagram-templates/mermaid";

const NOTICE_CLASS = "rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive";
const MERMAID_PLACEHOLDER = "flowchart TD\n  A[Start] --> B[Finish]";

// A thumbnail only shows a template's layout, which is the same in both themes, so the
// previews are worked out once. Their colours come from the app's own theme in CSS.
const PREVIEWS = new Map(DIAGRAM_TEMPLATES.map((template) => [template.id, templatePreview(template.build("light"))]));

const SHAPE_TONE_CLASS: Record<PreviewShape["tone"], string> = {
	backdrop: "fill-muted stroke-rule",
	filled: "fill-water-tint stroke-foreground/70",
	plain: "fill-card stroke-foreground/70",
};

type SectionProps = {
	api: ExcalidrawImperativeAPI;
	theme: DiagramTheme;
	onInserted: (label: string) => void;
};

function PreviewShapeMark({ shape }: { shape: PreviewShape }) {
	const className = SHAPE_TONE_CLASS[shape.tone];
	if (shape.kind === "ellipse") {
		return (
			<ellipse
				cx={shape.x + shape.width / 2}
				cy={shape.y + shape.height / 2}
				rx={shape.width / 2}
				ry={shape.height / 2}
				vectorEffect="non-scaling-stroke"
				className={className}
			/>
		);
	}
	if (shape.kind === "diamond") {
		const middleX = shape.x + shape.width / 2;
		const middleY = shape.y + shape.height / 2;
		const corners = `${middleX},${shape.y} ${shape.x + shape.width},${middleY} ${middleX},${shape.y + shape.height} ${shape.x},${middleY}`;
		return <polygon points={corners} vectorEffect="non-scaling-stroke" className={className} />;
	}
	return <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={1} vectorEffect="non-scaling-stroke" className={className} />;
}

/** A small schematic of a template: its boxes and connectors, without any text. */
function TemplateThumbnail({ preview }: { preview: TemplatePreview }) {
	return (
		<svg viewBox={`0 0 ${preview.width} ${preview.height}`} className="size-full overflow-visible" fill="none" strokeWidth={1} aria-hidden="true" focusable="false">
			{preview.shapes.map((shape) => (
				<PreviewShapeMark key={shape.id} shape={shape} />
			))}
			{preview.lines.map((line) => (
				<polyline
					key={line.id}
					points={line.points.map((point) => point.join(",")).join(" ")}
					strokeDasharray={line.isDashed ? "2 2" : undefined}
					vectorEffect="non-scaling-stroke"
					className="stroke-foreground/60"
				/>
			))}
		</svg>
	);
}

function StarterRow({ template, isPending, onChoose }: { template: DiagramTemplate; isPending: boolean; onChoose: (template: DiagramTemplate) => void }) {
	const preview = PREVIEWS.get(template.id);
	const thumbnail = preview ? <TemplateThumbnail preview={preview} /> : null;

	return (
		<li>
			<button
				type="button"
				onClick={() => onChoose(template)}
				aria-busy={isPending}
				className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left -outline-offset-2 hover:bg-muted/60 active:bg-muted"
			>
				<span className="grid h-12 w-[4.5rem] shrink-0 place-items-center rounded-sm border border-rule bg-background p-1.5">
					{isPending ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" /> : thumbnail}
				</span>
				<span className="min-w-0">
					<span className="block text-sm font-semibold text-foreground">{template.name}</span>
					<span className="block text-xs text-muted-foreground">{template.description}</span>
				</span>
			</button>
		</li>
	);
}

function StarterList({ api, theme, onInserted }: SectionProps) {
	const headingId = useId();
	const [pendingId, setPendingId] = useState<string | null>(null);
	const [error, setError] = useState("");

	async function handleChoose(template: DiagramTemplate) {
		// One at a time: a second click while the first is still loading would add two copies.
		if (pendingId) return;
		setPendingId(template.id);
		setError("");
		try {
			await insertTemplate(api, template, theme);
			onInserted(template.name);
		} catch (failure) {
			console.warn("A starter diagram could not be added to the canvas:", failure);
			setError(`The ${template.name.toLowerCase()} could not be added to the canvas. Try again.`);
		} finally {
			setPendingId(null);
		}
	}

	return (
		<section aria-labelledby={headingId}>
			<h3 id={headingId} className="legend-label px-3 pt-3 pb-2">
				Starter diagrams
			</h3>
			<ul className="divide-y divide-rule border-y border-rule">
				{DIAGRAM_TEMPLATES.map((template) => (
					<StarterRow key={template.id} template={template} isPending={pendingId === template.id} onChoose={handleChoose} />
				))}
			</ul>
			<div aria-live="polite">{error ? <p className={`mx-3 mt-3 ${NOTICE_CLASS}`}>{error}</p> : null}</div>
		</section>
	);
}

function MermaidForm({ api, theme, onInserted }: SectionProps) {
	const headingId = useId();
	const examplesId = useId();
	const textId = useId();
	const hintId = useId();
	const errorId = useId();
	const [text, setText] = useState("");
	const [error, setError] = useState("");
	const [isConverting, setIsConverting] = useState(false);

	function handleTextChange(nextText: string) {
		setText(nextText);
		setError("");
	}

	function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
		if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
			event.preventDefault();
			event.currentTarget.form?.requestSubmit();
		}
	}

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (isConverting) return;

		const problem = mermaidInputProblem(text);
		if (problem) {
			setError(problem);
			return;
		}

		setError("");
		setIsConverting(true);
		try {
			const result = await insertMermaid(api, text, theme);
			onInserted(result.isImage ? "Mermaid diagram as an image" : "Mermaid diagram");
		} catch (failure) {
			console.warn("Mermaid text could not be converted:", failure);
			setError(describeMermaidError(failure, text));
		} finally {
			setIsConverting(false);
		}
	}

	return (
		<section aria-labelledby={headingId} className="px-3 pt-5 pb-4">
			<h3 id={headingId} className="legend-label">
				Paste Mermaid
			</h3>
			<form onSubmit={handleSubmit} noValidate className="mt-2 flex flex-col gap-2">
				<div role="group" aria-labelledby={examplesId} className="flex flex-wrap items-center gap-1.5">
					<span id={examplesId} className="mr-0.5 text-xs text-muted-foreground">
						Start from an example
					</span>
					{MERMAID_EXAMPLES.map((example) => {
						const isShown = text === example.text;
						return (
							<Button key={example.id} type="button" variant={isShown ? "secondary" : "outline"} size="xs" aria-pressed={isShown} onClick={() => handleTextChange(example.text)}>
								{example.label}
							</Button>
						);
					})}
				</div>

				<label htmlFor={textId} className="text-xs font-semibold text-foreground">
					Mermaid text
				</label>
				<Textarea
					id={textId}
					value={text}
					onChange={(event) => handleTextChange(event.target.value)}
					onKeyDown={handleKeyDown}
					placeholder={MERMAID_PLACEHOLDER}
					spellCheck={false}
					autoCapitalize="off"
					autoCorrect="off"
					aria-invalid={error ? true : undefined}
					aria-describedby={`${hintId} ${errorId}`}
					className="datum max-h-72 min-h-32 overflow-auto rounded-md whitespace-pre"
				/>
				<p id={hintId} className="text-xs text-muted-foreground">
					{EDITABLE_MERMAID_KINDS} become editable shapes. Other kinds are added as an image.
				</p>

				<div id={errorId} aria-live="polite">
					{error ? <p className={NOTICE_CLASS}>{error}</p> : null}
				</div>

				<Button type="submit" size="sm" aria-disabled={isConverting} className="self-start">
					{isConverting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
					{isConverting ? "Creating diagram" : "Create diagram"}
				</Button>
			</form>
		</section>
	);
}

/** Starter diagrams that land on the canvas as editable shapes, and a Mermaid converter. */
export function DiagramsTab({ api, isDark, onInserted }: InsertTabProps) {
	const theme: DiagramTheme = isDark ? "dark" : "light";

	return (
		<div>
			<StarterList api={api} theme={theme} onInserted={onInserted} />
			<MermaidForm api={api} theme={theme} onInserted={onInserted} />
		</div>
	);
}
