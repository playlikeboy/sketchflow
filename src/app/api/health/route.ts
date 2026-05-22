import { pingDatabase } from "@/server/db/client";
import { jsonError, jsonOk } from "@/server/http";

export async function GET() {
	try {
		const database = await pingDatabase();

		return jsonOk({
			ok: true,
			service: "sketchflow-api",
			database,
		});
	} catch (error) {
		return jsonError(error);
	}
}
