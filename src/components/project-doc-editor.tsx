"use client";

import { BlockNoteViewRaw, useCreateBlockNote, useEditorChange } from "@blocknote/react";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const MAX_INLINE_UPLOAD_BYTES = 2_000_000;

function readFileAsDataUrl(file: File) {
	return new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.addEventListener("load", () => {
			if (typeof reader.result === "string") {
				resolve(reader.result);
			} else {
				reject(new Error("Image upload could not be read"));
			}
		});
		reader.addEventListener("error", () => reject(new Error("Image upload could not be read")));
		reader.readAsDataURL(file);
	});
}

export function ProjectDocEditor({
	documentKey,
	markdown,
	onMarkdownChange,
}: {
	documentKey: string;
	markdown: string;
	onMarkdownChange: (markdown: string) => void;
}) {
	const [ready, setReady] = useState(false);
	const [uploadError, setUploadError] = useState<string | null>(null);
	const applyingExternalContentRef = useRef(false);
	const lastAppliedRef = useRef("");
	const lastEmittedMarkdownRef = useRef(markdown);
	const editor = useCreateBlockNote({
		uploadFile: async (file) => {
			if (file.size > MAX_INLINE_UPLOAD_BYTES) {
				const message = "Use images under 2 MB for Git-backed docs.";
				setUploadError(message);
				throw new Error(message);
			}

			setUploadError(null);
			return readFileAsDataUrl(file);
		},
	});

	useEffect(() => {
		let cancelled = false;
		const syncId = `${documentKey}:${markdown}`;

		if (lastAppliedRef.current === syncId) {
			return;
		}

		async function loadMarkdown() {
			applyingExternalContentRef.current = true;
			setReady(false);

			try {
				const blocks = await editor.tryParseMarkdownToBlocks(markdown || "");

				if (cancelled) {
					return;
				}

				editor.replaceBlocks(editor.document, blocks);
				lastAppliedRef.current = syncId;
				lastEmittedMarkdownRef.current = markdown;
				setReady(true);
			} finally {
				if (!cancelled) {
					applyingExternalContentRef.current = false;
				}
			}
		}

		void loadMarkdown();

		return () => {
			cancelled = true;
			applyingExternalContentRef.current = false;
		};
	}, [documentKey, editor, markdown]);

	useEditorChange((changedEditor) => {
		if (applyingExternalContentRef.current) {
			return;
		}

		const nextMarkdown = changedEditor.blocksToMarkdownLossy(changedEditor.document);

		if (nextMarkdown === lastEmittedMarkdownRef.current) {
			return;
		}

		lastEmittedMarkdownRef.current = nextMarkdown;
		lastAppliedRef.current = `${documentKey}:${nextMarkdown}`;
		onMarkdownChange(nextMarkdown);
	}, editor);

	return (
		<div className="relative h-full min-h-0 bg-card">
			{!ready ? (
				<div className="absolute inset-0 z-10 grid place-items-center bg-card text-sm font-medium text-muted-foreground">
					<div className="flex items-center gap-2">
						<Loader2 className="size-4 animate-spin text-primary" />
						Opening docs
					</div>
				</div>
			) : null}
			<BlockNoteViewRaw editor={editor} className="sketchflow-doc-editor h-full" />
			{uploadError ? (
				<div className="absolute bottom-3 left-3 right-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
					{uploadError}
				</div>
			) : null}
		</div>
	);
}
