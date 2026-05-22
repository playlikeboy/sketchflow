"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStackApp } from "@stackframe/stack";
import {
  ArrowRight,
  CheckCircle2,
  GitBranch,
  GitCommit,
  GitFork,
  HardDrive,
  Layout,
  Loader2,
  LockKeyhole,
  PanelRight,
  PenTool,
  Plus,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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
import { bootstrapWorkspace, getAuthMe, getGithubStatus, getWorkspaces, type AuthMeResponse, type GithubStatus, type Workspace } from "@/lib/api";
import { connectGithubAccount } from "@/lib/github-connect";

type LoadState = "idle" | "loading" | "ready" | "error";

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

export function HomeClient() {
  const app = useStackApp();
  const router = useRouter();
  const [auth, setAuth] = useState<AuthMeResponse | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [githubStatus, setGithubStatus] = useState<GithubStatus | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [repoName, setRepoName] = useState("sketchflow-workspace");
  const [isPrivate, setIsPrivate] = useState(true);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [connectingGithub, setConnectingGithub] = useState(false);

  const primaryWorkspace = useMemo(() => workspaces[0] ?? null, [workspaces]);
  const user = auth?.user ?? null;
  const githubConnected = githubStatus?.connected === true;

  useEffect(() => {
    let mounted = true;
    setLoadState("loading");
    setError(null);

    getAuthMe()
      .then(async (authResponse) => {
        if (!mounted) return;
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
              ? workspaceResult.reason.message
              : "Could not load workspaces"
          );
        }

        if (githubResult.status === "fulfilled") {
          setGithubStatus(githubResult.value);
          if (!githubResult.value.connected && githubResult.value.reason === "github_oauth_app_required") {
            setError(githubResult.value.message);
          }
        } else {
          setGithubStatus(null);
        }

        setLoadState(workspaceResult.status === "fulfilled" ? "ready" : "error");
      })
      .catch((authError) => {
        if (!mounted) return;
        setError(
          authError instanceof Error ? authError.message : "Could not load auth state"
        );
        setLoadState("error");
      });

    return () => {
      mounted = false;
    };
  }, []);

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
          ? bootstrapError.message
          : "Could not create the workspace repo"
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
        setError(nextStatus.message);
      }
    } catch (connectError) {
      setError(
        connectError instanceof Error
          ? connectError.message
          : "Could not start GitHub connection"
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
            <Link href="/" className="flex items-center gap-3">
              <div className="grid size-8 place-items-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
                SF
              </div>
              <span className="text-sm font-semibold">Sketchflow</span>
            </Link>
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
        <section className="mx-auto max-w-6xl px-5 pt-20 pb-16 sm:px-8 sm:pt-28 sm:pb-20">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="secondary" className="mb-6 gap-1.5 px-3 py-1 text-sm font-normal">
              <ShieldCheck className="size-4" />
              Your repo stays the source of truth
            </Badge>
            <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
              Sketch, document, and sync
              <br />
              every project artifact to GitHub.
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-muted-foreground">
              Sketchflow is a visual workspace that stores every sketch, doc, and export in your
              GitHub repo — not in a closed database. Start with Excalidraw, grow into a full
              project hub.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button size="lg" onClick={() => void app.redirectToSignUp()}>
                <Plus className="size-4" />
                Start with GitHub
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => void app.redirectToSignIn()}
              >
                <LockKeyhole className="size-4" />
                Sign in to workspace
              </Button>
            </div>
          </div>
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
          <Link href="/" className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
              SF
            </div>
            <div>
              <div className="text-sm font-semibold">Sketchflow</div>
              <div className="text-xs text-muted-foreground">
                {user.displayName || user.primaryEmail || "Signed in"}
              </div>
            </div>
          </Link>
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
              <CardTitle>Create or connect your Sketchflow repo</CardTitle>
              <CardDescription>
                Sketches and docs will live in GitHub. Postgres keeps only app metadata.
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
                    <Link href="/app">
                      <ArrowRight className="size-4" />
                      Go to dashboard
                    </Link>
                  </Button>
                </div>
              ) : (
                <>
                  <Card size="sm">
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <GitBranch className="size-4" />
                        <CardTitle>GitHub connection</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
	                      {githubConnected ? (
	                        <span className="text-sm text-green-700 dark:text-green-300">
	                          Connected as {githubConnected ? githubStatus!.github.login : ""}
	                        </span>
	                      ) : (
	                        <div className="space-y-3 text-sm text-muted-foreground">
	                          <p>
	                            {githubStatus?.message ??
	                              "Connect GitHub to create and sync your Sketchflow workspace repo."}
	                          </p>
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
                    <div className="flex items-end gap-2">
                      <div className="flex h-10 items-center gap-2 rounded-lg border border-input px-3">
                        <input
                          type="checkbox"
                          id="private"
                          checked={isPrivate}
                          onChange={(event) => setIsPrivate(event.target.checked)}
                          className="size-4 accent-foreground"
                        />
                        <Label htmlFor="private" className="text-sm font-normal cursor-pointer">
                          Private
                        </Label>
                      </div>
                    </div>
                  </div>

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
                    Create/connect repo
                  </Button>
                </>
              )}

              {error ? (
                <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <aside className="space-y-3">
            <Card size="sm">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Backend status</CardTitle>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => router.refresh()}
                    aria-label="Refresh status"
                  >
                    <RefreshCw className="size-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="rounded-lg border bg-background px-3 py-2">
                  <div className="text-xs text-muted-foreground">Auth</div>
                  <div className="text-sm">Stack Auth session active</div>
                </div>
                <div className="rounded-lg border bg-background px-3 py-2">
	                  <div className="text-xs text-muted-foreground">GitHub</div>
	                  <div className="text-sm">
	                    {githubConnected
	                      ? `Connected as ${githubConnected ? githubStatus!.github.login : ""}`
	                      : githubStatus?.message ?? "Connection needed"}
	                  </div>
                </div>
                <div className="rounded-lg border bg-background px-3 py-2">
                  <div className="text-xs text-muted-foreground">Workspaces</div>
                  <div className="text-sm">{workspaces.length} connected</div>
                </div>
              </CardContent>
            </Card>
          </aside>
        </section>
      </div>
    </main>
  );
}
