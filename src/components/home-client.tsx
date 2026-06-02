"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStackApp } from "@stackframe/stack";
import {
  ArrowRight,
  ExternalLink,
  GitBranch,
  GitCommit,
  GitFork,
  HardDrive,
  Layout,
  Loader2,
  PanelRight,
  PenTool,
  Plus,
  RefreshCw,
  ShieldCheck,
  Zap,
  Sparkles,
  Flame,
  Star,
  Moon,
  Sun,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";

import { BrandMark } from "@/components/brand-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WorkspaceAdvancedOptions } from "@/components/workspace-advanced-options";
import { bootstrapWorkspace, type GithubStatus } from "@/lib/api";
import { connectGithubAccount } from "@/lib/github-connect";
import { useAuthMe, useGithubStatus, useWorkspaces } from "@/lib/swr-hooks";
import { sketchHref } from "@/lib/workspace-routes";

type LoadState = "idle" | "loading" | "ready" | "error";

const APP_URL = "https://sketchflow.shraj.workers.dev";

const features = [
  {
    icon: PenTool,
    title: "Excalidraw canvas",
    description: "Full-featured sketching with autosave to IndexedDB and one-click GitHub commits.",
    color: "#58CC02",
    bgClass: "bg-[#EEF9EE] dark:bg-[#1A3A1A]",
  },
  {
    icon: GitFork,
    title: "Git-native storage",
    description: "Every sketch, doc, and export lives in your repo. Postgres stores only app metadata.",
    color: "#1CB0F6",
    bgClass: "bg-[#EEF9FF] dark:bg-[#1A3A4A]",
  },
  {
    icon: Layout,
    title: "Project workspaces",
    description: "Organize sketches and docs into projects. Each workspace maps to a GitHub repo.",
    color: "#CE82FF",
    bgClass: "bg-[#F8F0FF] dark:bg-[#2A1A3A]",
  },
  {
    icon: PanelRight,
    title: "Side-by-side docs",
    description: "Markdown notes live beside every sketch. Edit in-repo, rendered alongside your canvas.",
    color: "#FF9600",
    bgClass: "bg-[#FFF4E5] dark:bg-[#3A2A1A]",
  },
  {
    icon: GitCommit,
    title: "Snapshot commits",
    description: "Manual or debounced saves create tree-based multi-file commits. Every version is a commit.",
    color: "#FF4B4B",
    bgClass: "bg-[#FFF0F0] dark:bg-[#3A2020]",
  },
  {
    icon: HardDrive,
    title: "Offline drafts",
    description: "IndexedDB keeps local drafts so you never lose work. Switch between machines with a push.",
    color: "#FFC800",
    bgClass: "bg-[#FFFBE6] dark:bg-[#3A3A1A]",
  },
];

function connectionCopy(status: GithubStatus | null) {
  if (status?.connected) {
    return `Connected to ${status.github.login}`;
  }

  return "Connect GitHub to create a workspace repo.";
}

function friendlyError(message: string) {
  if (message.toLowerCase().includes("github")) {
    return "GitHub needs one more connection step. Reconnect and approve access to continue.";
  }

  return message;
}

function ProductPreview() {
  return (
    <div className="mx-auto mt-12 w-full max-w-5xl overflow-hidden rounded-[16px] bg-card shadow-[0_2px_0_var(--border)] border-2 border-border">
      <div className="flex h-11 items-center justify-between border-b border-border px-4 bg-muted">
        <div className="flex items-center gap-2 text-xs text-muted-foreground font-semibold">
          <span className="size-2.5 rounded-full bg-[#58CC02]" />
          GitHub workspace
        </div>
        <Badge variant="secondary" className="font-extrabold text-[11px]">
          Synced
        </Badge>
      </div>
      <div className="grid min-h-[340px] md:grid-cols-[220px_1fr_260px]">
        <aside className="border-b bg-muted p-4 md:border-r md:border-b-0 border-border">
          {["Projects", "Sketches", "Docs", "Public pages"].map((item, index) => (
            <div
              key={item}
              className={`mb-2 rounded-xl px-3 py-2 text-sm font-bold ${index === 0 ? "bg-card text-foreground shadow-[0_2px_0_var(--border)] border-2 border-border" : "text-muted-foreground"}`}
            >
              {item}
            </div>
          ))}
        </aside>
        <div className="relative min-h-[260px] bg-card p-6">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:32px_32px] opacity-20" />
          <div className="relative grid h-full place-items-center">
            <div className="grid gap-4">
              <div className="rounded-[16px] border-2 border-border bg-card px-5 py-3 text-sm font-extrabold text-foreground shadow-[0_2px_0_var(--border)]">
                Product flow
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-[14px] border-2 border-border bg-card px-4 py-3 text-xs font-bold text-muted-foreground shadow-[0_2px_0_var(--border)]">
                  PRD.md
                </div>
                <div className="rounded-[14px] border-2 border-border bg-card px-4 py-3 text-xs font-bold text-muted-foreground shadow-[0_2px_0_var(--border)]">
                  system-map.excalidraw.json
                </div>
              </div>
              <div className="mx-auto h-8 w-px bg-border" />
              <div className="rounded-[16px] border-2 border-border bg-card px-5 py-3 text-sm font-extrabold text-foreground shadow-[0_2px_0_var(--border)]">
                Commit snapshot
              </div>
            </div>
          </div>
        </div>
        <aside className="border-t bg-muted p-4 md:border-t-0 md:border-l border-border">
          <div className="mb-3 text-xs font-extrabold uppercase tracking-[0.8px] text-muted-foreground">
            Project memory
          </div>
          {["README.md", "notes.md", "exports/", "share.json"].map((item) => (
            <div key={item} className="mb-2 rounded-xl border-2 border-border bg-card px-3 py-2 font-mono text-xs font-bold text-foreground shadow-[0_2px_0_var(--border)]">
              {item}
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}

export function HomeClient() {
  const app = useStackApp();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repoName, setRepoName] = useState("sketchflow-workspace");
  const [isPrivate, setIsPrivate] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [connectingGithub, setConnectingGithub] = useState(false);
  const {
    data: auth,
    error: authError,
    isLoading: authLoading,
    mutate: mutateAuth,
  } = useAuthMe();
  const {
    data: workspaceData,
    error: workspacesError,
    mutate: mutateWorkspaces,
  } = useWorkspaces();
  const {
    data: githubStatus,
    error: githubError,
    mutate: mutateGithubStatus,
  } = useGithubStatus();

  useEffect(() => { setMounted(true); }, []);

  const workspaces = useMemo(() => workspaceData?.workspaces ?? [], [workspaceData]);
  const primaryWorkspace = useMemo(() => workspaces[0] ?? null, [workspaces]);
  const user = auth?.user ?? null;
  const githubConnected = githubStatus?.connected === true;
  const githubStatusCopy = githubStatus ?? null;
  const loadState: LoadState = authLoading
    ? "loading"
    : authError || workspacesError || githubError
      ? "error"
      : "ready";

  useEffect(() => {
    const nextError = authError || workspacesError || githubError;
    setError(nextError instanceof Error ? friendlyError(nextError.message) : null);
  }, [authError, githubError, workspacesError]);

  async function refreshHomeState() {
    setError(null);
    await Promise.all([mutateAuth(), mutateWorkspaces(), mutateGithubStatus()]);
  }

  useEffect(() => {
    if (primaryWorkspace) {
      router.prefetch("/app");
    }
  }, [primaryWorkspace, router]);

  async function handleBootstrap() {
    setBootstrapping(true);
    setError(null);

    try {
      const response = await bootstrapWorkspace({ repoName, private: isPrivate });
      await mutateWorkspaces();
      router.push(
        `/app/workspaces/${response.workspace.id}/projects/first-project/sketches/system-map`
      );
    } catch (bootstrapError) {
      setError(
        bootstrapError instanceof Error
          ? friendlyError(bootstrapError.message)
          : "Workspace creation did not finish"
      );
    } finally {
      setBootstrapping(false);
    }
  }

  async function handleConnectGithub() {
    setConnectingGithub(true);
    setError(null);

    try {
      await connectGithubAccount(app, githubStatusCopy?.scopes);
      const nextStatus = await mutateGithubStatus();

      if (!nextStatus?.connected) {
        setError("GitHub needs one more connection step. Reconnect and approve access to continue.");
      }
    } catch (connectError) {
      setError(
        connectError instanceof Error
          ? friendlyError(connectError.message)
          : "GitHub connection did not finish"
      );
    } finally {
      setConnectingGithub(false);
    }
  }

  if (loadState === "loading") {
    return <main className="min-h-screen bg-background" />;
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-background">
        {/* Decorative gradient header bar */}
        <div className="h-1 w-full bg-gradient-to-r from-[#58CC02] via-[#1CB0F6] to-[#CE82FF]" />

        {/* Nav */}
        <header className="border-b-2 border-border">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
            <BrandMark />
            <div className="flex items-center gap-2">
              <ThemeToggleButton mounted={mounted} theme={theme} setTheme={setTheme} />
              <Button variant="ghost" size="sm" onClick={() => void app.redirectToSignIn()}>
                Sign in
              </Button>
              <Button size="sm" onClick={() => void app.redirectToSignUp()}>
                Get started
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        </header>

        {/* Hero */}
        <section className="mx-auto max-w-6xl px-5 pt-20 pb-16 sm:px-8 sm:pt-28 sm:pb-20">
          <div className="mx-auto max-w-3xl text-center">
            <div className="duo-chip mb-6 inline-flex !bg-[#FFF4E5] dark:!bg-[#3A2A1A] !text-[#FF9600] font-extrabold">
              <Zap className="size-4" />
              GitHub-native visual workspace
            </div>
            <h1 className="text-5xl font-extrabold leading-[1.05] text-foreground sm:text-6xl">
              Sketchflow
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-muted-foreground font-semibold">
              A calm canvas for builders. Sketch system maps, keep docs beside the work,
              publish project pages, and store every artifact in your own GitHub repo.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button size="lg" onClick={() => void app.redirectToSignUp()}>
                <Plus className="size-4" />
                Create workspace
              </Button>
              <Button variant="outline" size="lg" asChild>
                <Link href={APP_URL} target="_blank">
                  <ExternalLink className="size-4" />
                  View live app
                </Link>
              </Button>
            </div>
          </div>
          <ProductPreview />
        </section>

        {/* Stats bar */}
        <section className="mx-auto max-w-6xl px-5 sm:px-8 -mt-6 mb-12">
          <div className="flex flex-wrap justify-center gap-8 text-center">
            {[
              { value: "100%", label: "GitHub-native" },
              { value: "0", label: "Vendor lock-in" },
              { value: "∞", label: "Version history" },
            ].map((stat) => (
              <div key={stat.label} className="flex items-center gap-2">
                <span className="text-2xl font-extrabold text-[#58CC02]">{stat.value}</span>
                <span className="text-sm font-bold text-muted-foreground">{stat.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Feature grid */}
        <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-8">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-extrabold text-foreground">Everything in your repo</h2>
            <p className="mt-2 text-base font-semibold text-muted-foreground">
              No vendor lock-in. Your data ships with your code.
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <Card key={feature.title} size="sm" className="group hover:border-[#58CC02] hover:shadow-[0_2px_0_#46A302] transition-all duration-200">
                  <CardHeader>
                    <div
                      className={`flex size-11 items-center justify-center rounded-[14px] mb-2 transition-all duration-200 ${feature.bgClass}`}
                      style={{ color: feature.color }}
                    >
                      <Icon className="size-5" />
                    </div>
                    <CardTitle>{feature.title}</CardTitle>
                    <CardDescription>{feature.description}</CardDescription>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        </section>

        {/* How it works */}
        <section className="border-t-2 border-border bg-muted">
          <div className="mx-auto max-w-6xl px-5 py-18 sm:px-8">
            <div className="mb-12 text-center">
              <h2 className="text-3xl font-extrabold text-foreground">How it works</h2>
              <p className="mt-2 text-base font-semibold text-muted-foreground">Three steps to a Git-native workspace.</p>
            </div>
            <div className="grid gap-8 sm:grid-cols-3">
              {[
                {
                  step: "01",
                  title: "Create a workspace",
                  description:
                    "Sign in with GitHub and create a workspace. Sketchflow initializes a repo with the .sketchflow manifest and project structure.",
                  color: "#58CC02",
                },
                {
                  step: "02",
                  title: "Sketch and document",
                  description:
                    "Use the Excalidraw editor to sketch system diagrams. Write Markdown notes alongside every sketch. Drafts autosave locally.",
                  color: "#1CB0F6",
                },
                {
                  step: "03",
                  title: "Commit to GitHub",
                  description:
                    "One click publishes sketches, docs, and exports to your repo as multi-file tree commits. Every version is a Git commit.",
                  color: "#CE82FF",
                },
              ].map((item) => (
                <div key={item.step} className="space-y-4">
                  <div
                    className="flex size-12 items-center justify-center rounded-[14px] text-lg font-extrabold text-white shadow-[0_4px_0_rgba(0,0,0,0.15)]"
                    style={{ backgroundColor: item.color }}
                  >
                    {item.step}
                  </div>
                  <h3 className="text-lg font-extrabold text-foreground">{item.title}</h3>
                  <p className="text-sm leading-relaxed font-semibold text-muted-foreground">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-6xl px-5 py-20 text-center sm:px-8">
          <div className="rounded-[16px] border-2 border-border bg-card p-10 shadow-[0_2px_0_var(--border)]">
            <Sparkles className="mx-auto size-8 text-[#58CC02]" />
            <h2 className="mt-4 text-3xl font-extrabold text-foreground">Ready to sketch?</h2>
            <p className="mt-2 mb-6 text-base font-semibold text-muted-foreground">
              Create your first workspace and start shipping visual docs with your code.
            </p>
            <Button size="lg" onClick={() => void app.redirectToSignUp()}>
              <Plus className="size-4" />
              Create your workspace
            </Button>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t-2 border-border py-6">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="flex items-center justify-between text-xs font-bold text-muted-foreground">
              <span>Sketchflow</span>
              <span>GitHub-native visual workspace</span>
            </div>
          </div>
        </footer>
      </main>
    );
  }

  // === AUTHENTICATED VIEW ===
  return (
    <main className="min-h-screen bg-background px-4 py-5 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-3 border-b-2 border-border pb-4">
          <BrandMark subtitle={user.displayName || user.primaryEmail || "Signed in"} />
          <div className="flex items-center gap-2">
            <ThemeToggleButton mounted={mounted} theme={theme} setTheme={setTheme} />
            <Button asChild>
              <Link href="/app">
                <ArrowRight className="size-4" />
                Open app
              </Link>
            </Button>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <Card>
            <CardHeader>
              <CardTitle>Create your workspace</CardTitle>
              <CardDescription>
                Sketchflow initializes a public GitHub repo with projects, docs, and a first canvas.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {primaryWorkspace ? (
                <div className="rounded-[16px] border-2 border-[#58CC02] bg-[#EEF9EE] dark:bg-[#1A3A1A] p-5 text-sm font-bold text-[#46A302] dark:text-[#89E219]">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-5" />
                    <span className="font-extrabold">Workspace already connected</span>
                  </div>
                  <div className="mt-2 text-foreground">
                    {primaryWorkspace.repoOwner}/{primaryWorkspace.repoName}
                  </div>
                  <Button variant="default" size="sm" className="mt-4" asChild>
                    <Link href={sketchHref(primaryWorkspace.id)}>
                      <ArrowRight className="size-4" />
                      Open canvas
                    </Link>
                  </Button>
                </div>
              ) : (
                <>
                  <Card size="sm">
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <GitBranch className="size-4 text-[#1CB0F6]" />
                        <CardTitle>GitHub</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {githubConnected ? (
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-bold text-foreground">
                            {connectionCopy(githubStatusCopy)}
                          </span>
                          <Badge variant="default" className="font-extrabold">
                            Ready
                          </Badge>
                        </div>
                      ) : (
                        <div className="space-y-3 text-sm font-semibold text-muted-foreground">
                          <p>{connectionCopy(githubStatusCopy)}</p>
                          <Button variant="default" size="sm" disabled={connectingGithub} onClick={handleConnectGithub}>
                            {connectingGithub ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <GitBranch className="size-4" />
                            )}
                            Connect GitHub
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                    <div className="grid gap-1.5">
                      <Label htmlFor="repo-name" className="font-bold text-foreground">Repository name</Label>
                      <Input id="repo-name" value={repoName} onChange={(event) => setRepoName(event.target.value)} />
                    </div>
                    <div className="flex items-end">
                      <span className="inline-flex items-center gap-1.5 rounded-[999px] bg-[#EEF9FF] dark:bg-[#1A3A4A] px-3 py-1.5 text-xs font-extrabold text-[#1CB0F6]">
                        Public by default
                      </span>
                    </div>
                  </div>

                  <WorkspaceAdvancedOptions
                    open={advancedOpen}
                    onOpenChange={setAdvancedOpen}
                    isPrivate={isPrivate}
                    onPrivateChange={setIsPrivate}
                  />

                  <Button disabled={!githubConnected || bootstrapping} onClick={handleBootstrap} className="w-full sm:w-auto">
                    {bootstrapping ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Plus className="size-4" />
                    )}
                    Create workspace
                  </Button>
                </>
              )}

              {error ? (
                <div className="rounded-[16px] border-2 border-[#FF4B4B]/20 bg-[#FFF0F0] dark:bg-[#3A2020] px-4 py-3 text-sm font-bold text-[#FF4B4B]">
                  {error}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <aside className="space-y-4">
            <Card size="sm">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Workspace readiness</CardTitle>
                  <Button variant="ghost" size="icon-xs" onClick={() => void refreshHomeState()} aria-label="Refresh status" className="text-[#1CB0F6]">
                    <RefreshCw className="size-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: "Account", value: "Signed in", icon: Star, color: "#FFC800" },
                  { label: "GitHub", value: githubConnected ? connectionCopy(githubStatusCopy) : "Connect GitHub", icon: GitBranch, color: "#1CB0F6" },
                  { label: "Workspaces", value: `${workspaces.length} connected`, icon: Layout, color: "#CE82FF" },
                  { label: "Streak", value: "Build your streak!", icon: Flame, color: "#FF9600" },
                ].map((item) => (
                  <div key={item.label} className="rounded-[14px] border-2 border-border bg-card px-3 py-2.5 shadow-[0_2px_0_var(--border)]">
                    <div className="flex items-center gap-2">
                      <item.icon className="size-3.5" style={{ color: item.color }} />
                      <div className="text-xs font-extrabold uppercase tracking-[0.5px] text-muted-foreground">{item.label}</div>
                    </div>
                    <div className="mt-0.5 text-sm font-bold text-foreground">{item.value}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </aside>
        </section>
      </div>
    </main>
  );
}

function ThemeToggleButton({
  mounted,
  theme,
  setTheme,
}: {
  mounted: boolean;
  theme: string | undefined;
  setTheme: (theme: string) => void;
}) {
  if (!mounted) {
    return (
      <Button variant="ghost" size="icon-sm" aria-label="Toggle theme" className="text-muted-foreground">
        <Sun className="size-4" />
      </Button>
    );
  }

  const isDark = theme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={isDark ? "text-[#FFC800] hover:bg-accent" : "text-muted-foreground hover:text-[#58CC02] hover:bg-[#EEF9FF] dark:hover:bg-accent"}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
