"use client";

import { CodeBlock } from "@/components/ui/code-block";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { statusTone } from "@/lib/status-badge";
import { FieldValue, StatusBadge } from "./panels";
import { useSpaceConfig } from "./space-config";

const TEST_PROMPTS = [
  { label: "tools", code: "@tags what tools and connections do you have access to?" },
  { label: "memory", code: "@tags remember that this channel uses Tags as its channel agent." },
  {
    label: "repo",
    code: "@tags inspect the repo and explain the Slack mention to agent response flow. Do not edit files.",
  },
  {
    label: "artifact",
    code: "@tags create a small channel-notes.md file in the workspace and summarize what changed.",
  },
];

export default function SpaceOverviewPage() {
  const { space, sandbox, connections, enabledTools, enabledConnections } = useSpaceConfig();

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Channel identity</CardTitle>
          <CardDescription>Slack channel boundary for this Space.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <FieldValue label="Name" value={space?.name} />
          <FieldValue label="Slug" value={space?.slug} />
          <FieldValue label="Slack channel" value={space?.externalSpaceId} />
          <FieldValue label="Space ID" value={space?.id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
          <CardDescription>Current capabilities and runtime state.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={connections?.hasComposioApiKey ? "success" : "warning"}>
              {connections?.hasComposioApiKey ? "Composio configured" : "Composio not configured"}
            </StatusBadge>
            <StatusBadge tone={sandbox?.hasE2bApiKey ? "success" : "warning"}>
              {sandbox?.hasE2bApiKey ? "E2B configured" : "E2B not configured"}
            </StatusBadge>
            {sandbox?.sandbox && (
              <StatusBadge tone={statusTone(sandbox.sandbox.status)}>
                sandbox {sandbox.sandbox.status}
              </StatusBadge>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldValue label="Native tools enabled" value={String(enabledTools.length)} />
            <FieldValue label="Connections enabled" value={String(enabledConnections.length)} />
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Test prompts</CardTitle>
          <CardDescription>Copy these into Slack to verify capabilities.</CardDescription>
        </CardHeader>
        <CardContent>
          <CodeBlock tabs={TEST_PROMPTS} />
        </CardContent>
      </Card>
    </div>
  );
}
