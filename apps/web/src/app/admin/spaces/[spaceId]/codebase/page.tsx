"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseGitHubRepo } from "@/lib/github-repo";
import { statusTone } from "@/lib/status-badge";
import { EmptyState } from "@/components/empty-state";
import { FieldValue, StatusBadge } from "../panels";
import { useSpaceConfig } from "../space-config";

export default function SpaceCodebasePage() {
  const {
    repoUrls,
    setRepoUrls,
    codebase,
    sandbox,
    testRepoAccess,
    resetSandbox,
    saveCodebases,
    busy,
  } = useSpaceConfig();
  const [newRepoUrl, setNewRepoUrl] = useState("");

  function addRepo() {
    const trimmed = newRepoUrl.trim();
    if (!trimmed || repoUrls.includes(trimmed)) return;
    setRepoUrls((current) => [...current, trimmed]);
    setNewRepoUrl("");
  }

  function removeRepo(index: number) {
    setRepoUrls((current) => current.filter((_, i) => i !== index));
  }

  const testedUrl = codebase?.testedRepoUrl ?? codebase?.repoUrl;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Codebase access</CardTitle>
          <CardDescription>
            Repos available to opencode and approved coding runs. The first repo is used for
            sandbox clone.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div>
            <span className="mb-1.5 block text-xs text-muted-foreground">Composio GitHub</span>
            <StatusBadge tone={statusTone(codebase?.githubConnectionStatus ?? "missing_api_key")}>
              {codebase?.githubConnectionStatus ?? "missing_api_key"}
            </StatusBadge>
          </div>

          {repoUrls.length === 0 ? (
            <EmptyState title="No codebases yet" description="Add a GitHub repo URL below." />
          ) : (
            <ul className="grid gap-2">
              {repoUrls.map((url, index) => {
                const parsed = parseGitHubRepo(url);
                const isPrimary = index === 0;
                const isTested = testedUrl === url && codebase?.result;

                return (
                  <li
                    key={`${url}-${index}`}
                    className="rounded-md border border-border/60 p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {isPrimary && <Badge variant="secondary">Primary</Badge>}
                          <code className="break-all text-xs">{url}</code>
                        </div>
                        <p className="mt-1.5 mb-0 text-xs text-muted-foreground">
                          {parsed ? `${parsed.owner}/${parsed.repo}` : "Unrecognized GitHub URL"}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => testRepoAccess(url)}
                          disabled={busy}
                        >
                          Test
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeRepo(index)}
                          disabled={busy}
                          aria-label={`Remove ${url}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                    {isTested && codebase.result && (
                      <div className="mt-3 border-t border-border/40 pt-3">
                        <StatusBadge tone={statusTone(codebase.result.status)}>
                          {codebase.result.status}
                        </StatusBadge>
                        <p className="mt-2 mb-0 text-sm text-muted-foreground">
                          {codebase.result.message}
                        </p>
                        {codebase.result.defaultBranch && (
                          <p className="mt-1.5 mb-0 text-sm text-muted-foreground">
                            Default branch: <code>{codebase.result.defaultBranch}</code>
                          </p>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="grid gap-2 border-t border-border/60 pt-4">
            <Label htmlFor="new-repo-url">Add codebase</Label>
            <div className="flex gap-2">
              <Input
                id="new-repo-url"
                value={newRepoUrl}
                onChange={(e) => setNewRepoUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addRepo();
                  }
                }}
                placeholder="https://github.com/org/repo"
              />
              <Button type="button" variant="outline" onClick={addRepo} disabled={busy || !newRepoUrl.trim()}>
                <Plus className="size-4" />
                Add
              </Button>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={saveCodebases} disabled={busy}>
            Save codebases
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Persistent sandbox</CardTitle>
          <CardDescription>Live E2B/opencode workspace for this channel.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex gap-2">
            <StatusBadge tone={sandbox?.hasE2bApiKey ? "success" : "danger"}>
              {sandbox?.hasE2bApiKey ? "E2B configured" : "E2B missing"}
            </StatusBadge>
            {sandbox?.sandbox && (
              <StatusBadge tone={statusTone(sandbox.sandbox.status)}>
                {sandbox.sandbox.status}
              </StatusBadge>
            )}
          </div>
          {sandbox?.sandbox ? (
            <>
              <FieldValue label="Session ID" value={sandbox.sandbox.id} />
              <FieldValue label="E2B sandbox" value={sandbox.sandbox.externalSandboxId} />
              <FieldValue label="Active run" value={sandbox.sandbox.activeRunId} />
              <FieldValue label="Lease expires" value={sandbox.sandbox.leaseExpiresAt} />
              <FieldValue label="Last used" value={sandbox.sandbox.lastUsedAt} />
              <FieldValue label="Workdir" value={sandbox.sandbox.workdir} />
              <FieldValue label="Cloned repo" value={sandbox.sandbox.repoUrl} />
            </>
          ) : (
            <p className="m-0 text-sm text-muted-foreground">
              No sandbox session exists yet. The first coding run will create one.
            </p>
          )}
        </CardContent>
        <CardFooter>
          <Button
            variant="destructive"
            onClick={resetSandbox}
            disabled={busy || !sandbox?.sandbox}
          >
            Reset sandbox
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
