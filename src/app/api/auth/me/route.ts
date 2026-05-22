import { jsonError, jsonOk } from "@/server/http";
import { getOptionalUser, normalizeStackUser } from "@/server/auth";

export async function GET() {
	try {
		const user = await getOptionalUser();

		return jsonOk({
			authenticated: Boolean(user),
			user: user ? normalizeStackUser(user) : null,
		});
	} catch (error) {
		return jsonError(error);
	}
}
