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
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

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
import { bootstrapWorkspace, getAuthMe, getGithubStatus, getWorkspaces, type AuthMeResponse, type GithubStatus, type Workspace } from "@/lib/api";
import { connectGithubAccount } from "@/lib/github-connect";
import { sketchHref } from "@/lib/workspace-routes";

type LoadState = "idle" | "loading" | "ready" | "error";

const APP_URL = "https://sketchflow.shraj.workers.dev";

const features = [
  {
    icon: PenTool,
    title: "Excalidraw canvas",
    description: "Full-featured sketching with autosave to IndexedDB and one-click GitHub commits.",
  },
  {
    icon: GitFork,
    title: "Git-native storage",
    description: "Every sketch, doc, and export lives in your repo. Postgres stores only app metadata.",
  },
  {
    icon: Layout,
    title: "Project workspaces",
    description: "Organize sketches and docs into projects. Each workspace maps to a GitHub repo.",
  },
  {
    icon: PanelRight,
    title: "Side-by-side docs",
    description: "Markdown notes live beside every sketch. Edit in-repo, rendered alongside your canvas.",
  },
  {
    icon: GitCommit,
    title: "Snapshot commits",
    description: "Manual or debounced saves create tree-based multi-file commits. Every version is a commit.",
  },
  {
    icon: HardDrive,
    title: "Offline drafts",
    description: "IndexedDB keeps local drafts so you never lose work. Switch between machines with a push.",
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
    <div className="mx-auto mt-12 w-full max-w-5xl overflow-hidden rounded-xl border bg-card text-left shadow-sm">
      <div className="flex h-10 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="size-2 rounded-full bg-foreground" />
          GitHub workspace
        </div>
        <Badge variant="secondary" className="font-normal">
          Synced
        </Badge>
      </div>
      <div className="grid min-h-[340px] md:grid-cols-[220px_1fr_260px]">
        <aside className="border-b bg-muted/30 p-4 md:border-r md:border-b-0">
          {["Projects", "Sketches", "Docs", "Public pages"].map((item, index) => (
            <div
              key={item}
              className={`mb-2 rounded-md px-3 py-2 text-sm ${index === 0 ? "bg-background font-medium shadow-xs" : "text-muted-foreground"}`}
            >
              {item}
            </div>
          ))}
        </aside>
        <div className="relative min-h-[260px] bg-background p-6">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:32px_32px] opacity-35" />
          <div className="relative grid h-full place-items-center">
            <div className="grid gap-4">
              <div className="rounded-lg border bg-card px-5 py-3 text-sm font-medium shadow-sm">
                Product flow
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border bg-card px-4 py-3 text-xs text-muted-foreground shadow-sm">
                  PRD.md
                </div>
                <div className="rounded-lg border bg-card px-4 py-3 text-xs text-muted-foreground shadow-sm">
                  system-map.excalidraw.json
                </div>
              </div>
              <div className="mx-auto h-8 w-px bg-border" />
              <div className="rounded-lg border bg-card px-5 py-3 text-sm font-medium shadow-sm">
                Commit snapshot
              </div>
            </div>
          </div>
        </div>
        <aside className="border-t bg-muted/20 p-4 md:border-t-0 md:border-l">
          <div className="mb-3 text-xs font-medium uppercase text-muted-foreground">
            Project memory
          </div>
          {["README.md", "notes.md", "exports/", "share.json"].map((item) => (
            <div key={item} className="mb-2 rounded-md border bg-background px-3 py-2 font-mono text-xs">
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
  const [auth, setAuth] = useState<AuthMeResponse | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [githubStatus, setGithubStatus] = useState<GithubStatus | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [repoName, setRepoName] = useState("sketchflow-workspace");
  const [isPrivate, setIsPrivate] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [connectingGithub, setConnectingGithub] = useState(false);

  const primaryWorkspace = useMemo(() => workspaces[0] ?? null, [workspaces]);
  const user = auth?.user ?? null;
  const githubConnected = githubStatus?.connected === true;

  const refreshHomeState = useCallback(async () => {
    setLoadState("loading");
    setError(null);

    try {
      const authResponse = await getAuthMe();
      setAuth(authResponse);

      if (!authResponse.authenticated) {
        setWorkspaces([]);
        setGithubStatus(null);
        setLoadState("ready");
        return;
      }

      const results = await Promise.allSettled([getWorkspaces(), getGithubStatus()]);
      const workspaceResult = results[0];
      const githubResult = results[1];

      if (workspaceResult.status === "fulfilled") {
        setWorkspaces(workspaceResult.value.workspaces);
      } else {
        setError(
          workspaceResult.reason instanceof Error
            ? friendlyError(workspaceResult.reason.message)
            : "Workspace data is temporarily unavailable",
        );
      }

      if (githubResult.status === "fulfilled") {
        setGithubStatus(githubResult.value);
      } else {
        setGithubStatus(null);
      }

      setLoadState(workspaceResult.status === "fulfilled" ? "ready" : "error");
    } catch (authError) {
      setError(
        authError instanceof Error ? friendlyError(authError.message) : "Session is temporarily unavailable",
      );
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    void refreshHomeState();
  }, [refreshHomeState]);

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
      await connectGithubAccount(app, githubStatus?.scopes);
      const nextStatus = await getGithubStatus();
      setGithubStatus(nextStatus);

      if (!nextStatus.connected) {
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
        {/* Nav */}
        <header className="border-b border-border">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 sm:px-8">
            <BrandMark />
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => void app.redirectToSignIn()}>
                Sign in
              </Button>
              <Button
                size="sm"
                onClick={() => void app.redirectToSignUp()}
              >
                Get started
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        </header>

        {/* Hero */}
        <section className="mx-auto max-w-6xl px-5 pt-18 pb-14 sm:px-8 sm:pt-24 sm:pb-18">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="secondary" className="mb-6 gap-1.5 px-3 py-1 text-sm font-normal">
              <ShieldCheck className="size-4" />
              GitHub-native visual workspace
            </Badge>
            <h1 className="text-4xl font-semibold leading-[1.05] sm:text-6xl">
              Sketchflow
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-muted-foreground">
              A calm canvas for builders. Sketch system maps, keep docs beside the work,
              publish project pages, and store every artifact in your own GitHub repo.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button size="lg" onClick={() => void app.redirectToSignUp()}>
                <Plus className="size-4" />
                Create workspace
              </Button>
              <Button
                variant="outline"
                size="lg"
                asChild
              >
                <Link href={APP_URL} target="_blank">
                  <ExternalLink className="size-4" />
                  View live app
                </Link>
              </Button>
            </div>
          </div>
          <ProductPreview />
        </section>

        {/* Feature grid */}
        <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-8">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-semibold">Everything in your repo</h2>
            <p className="mt-1 text-muted-foreground">
              No vendor lock-in. Your data ships with your code.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <Card key={feature.title} size="sm" className="group">
                  <CardHeader>
                    <div className="flex size-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground mb-2 group-hover:bg-accent group-hover:text-accent-foreground transition-colors">
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
        <section className="border-t border-border bg-secondary/30">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
            <div className="mb-10 text-center">
              <h2 className="text-2xl font-semibold">How it works</h2>
              <p className="mt-1 text-muted-foreground">Three steps to a Git-native workspace.</p>
            </div>
            <div className="grid gap-6 sm:grid-cols-3">
              {[
                {
                  step: "01",
                  title: "Create a workspace",
                  description:
                    "Sign in with GitHub and create a workspace. Sketchflow initializes a repo with the .sketchflow manifest and project structure.",
                },
                {
                  step: "02",
                  title: "Sketch and document",
                  description:
                    "Use the Excalidraw editor to sketch system diagrams. Write Markdown notes alongside every sketch. Drafts autosave locally.",
                },
                {
                  step: "03",
                  title: "Commit to GitHub",
                  description:
                    "One click publishes sketches, docs, and exports to your repo as multi-file tree commits. Every version is a Git commit.",
                  icon: GitCommit,
                },
              ].map((item) => (
                <div key={item.step} className="space-y-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
                    {item.step}
                  </div>
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-6xl px-5 py-16 text-center sm:px-8">
          <h2 className="text-2xl font-semibold">Ready to sketch?</h2>
          <p className="mt-2 mb-6 text-muted-foreground">
            Create your first workspace and start shipping visual docs with your code.
          </p>
          <Button size="lg" onClick={() => void app.redirectToSignUp()}>
            <Plus className="size-4" />
            Create your workspace
          </Button>
        </section>

        {/* Footer */}
        <footer className="border-t border-border py-6">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
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
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <BrandMark subtitle={user.displayName || user.primaryEmail || "Signed in"} />
          <Button asChild>
            <Link href="/app">
              <ArrowRight className="size-4" />
              Open app
            </Link>
          </Button>
        </header>

        <section className="grid gap-4 lg:grid-cols-[1fr_380px]">
          <Card>
            <CardHeader>
              <CardTitle>Create your workspace</CardTitle>
              <CardDescription>
                Sketchflow initializes a public GitHub repo with projects, docs, and a first canvas.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {primaryWorkspace ? (
                <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
                  <div className="font-semibold">Workspace already connected</div>
                  <div className="mt-1">
                    {primaryWorkspace.repoOwner}/{primaryWorkspace.repoName}
                  </div>
                  <Button variant="default" size="sm" className="mt-3" asChild>
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
                        <GitBranch className="size-4" />
                        <CardTitle>GitHub</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {githubConnected ? (
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-medium">
                            {connectionCopy(githubStatus)}
                          </span>
                          <Badge variant="secondary" className="font-normal">
                            Ready
                          </Badge>
                        </div>
                      ) : (
                        <div className="space-y-3 text-sm text-muted-foreground">
                          <p>{connectionCopy(githubStatus)}</p>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={connectingGithub}
                            onClick={handleConnectGithub}
                          >
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
                      <Label htmlFor="repo-name">Repository name</Label>
                      <Input
                        id="repo-name"
                        value={repoName}
                        onChange={(event) => setRepoName(event.target.value)}
                      />
                    </div>
                    <div className="flex items-end">
                      <Badge variant="outline" className="h-10 rounded-lg px-3 font-normal">
                        Public by default
                      </Badge>
                    </div>
                  </div>

                  <WorkspaceAdvancedOptions
                    open={advancedOpen}
                    onOpenChange={setAdvancedOpen}
                    isPrivate={isPrivate}
                    onPrivateChange={setIsPrivate}
                  />

                  <Button
                    disabled={!githubConnected || bootstrapping}
                    onClick={handleBootstrap}
                    className="w-full sm:w-auto"
                  >
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
                <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                  {error}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <aside className="space-y-3">
            <Card size="sm">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Workspace readiness</CardTitle>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => void refreshHomeState()}
                    aria-label="Refresh status"
                  >
                    <RefreshCw className="size-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="rounded-lg border bg-background px-3 py-2">
                  <div className="text-xs text-muted-foreground">Account</div>
                  <div className="text-sm">Signed in</div>
                </div>
                <div className="rounded-lg border bg-background px-3 py-2">
                  <div className="text-xs text-muted-foreground">GitHub</div>
                  <div className="text-sm">
                    {githubConnected
                      ? connectionCopy(githubStatus)
                      : "Connect GitHub"}
                  </div>
                </div>
                <div className="rounded-lg border bg-background px-3 py-2">
                  <div className="text-xs text-muted-foreground">Workspaces</div>
                  <div className="text-sm">{workspaces.length} connected</div>
                </div>
                <div className="rounded-lg border bg-background px-3 py-2">
                  <div className="text-xs text-muted-foreground">Sharing</div>
                  <div className="text-sm">Project links and embeds are prepared in repo metadata</div>
                </div>
              </CardContent>
            </Card>
          </aside>
        </section>
      </div>
    </main>
  );
}
