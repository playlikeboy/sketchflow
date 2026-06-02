import {
	EXCALIDRAW_LIBRARY_CATALOG_URL,
	EXCALIDRAW_LIBRARY_HOME,
	normalizeExcalidrawLibrary,
	type RawExcalidrawLibrary,
} from "@/lib/excalidraw-libraries";

export const dynamic = "force-static";
export const revalidate = 3600;

export async function GET() {
	const response = await fetch(EXCALIDRAW_LIBRARY_CATALOG_URL, {
		next: {
			revalidate: 3600,
			tags: ["excalidraw-libraries"],
		},
	});

	if (!response.ok) {
		return Response.json(
			{ error: "Excalidraw libraries are temporarily unavailable" },
			{ status: 502 },
		);
	}

	const rawLibraries = (await response.json()) as RawExcalidrawLibrary[];
	const libraries = rawLibraries
		.map((library) => normalizeExcalidrawLibrary(library))
		.filter((library) => library !== null)
		.sort((left, right) => left.name.localeCompare(right.name));

	return Response.json({
		libraries,
		total: libraries.length,
		source: EXCALIDRAW_LIBRARY_HOME,
		updatedAt: new Date().toISOString(),
	});
}

