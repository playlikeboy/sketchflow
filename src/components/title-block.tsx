import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The title block from the corner of a survey sheet: a ruled set of label/value pairs that
 * says where a piece of work lives and what state it is in.
 */
export function TitleBlock({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-[auto_minmax(0,1fr)] overflow-hidden rounded-md border border-rule text-sm", className)}>
      {children}
    </dl>
  );
}

export function TitleBlockRow({
  label,
  children,
  mono = false,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="col-span-2 grid grid-cols-subgrid border-b border-rule last:border-b-0">
      <dt className="legend-label flex items-center border-r border-rule bg-muted px-2.5 py-1.5">{label}</dt>
      <dd className={cn("min-w-0 truncate px-2.5 py-1.5 text-foreground", mono && "datum")}>{children}</dd>
    </div>
  );
}
