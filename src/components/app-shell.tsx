"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useStackApp } from "@stackframe/stack";
import { useSWRConfig } from "swr";
import {
  Boxes,
  Clock3,
  FileText,
  Folder,
  GitBranch,
  Globe,
  LayoutDashboard,
  LogOut,
  Plus,
  Search,
  Settings,
} from "lucide-react";
import type { ReactNode } from "react";

import { BrandMark } from "@/components/brand-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";
import { clearStoredGithubToken } from "@/lib/github-token";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarInset,
  SidebarTrigger,
  SidebarSeparator,
  SidebarFooter,
} from "@/components/ui/sidebar";
import type { Workspace } from "@/lib/api";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Projects", href: "/app", icon: Folder },
  { label: "Workspace", href: "/app/workspace", icon: LayoutDashboard },
  { label: "Recent", href: "/app/recent", icon: Clock3 },
  { label: "Docs", href: "/app/docs", icon: FileText },
  { label: "Public", href: "/app/public", icon: Globe },
  { label: "Templates", href: "/app/templates", icon: Boxes },
  { label: "Help", href: "/help", icon: FileText },
];

const CREATE_WORKSPACE_VALUE = "__create_workspace__";

function AppSidebar({
  workspaces = [],
  selectedWorkspaceId,
  onWorkspaceChange,
}: {
  workspaces?: Workspace[];
  selectedWorkspaceId?: string | null;
  onWorkspaceChange?: (workspaceId: string) => void;
}) {
  const pathname = usePathname();
  const router = useRouter();

  function handleWorkspaceValue(value: string) {
    if (value === CREATE_WORKSPACE_VALUE) {
      router.push("/app/workspace?new=1");
      return;
    }

    onWorkspaceChange?.(value);
  }

  return (
    <Sidebar collapsible="icon" className="border-r-2 border-sidebar-border">
      <SidebarHeader className="p-3">
        <BrandMark
          href="/app"
          subtitle="GitHub-native canvas"
          collapseText
          className="group-data-[collapsible=icon]:justify-center"
        />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel className="font-extrabold uppercase tracking-[0.8px] text-sidebar-foreground/60">
            Workspace
          </SidebarGroupLabel>
          <SidebarGroupContent>
            {workspaces.length > 0 && selectedWorkspaceId && onWorkspaceChange ? (
              <Select value={selectedWorkspaceId} onValueChange={handleWorkspaceValue}>
                <SelectTrigger className="h-10 w-full rounded-xl border-2 bg-sidebar px-2 text-xs font-bold">
                  <SelectValue placeholder="Select workspace" />
                </SelectTrigger>
                <SelectContent>
                  {workspaces.map((workspace) => (
                    <SelectItem key={workspace.id} value={workspace.id}>
                      {workspace.repoOwner}/{workspace.repoName}
                    </SelectItem>
                  ))}
                  <SelectSeparator />
                  <SelectItem value={CREATE_WORKSPACE_VALUE}>
                    <Plus className="size-3.5" />
                    New workspace
                  </SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Button variant="outline" size="sm" className="w-full justify-start rounded-xl" asChild>
                <Link href="/app/workspace?new=1">
                  <Plus className="size-4" />
                  New workspace
                </Link>
              </Button>
            )}
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator className="mx-2 w-auto" />

        <SidebarGroup>
          <SidebarGroupLabel className="font-extrabold uppercase tracking-[0.8px] text-sidebar-foreground/60">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.label}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex h-9 w-full items-center gap-2.5 rounded-xl px-2.5 text-sm font-bold text-sidebar-foreground/70 transition-colors duration-150 hover:bg-sidebar-accent hover:text-[#58CC02] group-data-[collapsible=icon]:size-9 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0",
                      pathname === item.href && "bg-sidebar-accent text-[#58CC02]",
                    )}
                    title={item.label}
                  >
                    <item.icon className="size-4" />
                    <span className="truncate group-data-[collapsible=icon]:hidden">{item.label}</span>
                  </Link>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

      </SidebarContent>

      <SidebarFooter className="p-3 border-t-2 border-sidebar-border">
        <div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-2">
          <Button variant="ghost" size="icon" className="size-8 shrink-0 text-sidebar-foreground/60 hover:text-[#58CC02]" asChild>
            <Link href="https://github.com/SH20RAJ/sketch-flow" target="_blank" aria-label="Contribute on GitHub">
              <GitBranch className="size-4" />
            </Link>
          </Button>
          <div className="flex-1 group-data-[collapsible=icon]:hidden" />
          <SidebarTrigger className="group-data-[collapsible=icon]:hidden" />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

export function AppShell({
  children,
  title,
  subtitle,
  syncLabel,
  action,
  workspaces,
  selectedWorkspaceId,
  onWorkspaceChange,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search sketches, docs, commits",
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  syncLabel?: string;
  action?: ReactNode;
  workspaces?: Workspace[];
  selectedWorkspaceId?: string | null;
  onWorkspaceChange?: (workspaceId: string) => void;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
}) {
  const app = useStackApp();
  const { mutate } = useSWRConfig();

  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar
        workspaces={workspaces}
        selectedWorkspaceId={selectedWorkspaceId}
        onWorkspaceChange={onWorkspaceChange}
      />
      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b-2 border-border bg-background/95 px-4 backdrop-blur sm:px-6">
          <SidebarTrigger className="-ml-1 text-muted-foreground" />
          <div className="flex flex-1 items-center justify-between gap-4">
            <div className="min-w-0">
              <h1 className="truncate text-lg font-extrabold text-foreground">{title}</h1>
              {subtitle ? (
                <p className="truncate text-sm font-semibold text-muted-foreground">{subtitle}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <div className="relative hidden h-9 w-64 items-center md:flex">
                <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/50" />
                <Input
                  placeholder={searchPlaceholder}
                  value={searchValue ?? ""}
                  onChange={(event) => onSearchChange?.(event.target.value)}
                  disabled={!onSearchChange}
                  className="h-9 w-full rounded-[14px] pl-8 text-sm font-bold placeholder:text-muted-foreground/50"
                />
              </div>
              <ThemeToggle />
              {syncLabel ? (
                <Badge variant="secondary" className="gap-1.5 text-xs font-extrabold">
                  <GitBranch className="size-3" />
                  {syncLabel}
                </Badge>
              ) : null}
              {action}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void app.redirectToAccountSettings()}
                aria-label="Account settings"
                className="text-muted-foreground hover:text-[#1CB0F6] hover:bg-[#EEF9FF] dark:hover:bg-[#1A3A4A]"
              >
                <Settings className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (typeof window !== "undefined" && window.localStorage) {
                    window.localStorage.removeItem("sketchflow:active-user-id");
                  }
                  clearStoredGithubToken();
                  void mutate(() => true, undefined, { revalidate: false }).then(() => {
                    void app.signOut({ redirectUrl: "/" });
                  });
                }}
                aria-label="Sign out"
                className="text-muted-foreground hover:text-[#FF4B4B] hover:bg-[#FFF0F0] dark:hover:bg-[#3A2020]"
              >
                <LogOut className="size-4" />
              </Button>
            </div>
          </div>
        </header>
        <main className="flex-1 px-4 py-5 sm:px-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
