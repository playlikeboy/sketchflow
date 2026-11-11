import { cn } from "@/lib/utils";

/**
 * Legend symbols for where a piece of work lives. The shape carries the meaning as well as
 * the ink, so the state reads without colour:
 *   synced  filled disc      committed to GitHub
 *   draft   half-filled disc unsaved changes in this browser
 *   local   ring             exists only in this browser
 *   offline ring with a bar  sync is paused
 *   error   filled square    the last sync failed
 */
export type WorkState = "synced" | "draft" | "local" | "offline" | "error";

const stateInk: Record<WorkState, string> = {
  synced: "text-wood",
  draft: "text-contour",
  local: "text-muted-foreground",
  offline: "text-muted-foreground",
  error: "text-destructive",
};

export const stateLabel: Record<WorkState, string> = {
  synced: "Synced",
  draft: "Unsaved draft",
  local: "Local only",
  offline: "Sync paused",
  error: "Sync failed",
};

export function StateGlyph({ state, className }: { state: WorkState; className?: string }) {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" className={cn("size-3 shrink-0", stateInk[state], className)}>
      {state === "synced" ? <circle cx="6" cy="6" r="5" fill="currentColor" /> : null}
      {state === "draft" ? (
        <>
          <circle cx="6" cy="6" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M6 1.75a4.25 4.25 0 0 0 0 8.5z" fill="currentColor" />
        </>
      ) : null}
      {state === "local" ? <circle cx="6" cy="6" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.5" /> : null}
      {state === "offline" ? (
        <>
          <circle cx="6" cy="6" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M3.5 6h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </>
      ) : null}
      {state === "error" ? <rect x="1.5" y="1.5" width="9" height="9" rx="1" fill="currentColor" /> : null}
    </svg>
  );
}

export function StateMark({
  state,
  label,
  className,
}: {
  state: WorkState;
  label?: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap", stateInk[state], className)}>
      <StateGlyph state={state} />
      <span>{label ?? stateLabel[state]}</span>
    </span>
  );
}
