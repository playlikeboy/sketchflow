"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSWRConfig } from "swr";
import {
  CircleHelp,
  Cloud,
  CloudOff,
  CircleUser,
  Clock3,
  FileText,
  Folder,
  GitBranch,
  Globe,
  LayoutTemplate,
  Loader2,
  LogIn,
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
import { useAppIdentity } from "@/lib/use-app-identity";
import { isLocalWorkspace, workspaceLabel } from "@/lib/local-workspace";
import { signInPath } from "@/lib/return-path";

import { BrandMark } from "@/components/brand-mark";
import { StateGlyph, StateMark } from "@/components/state-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";
import { signOut as endSession } from "@/lib/auth-client";
import { GITHUB_ACCESS_SETTINGS_URL, clearStoredGithubToken } from "@/lib/github-token";
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
const UNSYNCED_POLL_MS = 3000;
const PERSIST_REQUESTED_KEY = "sketchflow:storage-persist-requested";

/**
 * Asks the browser, once per session, to keep this site's storage when space runs low, so
 * projects that exist only on this device are less likely to be evicted. Failures are fine:
 * the request is advisory and some browsers decide on their own.
 */
function requestPersistentStorageOnce() {
  try {
    if (window.sessionStorage?.getItem(PERSIST_REQUESTED_KEY)) return;
    window.sessionStorage?.setItem(PERSIST_REQUESTED_KEY, "1");
  } catch {
    // Storage can be blocked; still try once for this page load.
  }
  void navigator.storage?.persist?.().catch(() => {});
}

/** Polls `check` while mounted. `check` resolves to the latest value or rejects (ignored). */
function usePolledFlag(check: (() => Promise<boolean>) | null, deps: unknown[]) {
  const [value, setValue] = useState(false);

  useEffect(() => {
    if (!check) {
      setValue(false);
      return;
    }
    let active = true;
    const run = () => {
      check().then((next) => {
        if (active) setValue(next);
      }).catch(() => {});
    };
    run();
    const interval = setInterval(run, UNSYNCED_POLL_MS);
    return () => {
      active = false;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `check` is rebuilt every render; deps name its inputs.
  }, deps);

  return value;
}

function WorkspaceSwitcher({
  workspaces,
  selectedWorkspaceId,
  onWorkspaceChange,
  isSignedIn,
}: {
  workspaces: Workspace[];
  selectedWorkspaceId?: string | null;
  onWorkspaceChange?: (workspaceId: string) => void;
  isSignedIn: boolean;
}) {
  const router = useRouter();
  const createLabel = isSignedIn ? "New workspace" : "Connect GitHub";
  const createHref = isSignedIn ? "/app/workspace?new=1" : "/app/workspace";

  function handleWorkspaceValue(value: string) {
    if (value === CREATE_WORKSPACE_VALUE) {
      router.push(createHref);
      return;
    }
    onWorkspaceChange?.(value);
  }

  if (workspaces.length === 0 || !selectedWorkspaceId || !onWorkspaceChange) {
    return (
      <Button variant="outline" size="sm" className="w-full justify-start" asChild>
        <Link href={createHref}>
          <Plus />
          {createLabel}
        </Link>
      </Button>
    );
  }

  return (
    <Select value={selectedWorkspaceId} onValueChange={handleWorkspaceValue}>
      <SelectTrigger className="datum h-9 w-full min-w-0 rounded-md border-input bg-card px-2.5 *:data-[slot=select-value]:block *:data-[slot=select-value]:min-w-0 *:data-[slot=select-value]:truncate" aria-label="Switch workspace">
        <SelectValue placeholder="Select workspace" />
      </SelectTrigger>
      <SelectContent>
        {workspaces.map((workspace) => (
          <SelectItem key={workspace.id} value={workspace.id} className={isLocalWorkspace(workspace.id) ? undefined : "datum"}>
            {workspaceLabel(workspace)}
          </SelectItem>
        ))}
        <SelectSeparator />
        <SelectItem value={CREATE_WORKSPACE_VALUE}>
          <Plus className="size-3.5" />
          {createLabel}
        </SelectItem>
      </SelectContent>
    </Select>
  );
}

function AppSidebar({
  workspaces = [],
  selectedWorkspaceId,
  onWorkspaceChange,
  userId,
  isSignedIn,
}: {
  workspaces?: Workspace[];
  selectedWorkspaceId?: string | null;
  onWorkspaceChange?: (workspaceId: string) => void;
  userId?: string | null;
  isSignedIn: boolean;
}) {
  const pathname = usePathname();
  // For a signed-in user, flags repository projects that have not reached GitHub yet. A guest's
  // projects are all on this device by design, so there is nothing to flag.
  const hasUnsynced = usePolledFlag(
    isSignedIn && userId ? () => hasAnyLocalProjects(userId) : null,
    [pathname, userId, isSignedIn],
  );

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="h-12 justify-center border-b border-sidebar-border px-3 py-0">
        <BrandMark href="/app" collapseText className="group-data-[collapsible=icon]:justify-center" />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel className="legend-label h-7 px-1">Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <WorkspaceSwitcher
              workspaces={workspaces}
              selectedWorkspaceId={selectedWorkspaceId}
              onWorkspaceChange={onWorkspaceChange}
              isSignedIn={isSignedIn}
            />
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

/** Sync status, retry and pause controls. Only meaningful for a repository workspace. */
function RepositorySyncControls({
  workspaceId,
  userId,
  syncLabel,
  githubUnreachable,
}: {
  workspaceId: string | null;
  userId: string | null;
  syncLabel?: string;
  githubUnreachable: boolean;
}) {
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [syncFailures, setSyncFailures] = useState(0);
  const hasWorkspaceUnsynced = usePolledFlag(
    workspaceId ? () => getLocalProjects(workspaceId, userId).then((projects) => projects.length > 0) : null,
    [workspaceId, userId],
  );

  useEffect(() => {
    getOfflineModeSetting().then(setIsOfflineMode).catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    const refreshFailures = () => {
      void getSyncFailureCount().then((count) => {
        if (active) setSyncFailures(count);
      }).catch(() => {});
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

  return (
    <>
      {githubUnreachable ? (
        <StateMark state="error" label="GitHub unreachable" className="px-1.5" />
      ) : syncFailures > 0 ? (
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
        onClick={() => void toggleOfflineMode()}
        aria-pressed={isOfflineMode}
        className={cn(isOfflineMode && "bg-accent text-foreground")}
        title={
          isOfflineMode
            ? "Sync is paused. Changes stay in this browser until you resume."
            : "Changes sync to GitHub in the background. Click to pause."
        }
      >
        {isOfflineMode ? <CloudOff /> : <Cloud />}
        <span className="hidden sm:inline">{isOfflineMode ? "Sync paused" : "Sync on"}</span>
      </Button>
    </>
  );
}

/** Sign-out for a signed-in user: GitHub access settings and the sign-out button. */
function SignedInControls({ userId }: { userId: string | null }) {
  const { mutate } = useSWRConfig();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError(null);

    // End the session first. If that fails the user is still signed in, so their unsynced
    // drafts and queued saves must stay where they are.
    try {
      await endSession();
    } catch (error) {
      setSignOutError(error instanceof Error ? error.message : "Sign-out did not finish. Try again.");
      setSigningOut(false);
      return;
    }

    clearStoredGithubToken();
    window.localStorage?.removeItem("sketchflow:active-user-id");
    // Only the signed-in user's scope is purged. Guest projects ("local" scope) stay on this device.
    if (userId) {
      await Promise.allSettled([clearSyncQueueForUser(userId), purgeUserCache(userId)]);
    }
    await mutate(() => true, undefined, { revalidate: false });
    window.location.assign("/");
  }

  return (
    <>
      <Button variant="ghost" size="icon-sm" asChild>
        <a
          href={GITHUB_ACCESS_SETTINGS_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Manage GitHub access (opens GitHub)"
          title="Manage GitHub access"
        >
          <CircleUser />
        </a>
      </Button>
      {signOutError ? (
        <span role="alert" className="hidden max-w-48 truncate text-xs text-destructive sm:inline" title={signOutError}>
          {signOutError}
        </span>
      ) : null}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => void signOut()}
        disabled={signingOut}
        aria-label={signOutError ? `Sign out. ${signOutError}` : "Sign out"}
        title={signOutError ?? "Sign out"}
      >
        {signingOut ? <Loader2 className="animate-spin" /> : <LogOut />}
      </Button>
    </>
  );
}

/** Sign-in for a guest. Returns to the current page afterwards. */
function SignInLink() {
  const pathname = usePathname();
  const [returnPath, setReturnPath] = useState<string | null>(null);

  useEffect(() => {
    setReturnPath(`${window.location.pathname}${window.location.search}`);
  }, [pathname]);

  return (
    <Button variant="outline" size="sm" asChild>
      <Link href={signInPath(returnPath ?? pathname)} title="Sign in with GitHub to back up and share projects">
        <LogIn />
        Sign in with GitHub
      </Link>
    </Button>
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
  githubUnreachable = false,
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
  /** Set when the page knows GitHub cannot be reached, so the bar never claims work is synced. */
  githubUnreachable?: boolean;
}) {
  const { isSignedIn, isLoading: identityLoading, userId } = useAppIdentity();
  const showRepositorySync = isSignedIn && !isLocalWorkspace(selectedWorkspaceId);

  useEffect(() => {
    requestPersistentStorageOnce();
  }, []);

  // Queued repository saves need a session; a guest has nothing to send to GitHub.
  useEffect(() => {
    if (isSignedIn) startSyncManager();
  }, [isSignedIn]);

  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar
        workspaces={workspaces}
        selectedWorkspaceId={selectedWorkspaceId}
        onWorkspaceChange={onWorkspaceChange}
        userId={userId}
        isSignedIn={isSignedIn}
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

            {showRepositorySync ? (
              <RepositorySyncControls
                workspaceId={selectedWorkspaceId ?? null}
                userId={userId}
                syncLabel={syncLabel}
                githubUnreachable={githubUnreachable}
              />
            ) : (
              <StateMark state="local" label="On this device" className="px-1.5" />
            )}

            {action}

            {isSignedIn ? <SignedInControls userId={userId} /> : identityLoading ? null : <SignInLink />}
          </div>
        </header>
        <main className="min-w-0 flex-1 px-3 py-5 sm:px-5">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
