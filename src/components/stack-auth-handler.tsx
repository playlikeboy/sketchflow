"use client";

import dynamic from "next/dynamic";

const StackHandler = dynamic(async () => (await import("@stackframe/stack")).StackHandler, {
	ssr: false,
	loading: () => <div className="min-h-screen bg-[#f7f5f0]" />,
});

export function StackAuthHandler() {
	return <StackHandler fullPage={false} />;
}
