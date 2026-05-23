"use client";

import Link from "next/link";
import { useStackApp } from "@stackframe/stack";
import {
  ArrowRight,
  Bot,
  ChevronDown,
  Clock3,
  Code2,
  FileText,
  GitBranch,
  GitPullRequest,
  Globe,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { bootstrapWorkspace, getAuthMe, getGithubStatus, getWorkspaces, type GithubStatus, type Workspace } from "@/lib/api";
import { connectGithubAccount } from "@/lib/github-connect";

function shortSha(value: string | null) {
  return value ? value.slice(0, 7) : "pending";
}

function connectionCopy(status: GithubStatus | null) {
  if (status?.connected) {
    return status.github.login;
  }

  return "Connect GitHub";
}

function friendlyError(message: string) {
  if (message.toLowerCase().includes("github")) {
    return "GitHub needs one more connection step. Reconnect and approve access to continue.";
  }

  return message;
}

export function DashboardClient() {
  const app = useStackApp();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [githubStatus, setGithubStatus] = useState<GithubStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [repoName, setRepoName] = useState("sketchflow-workspace");
  const [isPrivate, setIsPrivate] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [connectingGithub, setConnectingGithub] = useState(false);

  const latestWorkspace = useMemo(() => workspaces[0] ?? null, [workspaces]);
  const githubConnected = githubStatus?.connected === true;

  async function refresh() {
    setLoading(true);
    setError(null);

    const auth = await getAuthMe();
    if (!auth.authenticated) {
      await app.redirectToSignIn();
      return;
    }

    const [workspaceResult, githubResult] = await Promise.allSettled([
      getWorkspaces(),
      getGithubStatus(),
    ]);

    if (workspaceResult.status === "fulfilled") {
      setWorkspaces(workspaceResult.value.workspaces);
    } else {
      setError(
        workspaceResult.reason instanceof Error
          ? friendlyError(workspaceResult.reason.message)
          : "Workspace data is temporarily unavailable"
      );
    }

    if (githubResult.status === "fulfilled") {
      setGithubStatus(githubResult.value);
    } else {
      setGithubStatus(null);
    }

    setLoading(false);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleBootstrap() {
    setBootstrapping(true);
    setError(null);

    try {
      const response = await bootstrapWorkspace({ repoName, private: isPrivate });
      setWorkspaces((current) => [
        response.workspace,
        ...current.filter((workspace) => workspace.id !== response.workspace.id),
      ]);
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

  return (
    <AppShell
      title="Workspace"
      subtitle={
        latestWorkspace
          ? `${latestWorkspace.repoOwner}/${latestWorkspace.repoName}`
          : "Create a GitHub-backed canvas workspace"
      }
      syncLabel={
        latestWorkspace ? `Synced ${shortSha(latestWorkspace.latestCommitSha)}` : undefined
      }
      action={
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void refresh()}
          aria-label="Refresh workspace data"
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
        </Button>
      }
    >
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <section className="space-y-5">
          {/* Stat cards */}
          <div className="grid gap-3 md:grid-cols-3">
            <Card size="sm">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    GitHub
                  </CardTitle>
                  <GitPullRequest className="size-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-semibold">
                  {connectionCopy(githubStatus)}
                </div>
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Workspaces
                  </CardTitle>
                  <ShieldCheck className="size-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-semibold">{workspaces.length}</div>
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Latest commit
                  </CardTitle>
                  <GitBranch className="size-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-semibold">
                  {shortSha(latestWorkspace?.latestCommitSha ?? null)}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Error */}
          {error ? (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {/* Workspace list */}
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Connected workspaces</CardTitle>
                  <CardDescription>
                    Each one maps to a repo that stores sketches, docs, exports, and metadata.
                  </CardDescription>
                </div>
                {githubConnected ? null : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={connectingGithub}
                    onClick={handleConnectGithub}
                  >
                    {connectingGithub ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <GitPullRequest className="size-4" />
                    )}
                    Connect GitHub
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {workspaces.length > 0 ? (
                <div className="divide-y divide-border">
                  {workspaces.map((workspace) => (
                    <div
                      key={workspace.id}
                      className="grid gap-3 py-4 first:pt-0 last:pb-0 lg:grid-cols-[1fr_auto]"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">
                            {workspace.repoOwner}/{workspace.repoName}
                          </span>
                          <Badge variant="secondary" className="font-normal">
                            {workspace.visibility}
                          </Badge>
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          {workspace.defaultBranch} &middot; latest commit{" "}
                          {shortSha(workspace.latestCommitSha)}
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                          {[
                            { label: "First Project", value: "projects/first-project" },
                            { label: "Share page", value: workspace.visibility === "public" ? "Ready" : "Private" },
                            { label: "Embed", value: workspace.visibility === "public" ? "Available soon" : "Private" },
                          ].map((item) => (
                            <div key={item.label} className="rounded-lg border bg-muted/20 px-3 py-2">
                              <div className="text-xs text-muted-foreground">{item.label}</div>
                              <div className="truncate text-sm">{item.value}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" size="sm" asChild>
                          <Link
                            href={`https://github.com/${workspace.repoOwner}/${workspace.repoName}`}
                            target="_blank"
                          >
                            <GitPullRequest className="size-4" />
                            Repo
                          </Link>
                        </Button>
                        <Button size="sm" asChild>
                          <Link
                            href={`/app/workspaces/${workspace.id}/projects/first-project/sketches/system-map`}
                          >
                            <ArrowRight className="size-4" />
                            Open sketch
                          </Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
                  Create your first workspace repo. Sketchflow will add the manifest,
                  README, first project, docs, and sketch file.
                </div>
              )}

              <div className={workspaces.length > 0 ? "mt-4 border-t pt-4" : "mt-4"}>
                <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                  <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_auto]">
                    <Input
                      value={repoName}
                      onChange={(event) => setRepoName(event.target.value)}
                      aria-label="Repository name"
                      placeholder="sketchflow-workspace"
                    />
                    <Badge variant="outline" className="h-8 rounded-lg px-3 font-normal">
                      Public
                    </Badge>
                  </div>
                  <Button disabled={!githubConnected || bootstrapping} onClick={handleBootstrap}>
                    {bootstrapping ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Plus className="size-4" />
                    )}
                    New workspace
                  </Button>
                </div>
                <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen} className="mt-2">
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="px-0 text-muted-foreground">
                      <ChevronDown className={`size-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
                      Advanced
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="rounded-lg border bg-muted/20 p-3">
                    <label className="flex items-start gap-3 text-sm">
                      <Checkbox
                        checked={isPrivate}
                        onCheckedChange={(checked) => setIsPrivate(checked === true)}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="block font-medium">Create as a private repo</span>
                        <span className="text-muted-foreground">
                          Use for internal diagrams. Secret scanning and access controls stay in GitHub.
                        </span>
                      </span>
                    </label>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Sidebar */}
        <aside className="space-y-4">
          <Card size="sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Quick actions</CardTitle>
                <Sparkles className="size-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { label: "New sketch", icon: Plus, enabled: Boolean(latestWorkspace) },
                { label: "Open docs", icon: FileText, enabled: false },
                { label: "Share project", icon: Globe, enabled: false },
                { label: "Embed project", icon: Code2, enabled: false },
                { label: "Ask AI", icon: Bot, enabled: false },
                { label: "Version timeline", icon: Clock3, enabled: false },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <Button
                    key={item.label}
                    variant="outline"
                    disabled={!item.enabled}
                    className="w-full h-10 justify-start gap-3 text-sm"
                  >
                    <Icon className="size-4" />
                    {item.label}
                  </Button>
                );
              })}
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Repo layout</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 font-mono text-xs text-muted-foreground">
                <div>.sketchflow/indexes/projects.json</div>
                <div>projects/first-project/project.json</div>
                <div>projects/first-project/sketches/system-map.excalidraw.json</div>
                <div>projects/first-project/docs/notes.md</div>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </AppShell>
  );
}
