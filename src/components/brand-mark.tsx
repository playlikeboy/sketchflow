"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";

export function BrandMark({
	href = "/",
	subtitle,
	compact = false,
	collapseText = false,
	className,
}: {
	href?: string;
	subtitle?: string | null;
	compact?: boolean;
	collapseText?: boolean;
	className?: string;
}) {
	return (
		<Link href={href} className={cn("flex min-w-0 items-center gap-3", className)}>
			<div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground shadow-xs">
				SF
			</div>
			{compact ? null : (
				<div className={cn("min-w-0", collapseText && "group-data-[collapsible=icon]:hidden")}>
					<div className="truncate text-sm font-semibold">Sketchflow</div>
					{subtitle ? (
						<div className="truncate text-xs text-muted-foreground">{subtitle}</div>
					) : null}
				</div>
			)}
		</Link>
	);
}
