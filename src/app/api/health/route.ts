import { pingDatabase } from "@/server/db/client";
import { jsonOk } from "@/server/http";

// Liveness by default: no database round trip and nothing internal in the response.
// `?deep=1` also checks the database and reports only whether it answered.
export async function GET(request: Request) {
	const deep = new URL(request.url).searchParams.get("deep") === "1";

	if (!deep) {
		return jsonOk({ ok: true, service: "sketchflow-api" });
	}

	const database = await pingDatabase()
		.then(() => true)
		.catch(() => false);

	return jsonOk({ ok: database, service: "sketchflow-api", database }, { status: database ? 200 : 503 });
}
