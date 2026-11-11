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
        <Button variant="ghost" size="sm" className="-ml-2">
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
          More options
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 rounded-md border border-rule bg-muted p-3">
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <Checkbox
            checked={isPrivate}
            onCheckedChange={(checked) => onPrivateChange(checked === true)}
            className="mt-0.5"
          />
          <span>
            <span className="block font-semibold text-foreground">Create as a private repo</span>
            <span className="text-muted-foreground">
              Only people you give access to on GitHub can see it. Private workspaces have no share or embed pages.
            </span>
          </span>
        </label>
      </CollapsibleContent>
    </Collapsible>
  );
}
