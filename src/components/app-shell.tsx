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

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
  SidebarSeparator,
  SidebarFooter,
} from "@/components/ui/sidebar";

const navItems = [
  { label: "Workspace", href: "/app", icon: LayoutDashboard },
  { label: "Projects", href: "/app", icon: Folder },
  { label: "Recent", href: "/app", icon: Clock3 },
  { label: "Docs", href: "/app", icon: FileText },
  { label: "Public", href: "/app", icon: Globe },
  { label: "Templates", href: "/app", icon: Boxes },
];

const futureItems = [
  { label: "Collab", icon: Users },
  { label: "AI", icon: Bot },
  { label: "Exports", icon: Image },
  { label: "Share", icon: Share2 },
  { label: "Notes", icon: BookOpen },
];

function AppSidebar() {
  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="p-3">
        <Link href="/" className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground">
            SF
          </div>
          <div className="group-data-[collapsible=icon]:hidden">
            <div className="text-sm font-semibold">Sketchflow</div>
            <div className="text-xs text-sidebar-foreground/60">GitHub-native canvas</div>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.label}>
                  <SidebarMenuButton asChild tooltip={item.label}>
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>Coming next</SidebarGroupLabel>
          <SidebarGroupContent>
            <div className="grid grid-cols-2 gap-1.5 px-1 group-data-[collapsible=icon]:hidden">
              {futureItems.map((item) => (
                <div
                  key={item.label}
                  className="flex h-7 items-center gap-1.5 rounded-md border border-sidebar-border px-2 text-xs text-sidebar-foreground/60"
                >
                  <item.icon className="size-3 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </div>
              ))}
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3 border-t border-sidebar-border">
        <div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-2">
          <Button variant="ghost" size="icon" className="size-8 shrink-0" asChild>
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
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  syncLabel?: string;
  action?: ReactNode;
}) {
  const app = useStackApp();

  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-border bg-background/95 px-4 backdrop-blur sm:px-6">
          <SidebarTrigger className="-ml-1" />
          <div className="flex flex-1 items-center justify-between gap-4">
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold">{title}</h1>
              {subtitle ? (
                <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <div className="relative hidden h-8 w-64 items-center md:flex">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search sketches, docs, commits"
                  className="h-8 w-full rounded-lg pl-8 text-xs"
                />
              </div>
              {syncLabel ? (
                <Badge variant="secondary" className="gap-1.5 text-xs font-normal">
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
              >
                <Settings className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void app.signOut({ redirectUrl: "/" })}
                aria-label="Sign out"
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
