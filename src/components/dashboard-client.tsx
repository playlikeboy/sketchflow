"use client";

import Link from "next/link";
import { useStackApp } from "@stackframe/stack";
import {
  ArrowRight,
  Bot,
  Clock3,
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { bootstrapWorkspace, getAuthMe, getGithubStatus, getWorkspaces, type GithubStatus, type Workspace } from "@/lib/api";
import { connectGithubAccount } from "@/lib/github-connect";

function shortSha(value: string | null) {
  return value ? value.slice(0, 7) : "pending";
}

export function DashboardClient() {
  const app = useStackApp();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [githubStatus, setGithubStatus] = useState<GithubStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [repoName, setRepoName] = useState("sketchflow-workspace");
  const [isPrivate, setIsPrivate] = useState(true);
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
                  {githubConnected && githubStatus.connected ? githubStatus.github.login : "Not connected"}
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
                <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
                  <div className="text-sm text-muted-foreground">
                    No workspace repo is connected yet. Create one now and Sketchflow will
                    initialize the `.sketchflow` manifest and project directory.
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[220px_auto_auto]">
                    <Input
                      value={repoName}
                      onChange={(event) => setRepoName(event.target.value)}
                      aria-label="Repository name"
                      placeholder="sketchflow-workspace"
                    />
                    <div className="flex h-8 items-center gap-2 rounded-lg border border-input px-3">
                      <input
                        type="checkbox"
                        id="private-dash"
                        checked={isPrivate}
                        onChange={(event) => setIsPrivate(event.target.checked)}
                        className="size-3.5 accent-foreground"
                      />
                      <Label
                        htmlFor="private-dash"
                        className="text-xs font-normal cursor-pointer"
                      >
                        Private
                      </Label>
                    </div>
                    <Button
                      disabled={!githubConnected || bootstrapping}
                      onClick={handleBootstrap}
                    >
                      {bootstrapping ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Plus className="size-4" />
                      )}
                      Create
                    </Button>
                  </div>
                </div>
              )}
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
                { label: "Publish page", icon: Globe, enabled: false },
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
              <CardTitle>Repo conventions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 font-mono text-xs text-muted-foreground">
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
