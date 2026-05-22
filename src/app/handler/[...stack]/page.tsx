import { Suspense } from "react";

import { StackAuthHandler } from "@/components/stack-auth-handler";

export default function Handler() {
	return (
		<Suspense fallback={<StackAuthFallback />}>
			<div className="flex min-h-screen items-center justify-center bg-[#f7f5f0] px-4">
				<StackAuthHandler />
			</div>
		</Suspense>
	);
}

function StackAuthFallback() {
	return <div className="min-h-screen bg-[#f7f5f0]" />;
}
