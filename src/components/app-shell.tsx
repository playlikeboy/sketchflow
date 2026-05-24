"use client";

import Link from "next/link";
import { useStackApp } from "@stackframe/stack";
import {
  Bot,
  BookOpen,
  Boxes,
  Clock3,
  FileText,
  Folder,
  GitBranch,
  Globe,
  Image,
  LayoutDashboard,
  LogOut,
  Search,
  Settings,
  Share2,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";

import { BrandMark } from "@/components/brand-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Select,
  SelectContent,
  SelectItem,
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

const navItems = [
  { label: "Workspace", href: "/app", icon: LayoutDashboard },
  { label: "Projects", href: "/app#projects", icon: Folder },
  { label: "Recent", href: "/app#recent", icon: Clock3 },
  { label: "Docs", href: "/app#docs", icon: FileText },
  { label: "Public", href: "/app#public", icon: Globe },
  { label: "Templates", href: "/app#templates", icon: Boxes },
];

const futureItems = [
  { label: "Collab", icon: Users },
  { label: "AI", icon: Bot },
  { label: "Exports", icon: Image },
  { label: "Share", icon: Share2 },
  { label: "Notes", icon: BookOpen },
];

function AppSidebar({
  workspaces = [],
  selectedWorkspaceId,
  onWorkspaceChange,
}: {
  workspaces?: Workspace[];
  selectedWorkspaceId?: string | null;
  onWorkspaceChange?: (workspaceId: string) => void;
}) {
  return (
    <Sidebar collapsible="icon" className="border-r-2 border-sidebar-border">
      <SidebarHeader className="p-3">
        <BrandMark
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
              <Select value={selectedWorkspaceId} onValueChange={onWorkspaceChange}>
                <SelectTrigger className="h-10 w-full rounded-xl border-2 bg-sidebar px-2 text-xs font-bold">
                  <SelectValue placeholder="Select workspace" />
                </SelectTrigger>
                <SelectContent>
                  {workspaces.map((workspace) => (
                    <SelectItem key={workspace.id} value={workspace.id}>
                      {workspace.repoOwner}/{workspace.repoName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="rounded-xl border-2 border-sidebar-border px-2 py-2 text-xs font-bold text-sidebar-foreground/50">
                Connect a GitHub repo to create your first workspace.
              </div>
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
                    className="flex h-9 w-full items-center gap-2.5 rounded-xl px-2.5 text-sm font-bold text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-[#58CC02] group-data-[collapsible=icon]:size-9 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 transition-colors duration-150"
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

        <SidebarSeparator className="mx-2 w-auto" />

        <SidebarGroup>
          <SidebarGroupLabel className="font-extrabold uppercase tracking-[0.8px] text-sidebar-foreground/60">
            Coming next
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <div className="grid grid-cols-2 gap-1.5 px-1 group-data-[collapsible=icon]:hidden">
              {futureItems.map((item) => (
                <div
                  key={item.label}
                  className="flex h-7 items-center gap-1.5 rounded-xl border-2 border-sidebar-border bg-sidebar px-2 text-xs font-bold text-sidebar-foreground/50 shadow-[0_1px_0_#E5E5E5] dark:shadow-[0_1px_0_#333]"
                >
                  <item.icon className="size-3 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </div>
              ))}
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3 border-t-2 border-sidebar-border">
        <div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-2">
          <Button variant="ghost" size="icon" className="size-8 shrink-0 text-sidebar-foreground/60 hover:text-[#58CC02]" asChild>
            <Link href="/" aria-label="Home">
              <LayoutDashboard className="size-4" />
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
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  syncLabel?: string;
  action?: ReactNode;
  workspaces?: Workspace[];
  selectedWorkspaceId?: string | null;
  onWorkspaceChange?: (workspaceId: string) => void;
}) {
  const app = useStackApp();

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
              <h1 className="truncate text-lg font-extrabold tracking-[-0.02em] text-foreground">{title}</h1>
              {subtitle ? (
                <p className="truncate text-sm font-semibold text-muted-foreground">{subtitle}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <div className="relative hidden h-9 w-64 items-center md:flex">
                <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/50" />
                <Input
                  placeholder="Search sketches, docs, commits"
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
                onClick={() => void app.signOut({ redirectUrl: "/" })}
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
