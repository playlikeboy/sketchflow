import { SKETCHFLOW_APP_URL } from "@/lib/config";
import { normalizeStackUser, requireGithubAccessToken, requireUser } from "@/server/auth";
import {
	recordSyncEvent,
	upsertGithubConnection,
	upsertUser,
	upsertWorkspace,
	type WorkspaceVisibility,
} from "@/server/db/repositories";
import { getGithubOAuthScopes, getOptionalEnv } from "@/server/env";
import {
	buildInitialWorkspaceFiles,
	createCommitOnBranch,
	ensureUserRepository,
	getAuthenticatedGithubUser,
	getBranchHeadSha,
	getGithubTreeRecursive,
	jsDelivrBaseUrl,
	validateGithubPathSegment,
	validateGithubRepoName,
} from "@/server/github";
import { BadRequestError, jsonError, jsonOk, assertSameOrigin, assertRateLimit } from "@/server/http";
import { RATE_LIMITS } from "@/server/rate-limit";
import { isJsonObject, optionalBoolean, optionalString } from "@/server/validation";

function parseVisibility(isPrivate: boolean): WorkspaceVisibility {
	return isPrivate ? "private" : "public";
}

export async function POST(request: Request) {
	try {
		assertSameOrigin(request);
		const stackUser = await requireUser();
		const user = normalizeStackUser(stackUser);
		assertRateLimit("bootstrap", user.id, RATE_LIMITS.bootstrap);
		const scopes = getGithubOAuthScopes();
		const { accessToken } = await requireGithubAccessToken(scopes, request);

		const body = await request.json().catch(() => ({}));
		if (!isJsonObject(body)) {
			throw new BadRequestError("Expected a JSON object body");
		}

		const repoName = validateGithubRepoName(optionalString(body, "repoName") || getOptionalEnv("SKETCHFLOW_REPO_NAME", "sketchflow-workspace"));
		const isPrivate = optionalBoolean(body, "private") ?? false;
		const appUrl = getOptionalEnv("NEXT_PUBLIC_APP_URL", SKETCHFLOW_APP_URL);
		const requestedOwnerInput = optionalString(body, "repoOwner");
		const requestedOwner = requestedOwnerInput ? validateGithubPathSegment(requestedOwnerInput) : undefined;
		const authenticatedGithubUser = await getAuthenticatedGithubUser(accessToken);
		const repoOwner = requestedOwner || authenticatedGithubUser.login;

		const { githubUser, repository, created } = await ensureUserRepository(accessToken, repoOwner, repoName, isPrivate, appUrl);
		const branch = repository.default_branch || getOptionalEnv("SKETCHFLOW_DEFAULT_BRANCH", "main");
		const initialFiles = buildInitialWorkspaceFiles({
			owner: repository.owner.login,
			repo: repository.name,
			branch,
			stackUserId: user.id,
			githubLogin: githubUser.login,
			appUrl,
			visibility: parseVisibility(repository.private),
		});

		// Never overwrite content in a repository that already exists: only add missing scaffold files,
		// and leave the user's README alone.
		let files = initialFiles;
		if (!created) {
			// Any failure to read the tree aborts the request: without the full file list we cannot
			// tell which scaffold files would overwrite the user's own.
			const headSha = await getBranchHeadSha(accessToken, repository.owner.login, repository.name, branch);
			const tree = await getGithubTreeRecursive({
				accessToken,
				owner: repository.owner.login,
				repo: repository.name,
				treeShaOrBranch: headSha,
			});
			if (tree.truncated) {
				throw new BadRequestError("Repository is too large to inspect safely. Use a dedicated Sketchflow repository.");
			}
			const existingPaths = new Set(tree.tree.map((entry) => entry.path));
			const alreadyInitialized = existingPaths.has(".sketchflow/workspace.json");
			files = alreadyInitialized
				? []
				: initialFiles.filter((file) => file.path !== "README.md" && !existingPaths.has(file.path));
		}

		const commit =
			files.length > 0
				? await createCommitOnBranch({
						accessToken,
						owner: repository.owner.login,
						repo: repository.name,
						branch,
						message: "Initialize Sketchflow workspace",
						files,
					})
				: {
						sha: await getBranchHeadSha(accessToken, repository.owner.login, repository.name, branch),
						htmlUrl: repository.html_url,
						branch,
						files: [] as string[],
					};

		await upsertUser(user);
		await upsertGithubConnection(user.id, {
			githubLogin: githubUser.login,
			githubUserId: String(githubUser.id),
			scopes,
		});

		const workspace = await upsertWorkspace(user.id, {
			repoOwner: repository.owner.login,
			repoName: repository.name,
			defaultBranch: branch,
			visibility: parseVisibility(repository.private),
			latestCommitSha: commit.sha,
		});

		await recordSyncEvent({
			workspaceId: workspace.id,
			stackUserId: user.id,
			eventType: created ? "workspace_repo_created" : "workspace_repo_connected",
			commitSha: commit.sha,
			message: "Initialized Sketchflow workspace files",
			metadata: {
				repository: repository.full_name,
				files: commit.files,
			},
		});

		return jsonOk(
			{
				workspace,
				repository: {
					fullName: repository.full_name,
					htmlUrl: repository.html_url,
					defaultBranch: branch,
					private: repository.private,
					created,
				},
				commit,
				cdnBaseUrl: jsDelivrBaseUrl(repository.owner.login, repository.name, commit.sha),
			},
			{ status: 201 },
		);
	} catch (error) {
		return jsonError(error);
	}
}
