import type { Metadata } from "next";

import { TryClient } from "@/components/try-client";

export const metadata: Metadata = {
	title: "Try it",
	description: "Draw and write in Sketchflow without an account. Your sketch stays in this browser.",
};

export default function TryPage() {
	return <TryClient />;
}
