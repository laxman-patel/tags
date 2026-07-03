"use client";

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
import { statusTone } from "@/lib/status-badge";
import { FieldValue, StatusBadge } from "../panels";
import { useSpaceConfig } from "../space-config";

export default function SpaceCodebasePage() {
  const {
    repoUrl,
    setRepoUrl,
    codebase,
    sandbox,
    testRepoAccess,
    resetSandbox,
    save,
    busy,
  } = useSpaceConfig();

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Codebase access</CardTitle>
          <CardDescription>Repo used by opencode and approved coding runs.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="repo-url">Repo URL</Label>
            <Input
              id="repo-url"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/org/repo"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FieldValue
              label="Parsed GitHub repo"
              value={
                codebase?.parsedGitHubRepo
                  ? `${codebase.parsedGitHubRepo.owner}/${codebase.parsedGitHubRepo.repo}`
                  : null
              }
            />
            <div>
              <span className="mb-1.5 block text-xs text-muted-foreground">Private repo token</span>
              <StatusBadge tone={codebase?.hasGlobalGitHubToken ? "success" : "warning"}>
                {codebase?.hasGlobalGitHubToken ? "configured" : "not configured"}
              </StatusBadge>
            </div>
          </div>
          {codebase?.result && (
            <div className="rounded-md border border-border/60 p-3">
              <StatusBadge tone={statusTone(codebase.result.status)}>
                {codebase.result.status}
              </StatusBadge>
              <p className="mt-2.5 mb-0 text-sm text-muted-foreground">{codebase.result.message}</p>
              {codebase.result.defaultBranch && (
                <p className="mt-1.5 mb-0 text-sm text-muted-foreground">
                  Default branch: <code>{codebase.result.defaultBranch}</code>
                </p>
              )}
            </div>
          )}
        </CardContent>
        <CardFooter className="gap-2">
          <Button variant="outline" onClick={testRepoAccess} disabled={busy}>
            Test repo access
          </Button>
          <Button onClick={save} disabled={busy}>
            Save repo
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
