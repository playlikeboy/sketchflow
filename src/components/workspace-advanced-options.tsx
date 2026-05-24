"use client";

import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export function WorkspaceAdvancedOptions({
  open,
  onOpenChange,
  isPrivate,
  onPrivateChange,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPrivate: boolean;
  onPrivateChange: (isPrivate: boolean) => void;
  className?: string;
}) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className={className}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="px-0 text-muted-foreground font-bold">
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
          Advanced
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="rounded-[16px] border-2 border-border bg-muted p-4 shadow-[0_2px_0_var(--border)]">
        <label className="flex items-start gap-3 font-bold">
          <Checkbox
            checked={isPrivate}
            onCheckedChange={(checked) => onPrivateChange(checked === true)}
            className="mt-0.5"
          />
          <span>
            <span className="block font-extrabold text-foreground">Create as a private repo</span>
            <span className="text-muted-foreground font-semibold">
              Use for internal diagrams. Secret scanning and access controls stay in GitHub.
            </span>
          </span>
        </label>
      </CollapsibleContent>
    </Collapsible>
  );
}
