"use client";

import dynamic from "next/dynamic";

const StackHandler = dynamic(async () => (await import("@stackframe/stack")).StackHandler, {
	ssr: false,
	loading: () => <div className="min-h-screen bg-background" />,
});

export function StackAuthHandler() {
	return <StackHandler fullPage={false} />;
}
