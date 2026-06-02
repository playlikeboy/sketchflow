import { type NextRequest } from "next/server";

import { buildLibraryFileUrl, isSafeLibrarySource } from "@/lib/excalidraw-libraries";

export const revalidate = 86400;

export async function GET(request: NextRequest) {
	const source = request.nextUrl.searchParams.get("source") ?? "";

	if (!isSafeLibrarySource(source)) {
		return Response.json({ error: "Invalid library source" }, { status: 400 });
	}

	const response = await fetch(buildLibraryFileUrl(source), {
		next: {
			revalidate: 86400,
			tags: ["excalidraw-library-files"],
		},
	});

	if (!response.ok) {
		return Response.json({ error: "Library file is temporarily unavailable" }, { status: 502 });
	}

	return new Response(await response.arrayBuffer(), {
		headers: {
			"Content-Type": "application/vnd.excalidrawlib+json",
			"Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
		},
	});
}

