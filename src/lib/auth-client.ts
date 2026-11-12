"use client";

import { createAuthClient } from "better-auth/client";

import { SIGN_IN_PATH, safeReturnPath, signInPath } from "@/lib/return-path";

type AuthClient = ReturnType<typeof createAuthClient>;

let authClient: AuthClient | null = null;

// Created on first use so importing this module during server rendering does nothing.
function getAuthClient() {
	if (!authClient) {
		authClient = createAuthClient();
	}

	return authClient;
}

function currentPath() {
	return `${window.location.pathname}${window.location.search}`;
}

/** Sends the browser to the sign-in page, remembering the page it came from. */
export function redirectToSignIn() {
	window.location.assign(signInPath(currentPath()));
}

/**
 * Starts GitHub sign-in. GitHub asks for repository access on its consent screen the first
 * time; after that the same call silently refreshes the session and its GitHub token.
 */
export async function signInWithGithub(returnPath: string = currentPath()) {
	const { error } = await getAuthClient().signIn.social({
		provider: "github",
		callbackURL: safeReturnPath(returnPath),
		errorCallbackURL: SIGN_IN_PATH,
	});

	if (error) {
		throw new Error("GitHub sign-in did not start. Try again in a moment.");
	}
}

export async function signOut() {
	const { error } = await getAuthClient().signOut();

	if (error) {
		throw new Error("Sign-out did not finish. Try again.");
	}
}
