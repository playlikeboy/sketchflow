// Text the Diagrams tab needs around Mermaid conversion: starting examples, input checks and
// plain-language messages for the parser's errors. The converter itself only runs in the browser.

/** Longest Mermaid text the tab will try to convert. */
export const MERMAID_MAX_LENGTH = 20_000;

export type MermaidExample = { id: string; label: string; text: string };

export const MERMAID_EXAMPLES: readonly MermaidExample[] = [
	{
		id: "flowchart",
		label: "Flowchart",
		text: ["flowchart TD", "  A[Open sketch] --> B{Signed in?}", "  B -- Yes --> C[Save to GitHub]", "  B -- No --> D[Keep a local draft]", "  D --> E[Sign in later]", "  E --> C"].join("\n"),
	},
	{
		id: "sequence",
		label: "Sequence",
		text: [
			"sequenceDiagram",
			"  participant U as User",
			"  participant A as App",
			"  participant G as GitHub",
			"  U->>A: Save sketch",
			"  A->>G: Commit files",
			"  G-->>A: Commit SHA",
			"  A-->>U: Saved",
		].join("\n"),
	},
	{
		id: "class",
		label: "Class diagram",
		text: [
			"classDiagram",
			"  class Workspace {",
			"    +String name",
			"    +addProject()",
			"  }",
			"  class Project {",
			"    +String title",
			"    +save()",
			"  }",
			'  Workspace "1" --> "*" Project : contains',
		].join("\n"),
	},
];

/** Diagram kinds the converter turns into separate, editable shapes. Others become one image. */
export const EDITABLE_MERMAID_KINDS = "Flowcharts, sequence, class, entity-relationship and state diagrams";

/** The converter's code could not be downloaded, for example because the device is offline. */
export class MermaidUnavailableError extends Error {
	override name = "MermaidUnavailableError";
}

/** The text was valid Mermaid but described nothing to draw. */
export class EmptyDiagramError extends Error {
	override name = "EmptyDiagramError";
}

const GENERIC_SYNTAX_ERROR = "That Mermaid text has a syntax error. Compare it with one of the examples and try again.";
const MAX_SNIPPET_LENGTH = 60;
const MAX_PARSER_MESSAGE_LENGTH = 140;

/** A message when the text cannot be sent to the converter at all, or null when it can. */
export function mermaidInputProblem(text: string): string | null {
	if (text.trim().length === 0) return "Paste or type some Mermaid text first.";
	if (text.length > MERMAID_MAX_LENGTH) {
		return `That is too long to convert. Keep it under ${MERMAID_MAX_LENGTH.toLocaleString("en-US")} characters.`;
	}
	return null;
}

function messageOf(error: unknown) {
	if (error instanceof Error) return error.message;
	return typeof error === "string" ? error : "";
}

// Parser output is shown as text, never as markup. This only keeps it short and on one line.
function toOneLine(text: string) {
	return Array.from(text, (character) => (character < " " ? " " : character))
		.join("")
		.replace(/\s+/g, " ")
		.trim();
}

function shorten(text: string, maxLength: number) {
	return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}

// Mermaid's older grammars report "Parse error on line 3:" followed by an excerpt of the text
// and a caret line; its newer ones report "Lexer error on line 2, column 12: ...". Both give a
// line number, which can be one past the end when the problem is that the text stops early.
const ERROR_LINE = /(?:parse|lexical|lexer) error on line (\d+)/i;
const CARET_LINE = /^-*\^$/;

function sourceLines(source: string) {
	return source.trimEnd().split(/\r?\n/);
}

// The parser's own excerpt is cut mid-word and runs lines together, so the person's own line
// is quoted when there is one and the excerpt is only a fallback.
function snippetNearError(message: string, lines: readonly string[], lineNumber: number) {
	const ownLine = toOneLine(lines[lineNumber - 1] ?? "");
	if (ownLine) return shorten(ownLine, MAX_SNIPPET_LENGTH);

	const [, excerpt = "", caret = ""] = message.split("\n");
	if (!CARET_LINE.test(caret.trim())) return "";
	return shorten(toOneLine(excerpt).replace(/^\.{3}/, "").trim(), MAX_SNIPPET_LENGTH);
}

/** Turns whatever the Mermaid parser threw into one plain sentence for the person. */
export function describeMermaidError(error: unknown, source: string): string {
	if (error instanceof MermaidUnavailableError) {
		return "The Mermaid converter could not be loaded. Check your connection and try again.";
	}
	if (error instanceof EmptyDiagramError) {
		return "That Mermaid text has nothing to draw yet. Add at least one node or message.";
	}

	const message = messageOf(error);
	if (/no diagram type detected/i.test(message)) {
		return 'That does not look like Mermaid text. Start with a diagram type, such as "flowchart TD" or "sequenceDiagram".';
	}

	const line = message.match(ERROR_LINE);
	if (line) {
		const lines = sourceLines(source);
		const lineNumber = Math.min(Math.max(Number(line[1]), 1), lines.length);
		const snippet = snippetNearError(message, lines, lineNumber);
		const where = `That Mermaid text has a syntax error near line ${lineNumber}`;
		return snippet ? `${where}: ${snippet}` : `${where}.`;
	}

	const detail = toOneLine(message);
	if (detail && detail.length <= MAX_PARSER_MESSAGE_LENGTH) {
		return `That Mermaid text could not be converted: ${detail}`;
	}
	return GENERIC_SYNTAX_ERROR;
}
