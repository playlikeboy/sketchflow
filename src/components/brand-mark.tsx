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
    <Link href={href} className={cn("flex min-w-0 items-center gap-3 group", className)}>
      <div className="grid size-10 shrink-0 place-items-center rounded-[14px] bg-[#58CC02] text-sm font-extrabold text-white shadow-[0_4px_0_#46A302] transition-all duration-100 group-hover:brightness-105 group-active:translate-y-[4px] group-active:shadow-none">
        <span>SF</span>
      </div>
      {compact ? null : (
        <div className={cn("min-w-0", collapseText && "group-data-[collapsible=icon]:hidden")}>
          <div className="truncate text-[17px] font-extrabold text-[#4B4B4B]">
            Sketchflow
          </div>
          {subtitle ? (
            <div className="truncate text-xs font-medium text-[#777777]">{subtitle}</div>
          ) : null}
        </div>
      )}
    </Link>
  );
}
