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
import { Switch } from "@/components/ui/switch";
import { COMPOSIO_TOOLKITS, NATIVE_TOOLS } from "@/lib/space-options";
import { statusTone } from "@/lib/status-badge";
import { StatusBadge } from "../panels";
import { useSpaceConfig } from "../space-config";

function toggle(list: string[], value: string, enabled: boolean) {
  if (enabled) return list.includes(value) ? list : [...list, value];
  return list.filter((entry) => entry !== value);
}

export default function SpaceToolsPage() {
  const {
    enabledTools,
    setEnabledTools,
    enabledConnections,
    setEnabledConnections,
    connections,
    connectToolkit,
    save,
    busy,
  } = useSpaceConfig();

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Native tools</CardTitle>
          <CardDescription>Built-in Tags capabilities available to this Space.</CardDescription>
        </CardHeader>
        <CardContent>
          {NATIVE_TOOLS.map((tool) => (
            <div
              key={tool.id}
              className="grid grid-cols-[1fr_auto] items-center gap-3 border-t border-border/60 py-3 first:border-t-0 first:pt-0"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{tool.label}</span>
                  {tool.id === "run_coding_agent" && (
                    <StatusBadge tone="warning">approval</StatusBadge>
                  )}
                </div>
                <p className="mt-1 mb-0 text-[13px] leading-snug text-muted-foreground">
                  {tool.description}
                </p>
              </div>
              <Switch
                checked={enabledTools.includes(tool.id)}
                onCheckedChange={(checked) =>
                  setEnabledTools((prev) => toggle(prev, tool.id, checked))
                }
              />
            </div>
          ))}
        </CardContent>
        <CardFooter>
          <Button onClick={save} disabled={busy}>
            Save tool access
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Composio connections</CardTitle>
          <CardDescription>
            Enabled toolkits are exposed to opencode through the Space MCP server.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-3">
            <StatusBadge tone={connections?.hasComposioApiKey ? "success" : "danger"}>
              {connections?.hasComposioApiKey ? "COMPOSIO_API_KEY configured" : "missing API key"}
            </StatusBadge>
          </div>
          {(connections?.toolkits ?? COMPOSIO_TOOLKITS).map((toolkit) => (
            <div
              key={toolkit.id}
              className="grid grid-cols-[1fr_auto] items-center gap-3 border-t border-border/60 py-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{toolkit.label}</span>
                  {"status" in toolkit && (
                    <StatusBadge tone={statusTone(String(toolkit.status))}>
                      {String(toolkit.status)}
                    </StatusBadge>
                  )}
                </div>
                <p className="mt-1 mb-0 text-[13px] leading-snug text-muted-foreground">
                  {toolkit.description}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={enabledConnections.includes(toolkit.id)}
                  onCheckedChange={(checked) =>
                    setEnabledConnections((prev) => toggle(prev, toolkit.id, checked))
                  }
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => connectToolkit(toolkit.id)}
                  disabled={busy || !connections?.hasComposioApiKey}
                >
                  Connect
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
        <CardFooter>
          <Button onClick={save} disabled={busy}>
            Save tool access
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
