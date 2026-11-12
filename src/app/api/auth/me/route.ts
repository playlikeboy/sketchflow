import { jsonError, jsonOk } from "@/server/http";
import { getOptionalUser } from "@/server/auth";

export async function GET() {
	try {
		const user = await getOptionalUser();

		return jsonOk({
			authenticated: Boolean(user),
			user,
		});
	} catch (error) {
		return jsonError(error);
	}
}
