import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
	title: "Page not found",
	robots: { index: false, follow: false },
};

export default function NotFound() {
	return (
		<div className="flex min-h-screen flex-col bg-background">
			<header className="border-b border-border">
				<div className="mx-auto flex h-14 max-w-6xl items-center px-4 sm:px-6">
					<BrandMark />
				</div>
			</header>
			<main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-4 py-16 sm:px-6">
				<p className="datum text-muted-foreground">404</p>
				<h1 className="mt-2 text-3xl font-extrabold tracking-[-0.02em] sm:text-4xl">This page is not on the map</h1>
				<p className="mt-3 max-w-xl text-muted-foreground">
					The address may be mistyped, or the project was moved or deleted. Projects you made without an account
					live in the browser they were made in, so a link to one only opens there.
				</p>
				<div className="mt-6 flex flex-wrap items-center gap-2">
					<Button asChild>
						<Link href="/app">
							Open your projects
							<ArrowRight />
						</Link>
					</Button>
					<Button variant="outline" asChild>
						<Link href="/help">Help</Link>
					</Button>
				</div>
			</main>
		</div>
	);
}
