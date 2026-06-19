export const dynamic = "force-dynamic";

import { requireUser, normalizeStackUser } from "@/server/auth";
import { upsertUser } from "@/server/db/repositories";
import { listWorkspaces, upsertWorkspace, type WorkspaceVisibility } from "@/server/db/repositories";
import { BadRequestError, jsonError, jsonOk } from "@/server/http";
import { isJsonObject, optionalString, requiredString } from "@/server/validation";

function parseVisibility(value: string | undefined): WorkspaceVisibility {
	if (!value) {
		return "public";
	}

	if (value === "private" || value === "public") {
		return value;
	}

	throw new BadRequestError('Expected "visibility" to be "private" or "public"');
}

export async function GET() {
	try {
		const stackUser = await requireUser();
		const user = normalizeStackUser(stackUser);
		await upsertUser(user);

		const workspaces = await listWorkspaces(user.id);

		return jsonOk({ workspaces });
	} catch (error) {
		return jsonError(error);
	}
}

export async function POST(request: Request) {
	try {
		const stackUser = await requireUser();
		const user = normalizeStackUser(stackUser);
		await upsertUser(user);

		const body = await request.json();
		if (!isJsonObject(body)) {
			throw new BadRequestError("Expected a JSON object body");
		}

		const workspace = await upsertWorkspace(user.id, {
			repoOwner: requiredString(body, "repoOwner"),
			repoName: requiredString(body, "repoName"),
			defaultBranch: optionalString(body, "defaultBranch"),
			visibility: parseVisibility(optionalString(body, "visibility")),
			latestCommitSha: optionalString(body, "latestCommitSha") ?? null,
		});

		return jsonOk({ workspace }, { status: 201 });
	} catch (error) {
		return jsonError(error);
	}
}
