import type { Metadata } from "next";

import { SignInClient } from "@/components/sign-in-client";
import { safeReturnPath } from "@/lib/return-path";

export const metadata: Metadata = {
	title: "Sign in",
	description: "Sign in to Sketchflow with your GitHub account.",
	robots: { index: false, follow: false },
};

function firstValue(value: string | string[] | undefined) {
	return Array.isArray(value) ? value[0] : value;
}

export default async function SignInPage({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const params = await searchParams;

	return (
		<SignInClient
			returnPath={safeReturnPath(firstValue(params.next))}
			failed={Boolean(firstValue(params.error))}
		/>
	);
}
