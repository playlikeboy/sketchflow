import Link from "next/link";

import { cn } from "@/lib/utils";

/** The Sketchflow mark: a surveyed sheet with two contour lines and a benchmark. */
export function SheetMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={cn("size-7 shrink-0", className)}>
      <rect x="1.5" y="1.5" width="29" height="29" rx="5" className="fill-card stroke-foreground" strokeWidth="1.5" />
      <path d="M6 20.5c4-7 8 2 12-5s6-4 8-8" className="stroke-water" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M6 26c5-6 9 1 13-5s5-3 7-6" className="stroke-wood" strokeWidth="1.75" strokeLinecap="round" />
      <circle cx="9.5" cy="9.5" r="2.5" className="fill-grid" />
    </svg>
  );
}

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
    <Link href={href} className={cn("flex min-w-0 items-center gap-2.5 rounded-md", className)}>
      <SheetMark />
      {compact ? null : (
        <span className={cn("min-w-0", collapseText && "group-data-[collapsible=icon]:hidden")}>
          <span className="block truncate text-base leading-tight font-bold tracking-tight text-foreground">Sketchflow</span>
          {subtitle ? (
            <span className="block truncate text-xs leading-tight text-muted-foreground">{subtitle}</span>
          ) : null}
        </span>
      )}
    </Link>
  );
}
