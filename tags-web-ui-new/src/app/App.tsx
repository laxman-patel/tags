import type { ComponentType, FormEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
  SignInButton,
  UserButton,
  useOrganization,
  useUser,
} from "@clerk/react";
import tagsLogo from "../imports/Group_101__5_.png";
import {
  Sidebar,
  Table,
  LayerCard,
  Button,
  Badge,
  Text,
  Empty,
  Loader,
  Field,
  Input,
  Tabs,
  Surface,
  Dialog,
  cn,
} from "@cloudflare/kumo";
import {
  RobotIcon,
  HashIcon,
  StackIcon,
  ShieldCheckIcon,
  ActivityIcon,
  PlusIcon,
  CaretRightIcon,
  CaretLeftIcon,
  CheckIcon,
  XIcon,
  ArrowClockwiseIcon,
  ClockIcon,
  GitBranchIcon,
  WarningIcon,
  LightningIcon,
  FileTextIcon,
  PlayIcon,
  CircleIcon,
  ArrowSquareOutIcon,
  CoinsIcon,
  CpuIcon,
  EnvelopeIcon,
  GitPullRequestIcon,
  RocketIcon,
  MagnifyingGlassIcon,
  DatabaseIcon,
  ChatCircleIcon,
  WrenchIcon,
  HeadsetIcon,
  CodeIcon,
  ChartLineUpIcon,
} from "@phosphor-icons/react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  createSpace,
  authorizeComposioTool,
  loadControlPlane,
  loadComposioDirectory,
  loadSlackChannels,
  loadRunEvents,
  respondToApproval,
  updateSpaceConfig,
  type Approval,
  type ComposioDirectoryTool,
  type Repo,
  type Run,
  type RunEvent,
  type RunEventType,
  type RunStatus,
  type Space,
  type SpaceStatus,
  type SlackChannel,
  type Tool,
  type ToolAuthState,
} from "./api";
import { clerkAppearance } from "./clerkAppearance";

// ===== Types =====

type View =
  | { page: "spaces" }
  | { page: "space-detail"; id: string }
  | { page: "approvals" }
  | { page: "runs" }
  | { page: "run-detail"; id: string };

type SlackWorkspace = {
  id: string;
  teamId: string;
  name?: string | null;
  botUserId?: string | null;
  scopes: string[];
};

function FallbackAccountFooter() {
  return (
    <div className="flex items-center gap-2 px-2 py-2 group-data-[state=collapsed]/sidebar:justify-center">
      <div className="w-7 h-7 rounded-full bg-kumo-tint flex items-center justify-center shrink-0">
        <Text size="xs">A</Text>
      </div>
      <div className="min-w-0 group-data-[state=collapsed]/sidebar:hidden">
        <Text size="sm" truncate>Admin</Text>
        <Text variant="secondary" size="xs" truncate>
          acme.workspace
        </Text>
      </div>
    </div>
  );
}

function ClerkAccountFooter() {
  const triggerRef = useRef<HTMLDivElement>(null);
  const { isSignedIn, user } = useUser();
  const { organization } = useOrganization();
  const displayName =
    user?.fullName ||
    user?.primaryEmailAddress?.emailAddress ||
    user?.username ||
    "Admin";
  const workspaceName = organization?.name
    ? `${organization.name}.workspace`
    : "acme.workspace";

  return (
    <div className="px-2 py-2">
      {isSignedIn ? (
        <div className="relative flex items-center gap-2 group-data-[state=collapsed]/sidebar:justify-center">
          <button
            type="button"
            aria-label="Manage account"
            className="absolute inset-0 z-10 rounded-md"
            onClick={() => {
              triggerRef.current
                ?.querySelector<HTMLButtonElement>("button")
                ?.click();
            }}
          />
          <div
            ref={triggerRef}
            className="absolute left-0 top-1/2 -translate-y-1/2 group-data-[state=collapsed]/sidebar:left-1/2 group-data-[state=collapsed]/sidebar:-translate-x-1/2"
          >
            <UserButton
              appearance={clerkAppearance}
              userProfileMode="modal"
              userProfileProps={{ appearance: clerkAppearance }}
            />
          </div>
          <div className="w-7 h-7 shrink-0" aria-hidden="true" />
          <div className="min-w-0 group-data-[state=collapsed]/sidebar:hidden">
            <Text size="sm" truncate>{displayName}</Text>
            <Text variant="secondary" size="xs" truncate>
              {workspaceName}
            </Text>
          </div>
        </div>
      ) : (
        <SignInButton mode="modal">
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md text-left group-data-[state=collapsed]/sidebar:justify-center"
          >
            <div className="w-7 h-7 rounded-full bg-kumo-tint flex items-center justify-center shrink-0">
              <Text size="xs">A</Text>
            </div>
            <div className="min-w-0 group-data-[state=collapsed]/sidebar:hidden">
              <Text size="sm" truncate>Sign in</Text>
              <Text variant="secondary" size="xs" truncate>
                Manage account
              </Text>
            </div>
          </button>
        </SignInButton>
      )}
    </div>
  );
}

function SignInScreen() {
  return (
    <div data-mode="dark" className="flex min-h-screen items-center justify-center bg-kumo-canvas p-4">
      <LayerCard className="w-full max-w-sm">
        <LayerCard.Primary>
          <div className="flex flex-col items-center gap-4 text-center">
            <img src={tagsLogo} alt="Tags" className="h-10 w-10 rounded-md object-contain" />
            <div>
              <Text variant="heading3" as="h1">Tags</Text>
              <Text variant="secondary" size="sm" as="p">
                Sign in to manage your Slack Spaces.
              </Text>
            </div>
            <SignInButton mode="modal">
              <Button variant="primary">Sign in</Button>
            </SignInButton>
          </div>
        </LayerCard.Primary>
      </LayerCard>
    </div>
  );
}

function SlackConnectEmpty() {
  return (
    <div className="flex min-h-[calc(100vh-3rem)] items-center justify-center p-4">
      <LayerCard className="w-full max-w-lg">
        <LayerCard.Primary>
          <Empty
            icon={<ChatCircleIcon size={40} />}
            title="Connect Slack workspace"
            description="Connect one Slack workspace to this Tags account before creating Spaces."
          />
          <div className="mt-5 flex justify-center">
            <Button
              variant="primary"
              icon={ArrowSquareOutIcon}
              onClick={() => {
                window.location.href = "/api/slack/oauth/start";
              }}
            >
              Connect Slack
            </Button>
          </div>
        </LayerCard.Primary>
      </LayerCard>
    </div>
  );
}

// ===== Mock Data =====

const INITIAL_SPACES: Space[] = [
  {
    id: "sp_01",
    name: "Customer Support",
    channel: "support-bot",
    status: "active",
    lastRun: "2 min ago",
    runCount: 1847,
    tokenUsage: 4820000,
    cost: 96.4,
    repos: [
      { id: "r1", name: "acme/support-kb", isDefault: true },
      { id: "r2", name: "acme/help-articles", isDefault: false },
    ],
    recentActivity: "Resolved ticket #4521 — billing refund",
    tools: [
      { id: "search", name: "search_docs", description: "Search internal documentation", provider: "Composio", enabled: true, authState: "connected" },
      { id: "jira", name: "jira", description: "Query and update Jira tickets", provider: "Atlassian", enabled: true, authState: "connected" },
      { id: "slack_post", name: "slack_post", description: "Post messages to Slack channels", provider: "Slack", enabled: true, authState: "connected" },
      { id: "email", name: "send_email", description: "Send emails via SendGrid", provider: "SendGrid", enabled: false, authState: "requires_auth" },
    ],
  },
  {
    id: "sp_02",
    name: "Engineering Assistant",
    channel: "eng-help",
    status: "active",
    lastRun: "14 min ago",
    runCount: 612,
    tokenUsage: 2110000,
    cost: 42.2,
    repos: [
      { id: "r1", name: "acme/monorepo", isDefault: true },
      { id: "r2", name: "acme/design-system", isDefault: false },
      { id: "r3", name: "acme/infra", isDefault: false },
    ],
    recentActivity: "Reviewed PR #892 — auth middleware refactor",
    tools: [
      { id: "github", name: "github_read", description: "Read GitHub repositories and PRs", provider: "GitHub", enabled: true, authState: "connected" },
      { id: "github_write", name: "github_write", description: "Create issues, PRs, and comments", provider: "GitHub", enabled: true, authState: "connected" },
      { id: "search", name: "search_docs", description: "Search internal documentation", provider: "Composio", enabled: true, authState: "connected" },
      { id: "run_query", name: "run_query", description: "Execute read-only SQL queries", provider: "Postgres", enabled: false, authState: "connected" },
    ],
  },
  {
    id: "sp_03",
    name: "Sales Intelligence",
    channel: "sales-team",
    status: "paused",
    lastRun: "3 days ago",
    runCount: 289,
    tokenUsage: 890000,
    cost: 17.8,
    repos: [],
    recentActivity: "Paused by admin — rate limit exceeded",
    tools: [
      { id: "search", name: "search_docs", description: "Search internal documentation", provider: "Composio", enabled: true, authState: "connected" },
      { id: "email", name: "send_email", description: "Send emails via SendGrid", provider: "SendGrid", enabled: true, authState: "connected" },
      { id: "run_query", name: "run_query", description: "Execute read-only SQL queries", provider: "Postgres", enabled: true, authState: "connected" },
    ],
  },
  {
    id: "sp_04",
    name: "DevOps Monitor",
    channel: "devops-alerts",
    status: "error",
    lastRun: "1 hr ago",
    runCount: 3401,
    tokenUsage: 9200000,
    cost: 184.0,
    repos: [
      { id: "r1", name: "acme/infra", isDefault: true },
      { id: "r2", name: "acme/terraform-modules", isDefault: false },
    ],
    recentActivity: "Error: deploy tool auth token expired",
    tools: [
      { id: "deploy", name: "deploy", description: "Trigger deployment pipelines", provider: "GitHub Actions", enabled: true, authState: "requires_auth" },
      { id: "run_query", name: "run_query", description: "Execute read-only SQL queries", provider: "Postgres", enabled: true, authState: "connected" },
      { id: "slack_post", name: "slack_post", description: "Post messages to Slack channels", provider: "Slack", enabled: true, authState: "connected" },
      { id: "github", name: "github_read", description: "Read GitHub repositories and PRs", provider: "GitHub", enabled: true, authState: "connected" },
    ],
  },
];

const RUNS: Run[] = [
  { id: "run_001", spaceId: "sp_01", spaceName: "Customer Support", channel: "support-bot", status: "success", startedAt: "Today, 14:32", duration: "18s", toolCalls: 3, triggeredBy: "@dana" },
  { id: "run_002", spaceId: "sp_02", spaceName: "Engineering Assistant", channel: "eng-help", status: "running", startedAt: "Today, 14:28", duration: "4m 12s", toolCalls: 7, triggeredBy: "@marcus" },
  { id: "run_003", spaceId: "sp_04", spaceName: "DevOps Monitor", channel: "devops-alerts", status: "failed", startedAt: "Today, 13:51", duration: "2s", toolCalls: 1, triggeredBy: "scheduled" },
  { id: "run_004", spaceId: "sp_01", spaceName: "Customer Support", channel: "support-bot", status: "success", startedAt: "Today, 13:44", duration: "31s", toolCalls: 5, triggeredBy: "@priya" },
  { id: "run_005", spaceId: "sp_02", spaceName: "Engineering Assistant", channel: "eng-help", status: "success", startedAt: "Today, 13:20", duration: "1m 02s", toolCalls: 4, triggeredBy: "@tom" },
  { id: "run_006", spaceId: "sp_04", spaceName: "DevOps Monitor", channel: "devops-alerts", status: "pending", startedAt: "Today, 12:58", duration: "—", toolCalls: 2, triggeredBy: "scheduled" },
  { id: "run_007", spaceId: "sp_01", spaceName: "Customer Support", channel: "support-bot", status: "success", startedAt: "Today, 12:33", duration: "22s", toolCalls: 4, triggeredBy: "@lee" },
  { id: "run_008", spaceId: "sp_03", spaceName: "Sales Intelligence", channel: "sales-team", status: "success", startedAt: "Jul 1, 09:17", duration: "44s", toolCalls: 6, triggeredBy: "@alex" },
];

const INITIAL_APPROVALS: Approval[] = [
  {
    id: "apr_001",
    spaceId: "sp_04",
    spaceName: "DevOps Monitor",
    channel: "devops-alerts",
    action: "deploy",
    description: "Deploy infra/k8s-patch-v2.1.4 to production cluster",
    requestedAt: "Today, 12:58",
    requestedBy: "DevOps Monitor agent",
    context: "Triggered by scheduled health check. Patch addresses CVE-2024-3094.",
  },
  {
    id: "apr_002",
    spaceId: "sp_01",
    spaceName: "Customer Support",
    channel: "support-bot",
    action: "send_email",
    description: "Send refund confirmation to customer@example.com",
    requestedAt: "Today, 14:05",
    requestedBy: "Customer Support agent",
    context: "User Dana requested a refund for order #8821. Agent drafted confirmation email.",
  },
  {
    id: "apr_003",
    spaceId: "sp_02",
    spaceName: "Engineering Assistant",
    channel: "eng-help",
    action: "github_write",
    description: "Merge PR #892 — auth middleware refactor into main",
    requestedAt: "Today, 14:22",
    requestedBy: "Engineering Assistant agent",
    context: "All CI checks passing. Requested by @marcus after code review completion.",
  },
];

const RUN_EVENTS: Record<string, RunEvent[]> = {
  run_006: [
    { id: "e1", type: "start", time: "12:58:00", label: "Run started", detail: "Triggered by scheduled health check · DevOps Monitor", status: "success" },
    { id: "e2", type: "tool_call", time: "12:58:01", label: "run_query", detail: "SELECT status, count(*) FROM deployments WHERE created_at > NOW() - INTERVAL '1 hour' GROUP BY status", status: "success" },
    { id: "e3", type: "tool_call", time: "12:58:03", label: "deploy", detail: "Request: deploy infra/k8s-patch-v2.1.4 to cluster prod-us-east-1", status: "pending" },
    { id: "e4", type: "approval", time: "12:58:03", label: "Approval requested", detail: "deploy · Waiting for admin approval before proceeding", status: "pending" },
  ],
  run_003: [
    { id: "e1", type: "start", time: "13:51:00", label: "Run started", detail: "Triggered by scheduled health check · DevOps Monitor", status: "success" },
    { id: "e2", type: "tool_call", time: "13:51:01", label: "deploy", detail: "Request: rotate expired auth token for deploy tool", status: "failed" },
    { id: "e3", type: "error", time: "13:51:02", label: "Tool error", detail: "deploy: AuthTokenExpired — token last rotated 2024-12-01. Requires manual rotation via admin console.", status: "failed" },
  ],
  run_001: [
    { id: "e1", type: "start", time: "14:32:00", label: "Run started", detail: "Triggered by @dana in #support-bot", status: "success" },
    { id: "e2", type: "tool_call", time: "14:32:02", label: "search_docs", detail: 'Query: "refund policy for annual subscriptions"', status: "success" },
    { id: "e3", type: "tool_call", time: "14:32:08", label: "jira", detail: "GET /issue/SUP-4521 — Fetch ticket context", status: "success" },
    { id: "e4", type: "tool_call", time: "14:32:12", label: "slack_post", detail: "Posted resolution summary to #support-bot", status: "success" },
    { id: "e5", type: "artifact", time: "14:32:18", label: "Artifact", detail: "response.md — 312 tokens · Ticket SUP-4521 marked resolved", status: "success" },
    { id: "e6", type: "end", time: "14:32:18", label: "Run completed", detail: "18s · 3 tool calls · 1,240 tokens", status: "success" },
  ],
};

// ===== Chart data =====

const ACTIVITY_24H = [
  { h: "00", runs: 8, failed: 0 },
  { h: "02", runs: 3, failed: 0 },
  { h: "04", runs: 2, failed: 0 },
  { h: "06", runs: 12, failed: 1 },
  { h: "08", runs: 34, failed: 2 },
  { h: "10", runs: 58, failed: 3 },
  { h: "12", runs: 71, failed: 1 },
  { h: "14", runs: 82, failed: 4 },
  { h: "16", runs: 66, failed: 2 },
  { h: "18", runs: 41, failed: 0 },
  { h: "20", runs: 22, failed: 1 },
  { h: "22", runs: 14, failed: 0 },
];

const RUN_STATUS_DISTRIBUTION = [
  { name: "Success", value: 812, color: "var(--color-kumo-success, #16a34a)" },
  { name: "Failed", value: 24, color: "var(--color-kumo-danger, #dc2626)" },
  { name: "Running", value: 6, color: "var(--color-kumo-info, #2563eb)" },
  { name: "Pending", value: 3, color: "var(--color-kumo-warning, #d97706)" },
];

const SPACE_TOKEN_TREND = [
  { d: "Jun 27", tokens: 140 },
  { d: "Jun 28", tokens: 165 },
  { d: "Jun 29", tokens: 130 },
  { d: "Jun 30", tokens: 210 },
  { d: "Jul 01", tokens: 245 },
  { d: "Jul 02", tokens: 190 },
  { d: "Jul 03", tokens: 275 },
];

const SPACE_RUNS_PER_DAY = [
  { d: "Jun 27", runs: 42 },
  { d: "Jun 28", runs: 51 },
  { d: "Jun 29", runs: 38 },
  { d: "Jun 30", runs: 67 },
  { d: "Jul 01", runs: 74 },
  { d: "Jul 02", runs: 58 },
  { d: "Jul 03", runs: 81 },
];

// ===== Chart primitives =====

const CHART_BRAND = "#2563eb";
const CHART_DANGER = "#dc2626";
const CHART_MUTED = "#94a3b8";

function ChartTooltipStyle() {
  return {
    contentStyle: {
      background: "var(--color-kumo-base)",
      border: "1px solid var(--color-kumo-hairline)",
      borderRadius: 6,
      fontSize: 12,
      padding: "6px 8px",
    },
    labelStyle: { color: "var(--color-kumo-subtle)", fontSize: 11 },
    itemStyle: { color: "var(--color-kumo-default)" },
  };
}

// ===== Helpers =====

const spaceStatusToBadge: Record<
  SpaceStatus,
  { variant: "success" | "warning" | "error"; label: string }
> = {
  active: { variant: "success", label: "Active" },
  paused: { variant: "warning", label: "Paused" },
  error: { variant: "error", label: "Error" },
};

const runStatusToBadge: Record<
  RunStatus,
  { variant: "success" | "info" | "error" | "warning"; label: string }
> = {
  success: { variant: "success", label: "Success" },
  running: { variant: "info", label: "Running" },
  failed: { variant: "error", label: "Failed" },
  pending: { variant: "warning", label: "Pending" },
};

function SpaceStatusBadge({ status }: { status: SpaceStatus }) {
  const b = spaceStatusToBadge[status];
  return (
    <Badge variant={b.variant} appearance="dot">
      {b.label}
    </Badge>
  );
}

function RunStatusBadge({ status }: { status: RunStatus }) {
  const b = runStatusToBadge[status];
  return (
    <Badge variant={b.variant} appearance="dot">
      {b.label}
    </Badge>
  );
}

function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div className="min-w-0">
        {breadcrumb}
        <Text variant="heading2" as="h1">
          {title}
        </Text>
        {description && (
          <Text variant="secondary" size="sm" as="p">
            {description}
          </Text>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    null
  );
}

function BackLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 mb-3 text-kumo-subtle hover:text-kumo-default transition-colors"
    >
      <CaretLeftIcon size={14} />
      <Text variant="secondary" size="sm">
        {label}
      </Text>
    </button>
  );
}

function isComposioTool(tool: Tool) {
  return tool.kind === "composio" || tool.provider === "Composio";
}

function statusTone(status: SpaceStatus) {
  return {
    active: "bg-kumo-success",
    paused: "bg-kumo-warning",
    error: "bg-kumo-danger",
  }[status];
}

function displayToolCount(value: number) {
  return value === 1 ? "1 tool" : `${value} tools`;
}

function ToolLogo({
  tool,
  size = "base",
}: {
  tool: Pick<Tool, "id" | "name" | "logoUrl"> | ComposioDirectoryTool;
  size?: "sm" | "base";
}) {
  const boxSize = size === "sm" ? "h-7 w-7" : "h-9 w-9";
  const iconSize = size === "sm" ? 14 : 18;

  return (
    <div className={cn("flex items-center justify-center rounded-md border border-kumo-hairline bg-kumo-base text-kumo-subtle shrink-0", boxSize)}>
      {"logoUrl" in tool && tool.logoUrl ? (
        <img src={tool.logoUrl} alt="" className="h-4 w-4 rounded-sm object-contain" />
      ) : (
        <ActionIcon action={tool.id} size={iconSize} />
      )}
    </div>
  );
}

function StatusLine({ space }: { space: Space }) {
  const totalTools = space.tools.length;
  const readyTools = space.tools.filter((tool) => tool.authState === "connected").length;

  return (
    <div className="flex min-w-0 items-center gap-2 text-kumo-subtle">
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", statusTone(space.status))} />
      <Text variant="secondary" size="xs" truncate>
        {space.status === "active" ? "production" : space.status} · {readyTools}/{totalTools} ready
      </Text>
    </div>
  );
}

// ===== Metric Grid =====

interface Metric {
  label: string;
  value: string | number;
  icon: ReactNode;
  tone?: "default" | "danger";
}

function MetricGrid({ metrics }: { metrics: Metric[] }) {
  return (
    <div
      className={cn(
        "grid gap-3 mb-6",
        metrics.length === 3 && "grid-cols-1 md:grid-cols-3",
        metrics.length === 4 && "grid-cols-2 md:grid-cols-4",
        metrics.length === 5 && "grid-cols-2 md:grid-cols-5"
      )}
    >
      {metrics.map((m, i) => (
        <LayerCard key={i} className="p-4">
          <div className="flex items-center gap-2 mb-2 text-kumo-subtle">
            {m.icon}
            <Text variant="secondary" size="xs">
              {m.label}
            </Text>
          </div>
          <Text
            variant={m.tone === "danger" ? "error" : "heading2"}
            as="div"
          >
            {m.value}
          </Text>
        </LayerCard>
      ))}
    </div>
  );
}

// ===== Views =====

function SpacesView({
  spaces,
  runs,
  slackWorkspace,
  onSelectSpace,
  onNewSpace,
  onSelectRun,
}: {
  spaces: Space[];
  runs: Run[];
  slackWorkspace: SlackWorkspace;
  onSelectSpace: (id: string) => void;
  onNewSpace: () => void;
  onSelectRun: (id: string) => void;
}) {
  const activeCount = spaces.filter((s) => s.status === "active").length;
  const errorCount = spaces.filter((s) => s.status === "error").length;
  const composioCount = spaces.reduce((count, space) => count + space.tools.filter(isComposioTool).length, 0);

  return (
    <div>
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Text variant="heading2" as="h1">
            Spaces
          </Text>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-kumo-subtle">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-kumo-hairline bg-kumo-base px-2 py-1">
              <StackIcon size={14} />
              <Text variant="secondary" size="xs">{spaces.length} spaces</Text>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-kumo-hairline bg-kumo-base px-2 py-1">
              <ActivityIcon size={14} />
              <Text variant="secondary" size="xs">{activeCount} active</Text>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-kumo-hairline bg-kumo-base px-2 py-1">
              <WrenchIcon size={14} />
              <Text variant="secondary" size="xs">{composioCount} Composio</Text>
            </span>
            {errorCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-kumo-hairline bg-kumo-base px-2 py-1 text-kumo-danger">
                <WarningIcon size={14} />
                <Text variant="error" size="xs">{errorCount} needs attention</Text>
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
          <Badge variant="success" appearance="dot">
            {slackWorkspace.name || slackWorkspace.teamId}
          </Badge>
          <Button
            variant="secondary"
            icon={ArrowClockwiseIcon}
            onClick={() => {
              window.location.href = "/api/slack/oauth/start";
            }}
          >
            Reconnect Slack
          </Button>
          <Button variant="primary" icon={PlusIcon} onClick={onNewSpace}>
            New Space
          </Button>
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
        {spaces.map((space) => (
          <SpaceProjectCard
            key={space.id}
            space={space}
            recentRun={runs.find((run) => run.spaceId === space.id)}
            onClick={() => onSelectSpace(space.id)}
          />
        ))}
      </div>
    </div>
  );
}

function SpaceProjectCard({
  space,
  recentRun,
  onClick,
}: {
  space: Space;
  recentRun?: Run;
  onClick: () => void;
}) {
  const Icon = getSpaceIcon(space.id);
  const composioTools = space.tools.filter(isComposioTool);
  const nativeTools = space.tools.filter((tool) => !isComposioTool(tool));
  const centerTools = [
    { id: "tags", name: "Tags", logoUrl: undefined },
    ...composioTools.slice(0, 2),
  ];

  return (
    <LayerCard
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      className="group w-[calc(100vw-2rem)] min-w-0 cursor-pointer overflow-hidden p-0 transition-colors hover:bg-kumo-base focus-visible:ring-2 focus-visible:ring-kumo-focus md:w-full"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <Text bold truncate as="div">{space.name}</Text>
          <div className="mt-1 flex items-center gap-1.5 text-kumo-subtle">
            <HashIcon size={12} />
            <Text variant="secondary" size="xs" truncate>{space.channel}</Text>
          </div>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-md border border-kumo-hairline bg-kumo-base text-kumo-subtle">
          <Icon size={16} weight="regular" />
        </div>
      </div>

      <div className="px-2 pb-2">
        <div className="relative h-44 overflow-hidden rounded-md border border-kumo-hairline bg-kumo-recessed">
          <div
            className="absolute inset-0 opacity-60"
            style={{
              backgroundImage: "radial-gradient(var(--color-kumo-line) 1px, transparent 1px)",
              backgroundSize: "10px 10px",
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex items-center gap-2">
              {centerTools.map((tool) => (
                <div
                  key={tool.id}
                  className="flex h-10 w-10 items-center justify-center rounded-md border border-kumo-line bg-kumo-base text-kumo-default shadow-sm transition-transform group-hover:-translate-y-0.5"
                >
                  {tool.id === "tags" ? (
                    <RobotIcon size={20} weight="duotone" />
                  ) : (
                    <ToolLogo tool={tool} size="base" />
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-3">
            <StatusLine space={space} />
            <div className="hidden items-center gap-2 text-kumo-subtle sm:flex">
              <span className="inline-flex items-center gap-1">
                <WrenchIcon size={12} />
                <Text variant="secondary" size="xs">{displayToolCount(nativeTools.length + composioTools.length)}</Text>
              </span>
              <span className="inline-flex items-center gap-1">
                <ActivityIcon size={12} />
                <Text variant="secondary" size="xs">{space.runCount.toLocaleString()}</Text>
              </span>
            </div>
          </div>
        </div>
      </div>

      {recentRun && (
        <div className="flex items-center justify-between gap-3 border-t border-kumo-hairline px-4 py-2.5">
          <div className="min-w-0">
            <Text variant="secondary" size="xs" truncate>{recentRun.triggeredBy}</Text>
          </div>
          <div className="flex items-center gap-1.5 text-kumo-subtle">
            <ClockIcon size={12} />
            <Text variant="secondary" size="xs" truncate>{space.lastRun}</Text>
          </div>
        </div>
      )}
    </LayerCard>
  );
}

function SpaceDetailView({
  space,
  runs,
  onBack,
  onAuthTool,
  onAddTool,
  onRemoveTool,
  onAddRepo,
  onSetDefaultRepo,
  onRemoveRepo,
  onSelectRun,
}: {
  space: Space;
  runs: Run[];
  onBack: () => void;
  onAuthTool: (spaceId: string, toolId: string) => void;
  onAddTool: (spaceId: string, composio: ComposioDirectoryTool) => void;
  onRemoveTool: (spaceId: string, toolId: string) => void;
  onAddRepo: (spaceId: string, name: string) => void;
  onSetDefaultRepo: (spaceId: string, repoId: string) => void;
  onRemoveRepo: (spaceId: string, repoId: string) => void;
  onSelectRun: (id: string) => void;
}) {
  const spaceRuns = runs.filter((r) => r.spaceId === space.id);
  const [tab, setTab] = useState("overview");
  const [addRepoOpen, setAddRepoOpen] = useState(false);
  const [addToolOpen, setAddToolOpen] = useState(false);
  const [newRepoName, setNewRepoName] = useState("");
  const [toolSearch, setToolSearch] = useState("");
  const [directorySource, setDirectorySource] = useState<"composio" | "fallback">("fallback");
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [composioDirectory, setComposioDirectory] = useState<ComposioDirectoryTool[]>([]);
  const nativeTools = space.tools.filter((tool) => !isComposioTool(tool));
  const composioTools = space.tools.filter(isComposioTool);
  const connectedComposioTools = composioTools.filter((tool) => tool.authState === "connected");
  const visibleDirectory = composioDirectory.filter((tool) => {
    const query = toolSearch.trim().toLowerCase();
    if (!query) return true;
    return (
      tool.name.toLowerCase().includes(query) ||
      tool.id.toLowerCase().includes(query) ||
      tool.description.toLowerCase().includes(query) ||
      tool.categories.some((category) => category.toLowerCase().includes(query))
    );
  });

  useEffect(() => {
    if (!addToolOpen || composioDirectory.length > 0 || directoryLoading) return;
    setDirectoryLoading(true);
    loadComposioDirectory()
      .then((payload) => {
        setComposioDirectory(payload.items);
        setDirectorySource(payload.source);
      })
      .catch(() => {
        setComposioDirectory([]);
        setDirectorySource("fallback");
      })
      .finally(() => setDirectoryLoading(false));
  }, [addToolOpen, composioDirectory.length, directoryLoading]);

  return (
    <div>
      <BackLink label="All Spaces" onClick={onBack} />
      <PageHeader
        title={space.name}
        description={`#${space.channel}`}
        actions={
          <Button variant="secondary" icon={ArrowClockwiseIcon}>
            Restart
          </Button>
        }
      />

      <div className="flex items-center gap-3 mb-6">
        <SpaceStatusBadge status={space.status} />
        <Text variant="secondary" size="sm">
          {space.recentActivity}
        </Text>
      </div>

      <MetricGrid
        metrics={[
          { label: "Total runs", value: space.runCount.toLocaleString(), icon: <ActivityIcon size={14} /> },
          { label: "Tokens (30d)", value: (space.tokenUsage / 1_000_000).toFixed(2) + "M", icon: <CpuIcon size={14} /> },
          { label: "Est. cost (30d)", value: "$" + space.cost.toFixed(2), icon: <CoinsIcon size={14} /> },
        ]}
      />

      <Tabs
        variant="underline"
        value={tab}
        onValueChange={setTab}
        className="mb-6"
        tabs={[
          { value: "overview", label: "Overview" },
          { value: "tools", label: `Tools (${composioTools.length})` },
          { value: "runs", label: `Runs (${spaceRuns.length})` },
        ]}
      />

      {tab === "overview" && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <LayerCard>
              <LayerCard.Secondary className="flex items-center gap-2">
                <PlayIcon size={14} className="text-kumo-subtle" />
                <Text bold>Runs — last 7 days</Text>
              </LayerCard.Secondary>
              <LayerCard.Primary>
                <div className="h-36 -mx-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={SPACE_RUNS_PER_DAY} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="2 4" stroke="var(--color-kumo-hairline)" vertical={false} />
                      <XAxis dataKey="d" tick={{ fontSize: 10, fill: CHART_MUTED }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: CHART_MUTED }} axisLine={false} tickLine={false} width={28} />
                      <Tooltip {...ChartTooltipStyle()} cursor={{ fill: "var(--color-kumo-tint)" }} />
                      <Bar dataKey="runs" fill={CHART_BRAND} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </LayerCard.Primary>
            </LayerCard>

            <LayerCard>
              <LayerCard.Secondary className="flex items-center gap-2">
                <CpuIcon size={14} className="text-kumo-subtle" />
                <Text bold>Tokens — last 7 days (k)</Text>
              </LayerCard.Secondary>
              <LayerCard.Primary>
                <div className="h-36 -mx-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={SPACE_TOKEN_TREND} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="tokGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={CHART_BRAND} stopOpacity={0.35} />
                          <stop offset="100%" stopColor={CHART_BRAND} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="2 4" stroke="var(--color-kumo-hairline)" vertical={false} />
                      <XAxis dataKey="d" tick={{ fontSize: 10, fill: CHART_MUTED }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: CHART_MUTED }} axisLine={false} tickLine={false} width={28} />
                      <Tooltip {...ChartTooltipStyle()} />
                      <Area type="monotone" dataKey="tokens" stroke={CHART_BRAND} strokeWidth={2} fill="url(#tokGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </LayerCard.Primary>
            </LayerCard>
          </div>

          <LayerCard>
            <LayerCard.Secondary className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitBranchIcon size={14} className="text-kumo-subtle" />
                <Text bold>Repositories ({space.repos.length})</Text>
              </div>
              <Button
                variant="secondary"
                size="sm"
                icon={PlusIcon}
                onClick={() => setAddRepoOpen(true)}
              >
                Add repo
              </Button>
            </LayerCard.Secondary>
            <LayerCard.Primary>
              {space.repos.length === 0 ? (
                <Text variant="secondary" size="sm">No repositories connected. Add one to give the agent code context.</Text>
              ) : (
                <div className="flex flex-col divide-y divide-kumo-hairline -my-2">
                  {space.repos.map((repo) => (
                    <div key={repo.id} className="flex items-center gap-3 py-2.5">
                      <GitBranchIcon size={16} className="text-kumo-subtle shrink-0" />
                      <Text size="sm">{repo.name}</Text>
                      {repo.isDefault && <Badge variant="primary">Default</Badge>}
                      <div className="ml-auto flex items-center gap-1">
                        {!repo.isDefault && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onSetDefaultRepo(space.id, repo.id)}
                          >
                            Set default
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          shape="square"
                          icon={XIcon}
                          aria-label={`Disconnect ${repo.name}`}
                          onClick={() => onRemoveRepo(space.id, repo.id)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </LayerCard.Primary>
          </LayerCard>
        </div>
      )}

      {tab === "tools" && (
        <LayerCard className="p-0">
          <div className="flex flex-col gap-3 border-b border-kumo-hairline px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="success" appearance="dot">{nativeTools.length} always on</Badge>
              <Badge
                variant={composioTools.length === 0 ? "neutral" : connectedComposioTools.length === composioTools.length ? "success" : "warning"}
                appearance="dot"
              >
                {connectedComposioTools.length}/{composioTools.length} Composio connected
              </Badge>
            </div>
            <Button
              variant="primary"
              size="sm"
              icon={PlusIcon}
              onClick={() => setAddToolOpen(true)}
            >
              New tool
            </Button>
          </div>

          <div className="border-b border-kumo-hairline p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <RobotIcon size={16} className="text-kumo-subtle" />
                <Text bold>Internal tools</Text>
              </div>
              <Badge variant="neutral" appearance="dot">Always enabled</Badge>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {nativeTools.map((tool) => (
                <div key={tool.id} className="flex min-w-0 items-center gap-3 rounded-md border border-kumo-hairline bg-kumo-base px-3 py-2">
                  <ToolLogo tool={tool} size="sm" />
                  <div className="min-w-0">
                    <Text size="sm" truncate>{tool.name}</Text>
                    <Text variant="secondary" size="xs" truncate>{tool.description}</Text>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <WrenchIcon size={16} className="text-kumo-subtle" />
                <Text bold>Composio tools</Text>
              </div>
              <Text variant="secondary" size="xs">{displayToolCount(composioTools.length)}</Text>
            </div>

            {composioTools.length === 0 ? (
              <Empty
                icon={<WrenchIcon size={40} />}
                title="No Composio tools connected"
                description="Open the directory to connect external tools."
              />
            ) : (
              <div className="flex flex-col divide-y divide-kumo-hairline rounded-md border border-kumo-hairline">
                {composioTools.map((tool) => (
                  <div key={tool.id} className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center">
                    <ToolLogo tool={tool} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Text bold size="sm">{tool.name}</Text>
                        {tool.toolsCount ? <Badge variant="neutral">{displayToolCount(tool.toolsCount)}</Badge> : null}
                      </div>
                      <Text variant="secondary" size="xs" truncate as="p">
                        {tool.description}
                      </Text>
                    </div>
                    {tool.authState === "connected" ? (
                      <Badge variant="success" appearance="dot">Connected</Badge>
                    ) : tool.authState === "requires_auth" ? (
                      <Badge variant="warning" appearance="dot">Auth required</Badge>
                    ) : (
                      <Badge variant="neutral" appearance="dot">Not connected</Badge>
                    )}
                    <div className="flex items-center gap-1 sm:justify-end">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onAuthTool(space.id, tool.id)}
                      >
                        {tool.authState === "connected" ? "Reconnect" : "Connect"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        shape="square"
                        icon={XIcon}
                        aria-label={`Remove ${tool.name}`}
                        onClick={() => onRemoveTool(space.id, tool.id)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </LayerCard>
      )}

      {/* Add repository dialog */}
      <Dialog.Root open={addRepoOpen} onOpenChange={setAddRepoOpen}>
        <Dialog className="p-6 max-w-md">
          <div className="flex items-start justify-between gap-4 mb-4">
            <Dialog.Title>
              <Text variant="heading3">Connect a repository</Text>
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              render={(p) => (
                <Button {...p} variant="ghost" shape="square" size="sm" icon={XIcon} aria-label="Close" />
              )}
            />
          </div>
          <Dialog.Description>
            <Text variant="secondary" size="sm">
              Give the agent access to a GitHub repository for code context.
            </Text>
          </Dialog.Description>
          <div className="mt-4">
            <Field label="Repository" description="Format: org/repo">
              <Input
                placeholder="acme/monorepo"
                value={newRepoName}
                onChange={(e) => setNewRepoName(e.target.value)}
                autoFocus
              />
            </Field>
          </div>
          <div className="flex items-center justify-end gap-2 mt-6">
            <Dialog.Close
              render={(p) => (
                <Button {...p} variant="ghost">
                  Cancel
                </Button>
              )}
            />
            <Button
              variant="primary"
              disabled={!newRepoName.trim()}
              onClick={() => {
                onAddRepo(space.id, newRepoName.trim());
                setNewRepoName("");
                setAddRepoOpen(false);
              }}
            >
              Connect
            </Button>
          </div>
        </Dialog>
      </Dialog.Root>

      {/* Add tool from Composio directory */}
      <Dialog.Root open={addToolOpen} onOpenChange={setAddToolOpen}>
        <Dialog className="p-0 max-w-4xl" size="xl">
          <div className="flex flex-col gap-4 border-b border-kumo-hairline px-6 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Dialog.Title>
                  <Text variant="heading3">Composio directory</Text>
                </Dialog.Title>
                <Dialog.Description>
                  <Text variant="secondary" size="sm">
                    Connect external toolkits to this Space.
                  </Text>
                </Dialog.Description>
              </div>
              <Dialog.Close
                aria-label="Close"
                render={(p) => (
                  <Button {...p} variant="ghost" shape="square" size="sm" icon={XIcon} aria-label="Close" />
                )}
              />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Input
                size="sm"
                value={toolSearch}
                onChange={(event) => setToolSearch(event.target.value)}
                placeholder="Search toolkits"
                aria-label="Search Composio toolkits"
                className="min-w-0 flex-1"
              />
              <div className="flex items-center gap-2">
                <Badge variant={directorySource === "composio" ? "success" : "neutral"} appearance="dot">
                  {directorySource === "composio" ? "Live directory" : "Directory cache"}
                </Badge>
                <Text variant="secondary" size="xs">{visibleDirectory.length} shown</Text>
              </div>
            </div>
          </div>
          <div className="max-h-[560px] overflow-y-auto p-3">
            {directoryLoading ? (
              <Empty
                icon={<ArrowClockwiseIcon size={40} />}
                title="Loading directory"
                description="Fetching Composio toolkits."
              />
            ) : visibleDirectory.length === 0 ? (
              <Empty
                icon={<MagnifyingGlassIcon size={40} />}
                title="No tools found"
                description="Try another search."
              />
            ) : (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {visibleDirectory.map((toolkit) => {
                  const connectedTool = composioTools.find((tool) => tool.id === toolkit.id);
                  const isConnected = connectedTool?.authState === "connected";
                  const isAdded = Boolean(connectedTool);

                  return (
                    <div
                      key={toolkit.id}
                      className="flex min-w-0 items-start gap-3 rounded-md border border-kumo-hairline bg-kumo-base p-3"
                    >
                      <ToolLogo tool={toolkit} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Text bold size="sm" truncate>{toolkit.name}</Text>
                          {toolkit.toolsCount ? <Badge variant="neutral">{displayToolCount(toolkit.toolsCount)}</Badge> : null}
                        </div>
                        <Text variant="secondary" size="xs" as="p" truncate>
                          {toolkit.description}
                        </Text>
                        {toolkit.categories.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {toolkit.categories.slice(0, 2).map((category) => (
                              <Badge key={category} variant="secondary">{category}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <Button
                        variant={isConnected ? "secondary" : "primary"}
                        size="sm"
                        onClick={() => {
                          onAddTool(space.id, toolkit);
                          setAddToolOpen(false);
                        }}
                      >
                        {isConnected ? "Reconnect" : isAdded ? "Connect" : "Connect"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Dialog>
      </Dialog.Root>

      {tab === "runs" && (
        <LayerCard className="p-0">
          {spaceRuns.length === 0 ? (
            <Empty
              icon={<ActivityIcon size={40} />}
              title="No runs yet"
              description="This space hasn't triggered any agent runs."
            />
          ) : (
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.Head>Status</Table.Head>
                  <Table.Head>Run</Table.Head>
                  <Table.Head>Triggered by</Table.Head>
                  <Table.Head>Started</Table.Head>
                  <Table.Head>Duration</Table.Head>
                  <Table.Head>Calls</Table.Head>
                  <Table.Head />
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {spaceRuns.map((run) => (
                  <Table.Row
                    key={run.id}
                    className="cursor-pointer"
                    onClick={() => onSelectRun(run.id)}
                  >
                    <Table.Cell><RunStatusBadge status={run.status} /></Table.Cell>
                    <Table.Cell><Text variant="secondary" size="xs">{run.id}</Text></Table.Cell>
                    <Table.Cell><Text variant="secondary" size="xs">{run.triggeredBy}</Text></Table.Cell>
                    <Table.Cell><Text variant="secondary" size="xs">{run.startedAt}</Text></Table.Cell>
                    <Table.Cell><Text variant="secondary" size="xs">{run.duration}</Text></Table.Cell>
                    <Table.Cell><Text size="xs">{run.toolCalls}</Text></Table.Cell>
                    <Table.Cell><CaretRightIcon size={14} className="text-kumo-subtle" /></Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          )}
        </LayerCard>
      )}
    </div>
  );
}

const SPACE_ICONS: Record<string, ComponentType<{ size?: number; weight?: "fill" | "duotone" | "regular"; className?: string }>> = {
  sp_01: HeadsetIcon,
  sp_02: CodeIcon,
  sp_03: ChartLineUpIcon,
  sp_04: RocketIcon,
};

function getSpaceIcon(id: string) {
  return SPACE_ICONS[id] ?? RobotIcon;
}

const ACTION_META: Record<
  string,
  { icon: ComponentType<{ size?: number; className?: string }>; variant: "warning" | "info" | "error" | "primary" }
> = {
  search_thread: { icon: ChatCircleIcon, variant: "info" },
  search_channel: { icon: HashIcon, variant: "info" },
  search_memory: { icon: DatabaseIcon, variant: "info" },
  save_memory: { icon: DatabaseIcon, variant: "primary" },
  session_search: { icon: MagnifyingGlassIcon, variant: "info" },
  create_artifact: { icon: FileTextIcon, variant: "primary" },
  run_coding_agent: { icon: CodeIcon, variant: "primary" },
  ask_user: { icon: ChatCircleIcon, variant: "info" },
  create_schedule: { icon: ClockIcon, variant: "warning" },
  deploy: { icon: RocketIcon, variant: "warning" },
  send_email: { icon: EnvelopeIcon, variant: "info" },
  github_write: { icon: GitPullRequestIcon, variant: "primary" },
  search_docs: { icon: MagnifyingGlassIcon, variant: "info" },
  run_query: { icon: DatabaseIcon, variant: "info" },
  slack_post: { icon: ChatCircleIcon, variant: "info" },
  github_read: { icon: GitBranchIcon, variant: "info" },
  github: { icon: GitBranchIcon, variant: "primary" },
  linear: { icon: WrenchIcon, variant: "info" },
  slack: { icon: ChatCircleIcon, variant: "info" },
  notion: { icon: FileTextIcon, variant: "info" },
  jira: { icon: WrenchIcon, variant: "info" },
  gmail: { icon: EnvelopeIcon, variant: "info" },
  googlecalendar: { icon: ClockIcon, variant: "warning" },
  googledrive: { icon: FileTextIcon, variant: "info" },
  sentry: { icon: WarningIcon, variant: "warning" },
  pagerduty: { icon: LightningIcon, variant: "warning" },
  datadog: { icon: ActivityIcon, variant: "info" },
  stripe: { icon: CoinsIcon, variant: "primary" },
  hubspot: { icon: ChartLineUpIcon, variant: "info" },
  zendesk: { icon: HeadsetIcon, variant: "info" },
  figma: { icon: CodeIcon, variant: "info" },
  vercel: { icon: RocketIcon, variant: "primary" },
};

function ActionIcon({ action, size = 16 }: { action: string; size?: number }) {
  const meta = ACTION_META[action];
  const Icon = meta?.icon ?? WrenchIcon;
  return <Icon size={size} className="text-kumo-subtle" />;
}

function ApprovalsView({
  approvals,
  onApprove,
  onReject,
}: {
  approvals: Approval[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  return (
    <div>
      <PageHeader
        title="Pending approvals"
        description="Actions the agent is waiting for you to review."
        actions={
          approvals.length > 0 ? (
            <Badge variant="warning">{approvals.length} pending</Badge>
          ) : undefined
        }
      />

      {approvals.length === 0 ? (
        <LayerCard>
          <LayerCard.Primary>
            <Empty
              icon={<CheckIcon size={40} />}
              title="No pending approvals"
              description="All caught up. New approval requests will appear here."
            />
          </LayerCard.Primary>
        </LayerCard>
      ) : (
        <div className="flex flex-col gap-3">
          {approvals.map((apr) => (
            <LayerCard key={apr.id}>
              <LayerCard.Secondary className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <ActionIcon action={apr.action} />
                  <Badge variant={ACTION_META[apr.action]?.variant ?? "warning"}>{apr.action}</Badge>
                  <Text bold truncate>{apr.description}</Text>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="secondary-destructive"
                    size="sm"
                    icon={XIcon}
                    onClick={() => onReject(apr.id)}
                  >
                    Reject
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    icon={CheckIcon}
                    onClick={() => onApprove(apr.id)}
                  >
                    Approve
                  </Button>
                </div>
              </LayerCard.Secondary>
              <LayerCard.Primary>
                <div className="flex flex-col gap-3">
                  <Text variant="secondary" size="sm" as="p">
                    {apr.context}
                  </Text>
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="inline-flex items-center gap-1 text-kumo-subtle">
                      <RobotIcon size={12} />
                      <Text variant="secondary" size="xs">{apr.spaceName}</Text>
                    </span>
                    <span className="inline-flex items-center gap-1 text-kumo-subtle">
                      <HashIcon size={12} />
                      <Text variant="secondary" size="xs">{apr.channel}</Text>
                    </span>
                    <span className="inline-flex items-center gap-1 text-kumo-subtle">
                      <ClockIcon size={12} />
                      <Text variant="secondary" size="xs">{apr.requestedAt}</Text>
                    </span>
                  </div>
                </div>
              </LayerCard.Primary>
            </LayerCard>
          ))}
        </div>
      )}
    </div>
  );
}

function RunsView({ runs, onSelectRun }: { runs: Run[]; onSelectRun: (id: string) => void }) {
  const totals = runs.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<RunStatus, number>
  );
  return (
    <div>
      <PageHeader
        title="Runs"
        description="Every agent execution across all Spaces."
      />

      <div className="mb-6">
        <LayerCard>
          <LayerCard.Secondary className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ActivityIcon size={14} className="text-kumo-subtle" />
              <Text bold>Activity — last 24 hours</Text>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-kumo-info" />
                <Text variant="secondary" size="xs">
                  {ACTIVITY_24H.reduce((a, x) => a + x.runs, 0)} runs
                </Text>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-kumo-danger" />
                <Text variant="secondary" size="xs">
                  {ACTIVITY_24H.reduce((a, x) => a + x.failed, 0)} failed
                </Text>
              </div>
            </div>
          </LayerCard.Secondary>
          <LayerCard.Primary>
            <div className="h-44 -mx-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={ACTIVITY_24H} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="runsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_BRAND} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={CHART_BRAND} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--color-kumo-hairline)" vertical={false} />
                  <XAxis dataKey="h" tick={{ fontSize: 10, fill: CHART_MUTED }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: CHART_MUTED }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip {...ChartTooltipStyle()} />
                  <Area type="monotone" dataKey="runs" stroke={CHART_BRAND} strokeWidth={2} fill="url(#runsGrad)" />
                  <Area type="monotone" dataKey="failed" stroke={CHART_DANGER} strokeWidth={1.5} fill="transparent" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </LayerCard.Primary>
        </LayerCard>

      </div>

      <LayerCard className="p-0">
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.Head>Status</Table.Head>
              <Table.Head>Run</Table.Head>
              <Table.Head>Space</Table.Head>
              <Table.Head>Channel</Table.Head>
              <Table.Head>Triggered by</Table.Head>
              <Table.Head>Started</Table.Head>
              <Table.Head>Duration</Table.Head>
              <Table.Head>Calls</Table.Head>
              <Table.Head />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {runs.map((run) => (
              <Table.Row
                key={run.id}
                className="cursor-pointer"
                onClick={() => onSelectRun(run.id)}
              >
                <Table.Cell><RunStatusBadge status={run.status} /></Table.Cell>
                <Table.Cell><Text variant="secondary" size="xs">{run.id}</Text></Table.Cell>
                <Table.Cell><Text>{run.spaceName}</Text></Table.Cell>
                <Table.Cell>
                  <span className="inline-flex items-center gap-1 text-kumo-subtle">
                    <HashIcon size={12} />
                    <Text variant="secondary" size="xs">{run.channel}</Text>
                  </span>
                </Table.Cell>
                <Table.Cell><Text variant="secondary" size="xs">{run.triggeredBy}</Text></Table.Cell>
                <Table.Cell><Text variant="secondary" size="xs">{run.startedAt}</Text></Table.Cell>
                <Table.Cell><Text variant="secondary" size="xs">{run.duration}</Text></Table.Cell>
                <Table.Cell><Text size="xs">{run.toolCalls}</Text></Table.Cell>
                <Table.Cell><CaretRightIcon size={14} className="text-kumo-subtle" /></Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </LayerCard>
    </div>
  );
}

function RunDetailView({ run, events, onBack }: { run: Run; events: RunEvent[]; onBack: () => void }) {
  const eventIconMap: Record<RunEventType, ReactNode> = {
    start: <PlayIcon size={14} className="text-kumo-subtle" />,
    tool_call: <LightningIcon size={14} className="text-kumo-info" />,
    approval: <ShieldCheckIcon size={14} className="text-kumo-warning" />,
    error: <WarningIcon size={14} className="text-kumo-danger" />,
    artifact: <FileTextIcon size={14} className="text-kumo-info" />,
    end: <CheckIcon size={14} className="text-kumo-success" />,
  };

  return (
    <div>
      <BackLink label="All runs" onClick={onBack} />
      <PageHeader
        title={run.spaceName}
        description={run.id}
        actions={<RunStatusBadge status={run.status} />}
      />

      <MetricGrid
        metrics={[
          { label: "Started", value: run.startedAt, icon: <ClockIcon size={14} /> },
          { label: "Duration", value: run.duration, icon: <ActivityIcon size={14} /> },
          { label: "Tool calls", value: run.toolCalls, icon: <LightningIcon size={14} /> },
          { label: "Triggered by", value: run.triggeredBy, icon: <RobotIcon size={14} /> },
        ]}
      />

      <SectionHeader title="Timeline" />
      {events.length === 0 ? (
        <LayerCard>
          <LayerCard.Primary>
            <Empty
              icon={<ActivityIcon size={40} />}
              title="No timeline events"
              description="This run hasn't produced timeline entries yet."
            />
          </LayerCard.Primary>
        </LayerCard>
      ) : (
        <div className="flex flex-col">
          {events.map((event, i) => {
            const isLast = i === events.length - 1;
            return (
              <div key={event.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <Surface
                    variant="raised"
                    className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 z-10"
                  >
                    {eventIconMap[event.type]}
                  </Surface>
                  {!isLast && (
                    <div className="w-px flex-1 bg-kumo-hairline my-1" />
                  )}
                </div>
                <div className={cn("flex-1", !isLast && "pb-4")}>
                  <LayerCard>
                    <LayerCard.Secondary className="flex items-center gap-3">
                      <Text variant="secondary" size="xs">
                        {event.time}
                      </Text>
                      <Text bold>{event.label}</Text>
                      {event.status && (
                        <div className="ml-auto">
                          <Badge
                            variant={
                              event.status === "success"
                                ? "success"
                                : event.status === "failed"
                                ? "error"
                                : "warning"
                            }
                            appearance="dot"
                          >
                            {event.status}
                          </Badge>
                        </div>
                      )}
                    </LayerCard.Secondary>
                    <LayerCard.Primary>
                      <Text variant="secondary" size="xs" as="p">
                        {event.detail}
                      </Text>
                    </LayerCard.Primary>
                  </LayerCard>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NewSpaceDialog({
  open,
  onOpenChange,
  onCreate,
  existingChannels,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string, channel: string, channelId?: string) => Promise<void>;
  existingChannels: string[];
}) {
  const [name, setName] = useState("");
  const [channelQuery, setChannelQuery] = useState("");
  const [selectedChannel, setSelectedChannel] = useState<SlackChannel | null>(null);
  const [channels, setChannels] = useState<SlackChannel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [channelError, setChannelError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setChannelsLoading(true);
    setChannelError(null);
    loadSlackChannels()
      .then((payload) => {
        setChannels(payload.channels);
      })
      .catch((error) => {
        setChannels([]);
        setChannelError(error instanceof Error ? error.message : "Failed to load Slack channels");
      })
      .finally(() => setChannelsLoading(false));
  }, [open]);

  const existingChannelSet = new Set(existingChannels.map((channel) => channel.replace(/^#/, "").toLowerCase()));
  const availableChannels = channels.filter(
    (channel) => !existingChannelSet.has(channel.name.toLowerCase()) && !existingChannelSet.has(channel.id.toLowerCase())
  );
  const filteredChannels = availableChannels
    .filter((channel) => {
      const query = channelQuery.replace(/^#/, "").toLowerCase().trim();
      return !query || channel.name.toLowerCase().includes(query);
    })
    .slice(0, 24);

  const reset = () => {
    setName("");
    setChannelQuery("");
    setSelectedChannel(null);
    setSubmitting(false);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const channelName = selectedChannel?.name;
    if (!name.trim() || !selectedChannel || (selectedChannel.isPrivate && !selectedChannel.isMember)) return;
    setSubmitting(true);
    try {
      await onCreate(name.trim(), channelName, selectedChannel.id);
      reset();
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) reset();
      }}
    >
      <Dialog className="flex max-h-[calc(100vh-2rem)] max-w-2xl flex-col overflow-hidden p-0">
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-kumo-hairline p-4">
            <div>
              <Dialog.Title>New Space</Dialog.Title>
              <Dialog.Description>
                Connect an agent to a Slack channel.
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Close"
              render={(p) => (
                <Button {...p} variant="ghost" shape="square" size="sm" icon={XIcon} aria-label="Close" type="button" />
              )}
            />
          </div>

          <div className="flex min-h-0 flex-col gap-5 overflow-y-auto p-4">
            <Field label="Space name" description="Shown in the dashboard and Slack.">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Customer Support"
                aria-label="Space name"
                autoFocus
              />
            </Field>

            <Field
              label="Slack channel"
              description="Select a channel from your connected Slack workspace."
            >
              <div className="flex flex-col gap-3">
                <div className="relative">
                  <MagnifyingGlassIcon size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-kumo-subtle" />
                  <Input
                    value={selectedChannel ? selectedChannel.name : channelQuery}
                    onChange={(e) => {
                      setSelectedChannel(null);
                      setChannelQuery(e.target.value.replace(/^#/, ""));
                    }}
                    placeholder="Search channels"
                    aria-label="Slack channel"
                    className="pl-9"
                  />
                </div>

                <div className="max-h-56 overflow-y-auto rounded-md border border-kumo-hairline bg-kumo-base p-1">
                  {channelsLoading ? (
                    <div className="flex items-center gap-2 px-3 py-3 text-kumo-subtle">
                      <ArrowClockwiseIcon size={14} className="animate-spin" />
                      <Text variant="secondary" size="xs">Loading channels</Text>
                    </div>
                  ) : channelError ? (
                    <div className="px-3 py-3">
                      <Text variant="error" size="xs">{channelError}</Text>
                    </div>
                  ) : filteredChannels.length === 0 ? (
                    <div className="px-3 py-3">
                      <Text variant="secondary" size="xs">No matching channels.</Text>
                    </div>
                  ) : (
                    filteredChannels.map((channel) => {
                      const selected = selectedChannel?.id === channel.id;
                      return (
                        <button
                          key={channel.id}
                          type="button"
                          onClick={() => {
                            setSelectedChannel(channel);
                            setChannelQuery(channel.name);
                          }}
                          className={cn(
                            "flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left transition-colors",
                            selected ? "bg-kumo-tint text-kumo-default" : "text-kumo-subtle hover:bg-kumo-tint hover:text-kumo-default"
                          )}
                        >
                          <span className="inline-flex min-w-0 items-center gap-2">
                            <HashIcon size={14} className="shrink-0" />
                            <Text size="sm" truncate>{channel.name}</Text>
                          </span>
                          <span className="flex shrink-0 items-center gap-1">
                            <Badge variant={channel.isPrivate ? "warning" : "neutral"} appearance="dot">
                              {channel.isPrivate ? "Private" : "Public"}
                            </Badge>
                            {channel.isMember && <Badge variant="success" appearance="dot">Member</Badge>}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
                {selectedChannel?.isPrivate && !selectedChannel.isMember && (
                  <Text variant="secondary" size="xs" as="p">
                    Invite the Tags app to this private channel in Slack, then refresh channels.
                  </Text>
                )}
              </div>
            </Field>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-kumo-hairline p-4">
            <Dialog.Close
              render={(p) => (
                <Button {...p} variant="ghost" type="button">
                  Cancel
                </Button>
              )}
            />
            <Button
              variant="primary"
              type="submit"
              disabled={
                submitting ||
                !name.trim() ||
                !selectedChannel ||
                (selectedChannel.isPrivate && !selectedChannel.isMember)
              }
            >
              {submitting ? "Creating" : "Create Space"}
            </Button>
          </div>
        </form>
      </Dialog>
    </Dialog.Root>
  );
}

// ===== App =====

function DashboardApp({ clerkEnabled = false }: { clerkEnabled?: boolean }) {
  const [view, setView] = useState<View>({ page: "spaces" });
  const [newSpaceOpen, setNewSpaceOpen] = useState(false);
  const [slackWorkspace, setSlackWorkspace] = useState<SlackWorkspace | null>(null);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [eventsByRun, setEventsByRun] = useState<Record<string, RunEvent[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setError(null);
    const payload = await loadControlPlane();
    setSlackWorkspace(payload.slackWorkspace);
    setSpaces(payload.spaces);
    setRuns(payload.runs);
    setApprovals(payload.approvals);
  };

  useEffect(() => {
    refresh()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load control plane"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (view.page !== "run-detail" || eventsByRun[view.id]) return;
    loadRunEvents(view.id)
      .then((events) => setEventsByRun((prev) => ({ ...prev, [view.id]: events })))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load run events"));
  }, [eventsByRun, view]);

  const updateSpace = (spaceId: string, fn: (s: Space) => Space) =>
    setSpaces((prev) => prev.map((s) => (s.id === spaceId ? fn(s) : s)));

  const persistConnections = async (spaceId: string, enabledConnections: string[]) => {
    await updateSpaceConfig(spaceId, { enabledConnections });
    await refresh();
  };

  const persistRepos = async (spaceId: string, repos: Repo[]) => {
    await updateSpaceConfig(spaceId, { repoUrls: repos.map((repo) => repo.id) });
    await refresh();
  };

  const openConnectUrl = (url: string | null) => {
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleAuthTool = async (spaceId: string, toolId: string) => {
    updateSpace(spaceId, (s) => ({
      ...s,
      tools: s.tools.map((t) =>
        t.id === toolId ? { ...t, authState: "requires_auth", enabled: true } : t
      ),
    }));
    try {
      const auth = await authorizeComposioTool(spaceId, toolId);
      openConnectUrl(auth.connectUrl);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to authenticate tool");
      await refresh().catch(() => undefined);
    }
  };

  const handleAddTool = async (spaceId: string, composio: ComposioDirectoryTool) => {
    const space = spaces.find((s) => s.id === spaceId);
    if (!space) return;
    updateSpace(spaceId, (s) => ({
      ...s,
      tools: s.tools.some((tool) => tool.id === composio.id)
        ? s.tools.map((tool) =>
            tool.id === composio.id ? { ...tool, authState: "requires_auth", enabled: true } : tool
          )
        : [
            ...s.tools,
            {
              id: composio.id,
              name: composio.name,
              description: composio.description,
              provider: "Composio",
              kind: "composio",
              logoUrl: composio.logoUrl,
              categories: composio.categories,
              toolsCount: composio.toolsCount,
              enabled: true,
              authState: composio.noAuth ? "connected" : "requires_auth",
            },
          ],
    }));
    try {
      const auth = await authorizeComposioTool(spaceId, composio.id);
      openConnectUrl(auth.connectUrl);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add tool");
      await refresh().catch(() => undefined);
    }
  };

  const handleRemoveTool = async (spaceId: string, toolId: string) => {
    const space = spaces.find((s) => s.id === spaceId);
    if (!space) return;
    const enabledConnections = space.tools
      .filter((tool) => isComposioTool(tool) && tool.id !== toolId)
      .map((tool) => tool.id);
    updateSpace(spaceId, (s) => ({
      ...s,
      tools: s.tools.filter((t) => !isComposioTool(t) || t.id !== toolId),
    }));
    try {
      await persistConnections(spaceId, enabledConnections);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove tool");
      await refresh().catch(() => undefined);
    }
  };

  const normalizeRepo = (name: string) => {
    const value = name.trim();
    if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("git@")) return value;
    return `https://github.com/${value.replace(/^\/+/, "")}`;
  };

  const handleAddRepo = async (spaceId: string, name: string) => {
    const space = spaces.find((s) => s.id === spaceId);
    if (!space) return;
    const repoUrl = normalizeRepo(name);
    const repos = [...space.repos, { id: repoUrl, name, isDefault: space.repos.length === 0 }];
    updateSpace(spaceId, (s) => ({ ...s, repos }));
    try {
      await persistRepos(spaceId, repos);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add repository");
      await refresh().catch(() => undefined);
    }
  };

  const handleSetDefaultRepo = async (spaceId: string, repoId: string) => {
    const space = spaces.find((s) => s.id === spaceId);
    if (!space) return;
    const repos = space.repos.map((r) => ({ ...r, isDefault: r.id === repoId })).sort((a) => (a.id === repoId ? -1 : 1));
    updateSpace(spaceId, (s) => ({ ...s, repos }));
    try {
      await persistRepos(spaceId, repos);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update default repository");
      await refresh().catch(() => undefined);
    }
  };

  const handleRemoveRepo = async (spaceId: string, repoId: string) => {
    const space = spaces.find((s) => s.id === spaceId);
    if (!space) return;
    const repos = space.repos
      .filter((r) => r.id !== repoId)
      .map((repo, index) => ({ ...repo, isDefault: index === 0 }));
    updateSpace(spaceId, (s) => ({ ...s, repos }));
    try {
      await persistRepos(spaceId, repos);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove repository");
      await refresh().catch(() => undefined);
    }
  };

  const handleApprove = async (id: string) => {
    setApprovals((prev) => prev.filter((a) => a.id !== id));
    try {
      await respondToApproval(id, "approved");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve request");
      await refresh().catch(() => undefined);
    }
  };

  const handleReject = async (id: string) => {
    setApprovals((prev) => prev.filter((a) => a.id !== id));
    try {
      await respondToApproval(id, "rejected");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject request");
      await refresh().catch(() => undefined);
    }
  };

  const handleCreateSpace = async (name: string, channel: string, channelId?: string) => {
    try {
      await createSpace({ name, channel, channelId });
      await refresh();
      setView({ page: "spaces" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create space");
    }
  };

  const currentSpace =
    view.page === "space-detail" ? spaces.find((s) => s.id === view.id) : undefined;
  const currentRun =
    view.page === "run-detail" ? runs.find((r) => r.id === view.id) : undefined;

  const activeNav = ((): "spaces" | "approvals" | "runs" => {
    if (view.page === "approvals") return "approvals";
    if (view.page === "runs" || view.page === "run-detail") return "runs";
    return "spaces";
  })();

  return (
    <div data-mode="dark" className="min-h-screen w-full bg-kumo-canvas">
      <Sidebar.Provider
        defaultOpen={false}
        collapsible="icon"
        peekable
        className="min-h-screen"
      >
        <Sidebar>
          <Sidebar.Header>
            <div className="flex items-center gap-2 px-2 py-1 group-data-[state=collapsed]/sidebar:justify-center">
              <img
                src={tagsLogo}
                alt="Tags"
                className="w-6 h-6 rounded-md object-contain shrink-0"
              />
              <Text bold DANGEROUS_className="group-data-[state=collapsed]/sidebar:hidden">
                Tags
              </Text>
            </div>
          </Sidebar.Header>

          <Sidebar.Content>
            <Sidebar.Group>
              <Sidebar.GroupLabel>Manage</Sidebar.GroupLabel>
              <Sidebar.Menu>
                <Sidebar.MenuButton
                  icon={StackIcon}
                  active={activeNav === "spaces"}
                  onClick={() => setView({ page: "spaces" })}
                >
                  Spaces
                </Sidebar.MenuButton>
                <Sidebar.MenuButton
                  icon={ShieldCheckIcon}
                  active={activeNav === "approvals"}
                  onClick={() => setView({ page: "approvals" })}
                >
                  Approvals
                  {approvals.length > 0 && (
                    <Sidebar.MenuBadge>{approvals.length}</Sidebar.MenuBadge>
                  )}
                </Sidebar.MenuButton>
                <Sidebar.MenuButton
                  icon={ActivityIcon}
                  active={activeNav === "runs"}
                  onClick={() => setView({ page: "runs" })}
                >
                  Runs
                </Sidebar.MenuButton>
              </Sidebar.Menu>
            </Sidebar.Group>

          </Sidebar.Content>

          <Sidebar.Footer>
            {clerkEnabled ? <ClerkAccountFooter /> : <FallbackAccountFooter />}
          </Sidebar.Footer>
        </Sidebar>

        <main className="min-w-0 flex-1 overflow-y-auto bg-kumo-canvas">
          <div className="mx-auto max-w-6xl p-4 sm:p-6">
            {error && (
              <LayerCard className="mb-4 border-kumo-danger/40">
                <LayerCard.Primary>
                  <Text variant="error" size="sm">{error}</Text>
                </LayerCard.Primary>
              </LayerCard>
            )}
            {loading && (
              <div className="flex min-h-[240px] items-center justify-center">
                <Loader size="lg" />
              </div>
            )}
            {!loading && (
              <>
                {!slackWorkspace ? (
                  <SlackConnectEmpty />
                ) : (
                  <>
                    {view.page === "spaces" && (
                      <SpacesView
                        spaces={spaces}
                        runs={runs}
                        slackWorkspace={slackWorkspace}
                        onSelectSpace={(id) => setView({ page: "space-detail", id })}
                        onNewSpace={() => setNewSpaceOpen(true)}
                        onSelectRun={(id) => setView({ page: "run-detail", id })}
                      />
                    )}
                    {view.page === "space-detail" && currentSpace && (
                      <SpaceDetailView
                        space={currentSpace}
                        runs={runs}
                        onBack={() => setView({ page: "spaces" })}
                        onAuthTool={handleAuthTool}
                        onAddTool={handleAddTool}
                        onRemoveTool={handleRemoveTool}
                        onAddRepo={handleAddRepo}
                        onSetDefaultRepo={handleSetDefaultRepo}
                        onRemoveRepo={handleRemoveRepo}
                        onSelectRun={(id) => setView({ page: "run-detail", id })}
                      />
                    )}
                    {view.page === "approvals" && (
                      <ApprovalsView
                        approvals={approvals}
                        onApprove={handleApprove}
                        onReject={handleReject}
                      />
                    )}
                    {view.page === "runs" && (
                      <RunsView runs={runs} onSelectRun={(id) => setView({ page: "run-detail", id })} />
                    )}
                    {view.page === "run-detail" && currentRun && (
                      <RunDetailView
                        run={currentRun}
                        events={eventsByRun[currentRun.id] ?? []}
                        onBack={() => setView({ page: "runs" })}
                      />
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </main>
        {slackWorkspace && (
          <NewSpaceDialog
            open={newSpaceOpen}
            onOpenChange={setNewSpaceOpen}
            onCreate={handleCreateSpace}
            existingChannels={spaces.map((s) => s.channel)}
          />
        )}
      </Sidebar.Provider>
    </div>
  );
}

function ClerkGate() {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) {
    return (
      <div data-mode="dark" className="flex min-h-screen items-center justify-center bg-kumo-canvas">
        <Loader size="lg" />
      </div>
    );
  }

  if (!isSignedIn) return <SignInScreen />;

  return <DashboardApp clerkEnabled />;
}

export default function App({ clerkEnabled = false }: { clerkEnabled?: boolean }) {
  return clerkEnabled ? <ClerkGate /> : <DashboardApp clerkEnabled={false} />;
}
