import { Suspense } from "react";

import { StackAuthHandler } from "@/components/stack-auth-handler";

export default function Handler() {
	return (
		<Suspense fallback={<StackAuthFallback />}>
			<div className="flex min-h-screen items-center justify-center bg-background px-4">
				<StackAuthHandler />
			</div>
		</Suspense>
	);
}

function StackAuthFallback() {
	return <div className="min-h-screen bg-background" />;
}
