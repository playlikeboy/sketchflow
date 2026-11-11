"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useStackApp } from "@stackframe/stack";
import { useSWRConfig } from "swr";
import {
  CircleHelp,
  CircleUser,
  Clock3,
  FileText,
  Folder,
  GitBranch,
  Globe,
  LayoutTemplate,
  LogOut,
  Plus,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { type ReactNode, useState, useEffect } from "react";
import {
  getLocalProjects,
  hasAnyLocalProjects,
  getOfflineModeSetting,
  setOfflineModeSetting,
  purgeUserCache,
} from "@/lib/indexeddb";
import {
  startSyncManager,
  triggerSyncNow,
  getSyncFailureCount,
  retryFailedSyncActions,
  clearSyncQueueForUser,
  onSyncQueueChange,
} from "@/lib/sync-manager";
import { useAuthMe } from "@/lib/swr-hooks";

import { BrandMark } from "@/components/brand-mark";
import { StateGlyph, StateMark } from "@/components/state-mark";
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
  SidebarFooter,
} from "@/components/ui/sidebar";
import type { Workspace } from "@/lib/api";
import { cn } from "@/lib/utils";

const navGroups = [
  {
    label: "Work",
    items: [
      { label: "Projects", href: "/app", icon: Folder },
      { label: "Recent", href: "/app/recent", icon: Clock3 },
      { label: "Notes", href: "/app/docs", icon: FileText },
      { label: "Shared", href: "/app/public", icon: Globe },
    ],
  },
  {
    label: "Set up",
    items: [
      { label: "Workspaces", href: "/app/workspace", icon: SlidersHorizontal },
      { label: "Templates", href: "/app/templates", icon: LayoutTemplate },
      { label: "Help", href: "/help", icon: CircleHelp },
    ],
  },
];

const CREATE_WORKSPACE_VALUE = "__create_workspace__";

function AppSidebar({
  workspaces = [],
  selectedWorkspaceId,
  onWorkspaceChange,
  userId,
}: {
  workspaces?: Workspace[];
  selectedWorkspaceId?: string | null;
  onWorkspaceChange?: (workspaceId: string) => void;
  userId?: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [hasUnsynced, setHasUnsynced] = useState(false);

  useEffect(() => {
    let active = true;
    function check() {
      hasAnyLocalProjects(userId).then((val) => {
        if (active) setHasUnsynced(val);
      }).catch(() => {});
    }
    check();
    const interval = setInterval(check, 3000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [pathname, userId]);

  function handleWorkspaceValue(value: string) {
    if (value === CREATE_WORKSPACE_VALUE) {
      router.push("/app/workspace?new=1");
      return;
    }

    onWorkspaceChange?.(value);
  }

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="h-12 justify-center border-b border-sidebar-border px-3 py-0">
        <BrandMark href="/app" collapseText className="group-data-[collapsible=icon]:justify-center" />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel className="legend-label h-7 px-1">Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            {workspaces.length > 0 && selectedWorkspaceId && onWorkspaceChange ? (
              <Select value={selectedWorkspaceId} onValueChange={handleWorkspaceValue}>
                <SelectTrigger className="datum h-9 w-full rounded-md border-input bg-card px-2.5" aria-label="Switch workspace">
                  <SelectValue placeholder="Select workspace" />
                </SelectTrigger>
                <SelectContent>
                  {workspaces.map((workspace) => (
                    <SelectItem key={workspace.id} value={workspace.id} className="datum">
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
              <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                <Link href="/app/workspace?new=1">
                  <Plus />
                  New workspace
                </Link>
              </Button>
            )}
          </SidebarGroupContent>
        </SidebarGroup>

        {navGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="legend-label h-7 px-1">{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {group.items.map((item) => {
                  const current = pathname === item.href;
                  return (
                    <SidebarMenuItem key={item.label}>
                      <Link
                        href={item.href}
                        aria-current={current ? "page" : undefined}
                        title={item.label}
                        className={cn(
                          "relative flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0",
                          current && "bg-card font-semibold text-foreground shadow-[inset_0_0_0_1px_var(--rule)]",
                        )}
                      >
                        <item.icon className={cn("size-4 shrink-0", current && "text-grid")} />
                        <span className="truncate group-data-[collapsible=icon]:hidden">{item.label}</span>
                        {item.label === "Projects" && hasUnsynced ? (
                          <span
                            className="ml-auto group-data-[collapsible=icon]:absolute group-data-[collapsible=icon]:top-0.5 group-data-[collapsible=icon]:right-0.5"
                            title="Some projects exist only in this browser"
                          >
                            <StateGlyph state="local" />
                            <span className="sr-only">Some projects exist only in this browser</span>
                          </span>
                        ) : null}
                      </Link>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-2">
        <div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link href="https://github.com/playlikeboy/sketchflow" target="_blank" rel="noopener noreferrer" aria-label="Sketchflow source on GitHub" title="Source on GitHub">
              <GitBranch />
            </Link>
          </Button>
          <ThemeToggle />
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
  const { data: auth } = useAuthMe();
  const userId = auth?.user?.id;

  const [hasWorkspaceUnsynced, setHasWorkspaceUnsynced] = useState(false);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [syncFailures, setSyncFailures] = useState(0);

  useEffect(() => {
    getOfflineModeSetting().then(setIsOfflineMode).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      setHasWorkspaceUnsynced(false);
      return;
    }
    const wsId = selectedWorkspaceId;
    let active = true;
    function check() {
      getLocalProjects(wsId, userId).then((projects) => {
        if (active) setHasWorkspaceUnsynced(projects.length > 0);
      }).catch(() => {});
    }
    check();
    const interval = setInterval(check, 3000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [selectedWorkspaceId, userId]);

  useEffect(() => {
    startSyncManager();

    let active = true;
    const refreshFailures = () => {
      void getSyncFailureCount().then((count) => {
        if (active) setSyncFailures(count);
      });
    };

    refreshFailures();
    const unsubscribe = onSyncQueueChange(refreshFailures);

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  async function toggleOfflineMode() {
    const next = !isOfflineMode;
    setIsOfflineMode(next);
    await setOfflineModeSetting(next);
    if (!next) {
      await triggerSyncNow();
    }
  }

  function signOut() {
    clearStoredGithubToken();
    if (userId) {
      void clearSyncQueueForUser(userId);
      void purgeUserCache(userId);
    }

    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.removeItem("sketchflow:active-user-id");
    }

    void mutate(() => true, undefined, { revalidate: false }).then(() => {
      void app.signOut({ redirectUrl: "/" });
    });
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar
        workspaces={workspaces}
        selectedWorkspaceId={selectedWorkspaceId}
        onWorkspaceChange={onWorkspaceChange}
        userId={userId}
      />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-20 flex h-12 items-center gap-3 border-b border-border bg-background px-3 sm:px-5">
          <SidebarTrigger className="-ml-1 text-muted-foreground" />
          <div className="flex min-w-0 items-baseline gap-2.5">
            <h1 className="truncate text-base font-bold text-foreground">{title}</h1>
            {subtitle ? <p className="datum hidden truncate text-muted-foreground sm:block">{subtitle}</p> : null}
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            {onSearchChange ? (
              <div className="relative hidden w-60 md:block">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  value={searchValue ?? ""}
                  onChange={(event) => onSearchChange(event.target.value)}
                  className="h-8 pl-8"
                />
              </div>
            ) : null}

            {syncFailures > 0 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void retryFailedSyncActions(userId ?? undefined)}
                className="border-destructive/40 text-destructive hover:bg-destructive/10"
                title="Retry the saves that failed"
              >
                <StateGlyph state="error" />
                Retry {syncFailures} failed {syncFailures === 1 ? "save" : "saves"}
              </Button>
            ) : hasWorkspaceUnsynced && !isOfflineMode ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void triggerSyncNow()}
                title="Some projects exist only in this browser. Sync them to GitHub now."
              >
                <StateGlyph state="local" />
                Sync local projects
              </Button>
            ) : syncLabel ? (
              <StateMark state="synced" label={syncLabel} className="datum hidden px-1.5 lg:inline-flex" />
            ) : null}

            <Button
              variant={isOfflineMode ? "outline" : "ghost"}
              size="sm"
              onClick={toggleOfflineMode}
              aria-pressed={isOfflineMode}
              className={cn(isOfflineMode && "bg-accent text-foreground")}
              title={
                isOfflineMode
                  ? "Sync is paused. Changes stay in this browser until you resume."
                  : "Changes sync to GitHub in the background. Click to pause."
              }
            >
              <StateGlyph state={isOfflineMode ? "offline" : "synced"} />
              <span className="hidden sm:inline">{isOfflineMode ? "Sync paused" : "Sync on"}</span>
            </Button>

            {action}

            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => void app.redirectToAccountSettings()}
              aria-label="Account settings"
              title="Account settings"
            >
              <CircleUser />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={signOut} aria-label="Sign out" title="Sign out">
              <LogOut />
            </Button>
          </div>
        </header>
        <main className="min-w-0 flex-1 px-3 py-5 sm:px-5">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
