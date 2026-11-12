"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { BrandMark } from "@/components/brand-mark";
import { StateGlyph } from "@/components/state-mark";
import { Button } from "@/components/ui/button";
import { signInWithGithub } from "@/lib/auth-client";
import { useAuthMe } from "@/lib/swr-hooks";

const SIGN_IN_FAILED_MESSAGE = "GitHub sign-in did not finish. Nothing was changed. Try again.";

export function SignInClient({ returnPath, failed }: { returnPath: string; failed: boolean }) {
	const router = useRouter();
	const { data: auth } = useAuthMe();
	const [starting, setStarting] = useState(false);
	const [error, setError] = useState<string | null>(failed ? SIGN_IN_FAILED_MESSAGE : null);

	useEffect(() => {
		if (auth?.authenticated) {
			router.replace(returnPath);
		}
	}, [auth, returnPath, router]);

	async function start() {
		setStarting(true);
		setError(null);

		try {
			await signInWithGithub(returnPath);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : SIGN_IN_FAILED_MESSAGE);
			setStarting(false);
		}
	}

	return (
		<main className="grid min-h-screen place-items-center bg-background px-4 py-10">
			<div className="w-full max-w-sm">
				<BrandMark />
				<section aria-labelledby="sign-in-heading" className="mt-6 rounded-lg border border-rule bg-card p-5">
					<h1 id="sign-in-heading" className="text-lg font-bold">Sign in with GitHub</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						Sketchflow saves your sketches and notes as commits to a repository you own. GitHub asks once
						for access to your repositories, and you can withdraw it from your GitHub settings at any time.
					</p>

					{error ? (
						<p role="alert" className="mt-4 flex items-start gap-2 text-sm text-foreground">
							<StateGlyph state="error" />
							<span>{error}</span>
						</p>
					) : null}

					<Button className="mt-5 w-full" size="lg" disabled={starting} onClick={() => void start()}>
						{starting ? <Loader2 className="animate-spin" /> : null}
						{starting ? "Opening GitHub" : "Continue with GitHub"}
						{starting ? null : <ArrowRight />}
					</Button>
				</section>
				<p className="mt-4 text-[0.8125rem] text-muted-foreground">
					<Link href="/help#privacy" className="text-primary underline">What Sketchflow stores</Link>
				</p>
			</div>
		</main>
	);
}
