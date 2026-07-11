import type { ComponentType, FormEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
  SignInButton,
  UserButton,
  useOrganization,
  useUser,
} from "@clerk/react";
import tagsLogo from "../imports/Group_101__5_.png";
import slackLogo from "../imports/slack-logo.png";
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
  InputArea,
  Switch,
  Tabs,
  Surface,
  Dialog,
  DropdownMenu,
  Collapsible,
  Code,
  cn,
} from "@cloudflare/kumo";
import {
  BrainIcon,
  HashIcon,
  StackIcon,
  ShieldCheckIcon,
  ActivityIcon,
  PlusIcon,
  CaretRightIcon,
  CaretLeftIcon,
  CaretDownIcon,
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
  GearSixIcon,
  WrenchIcon,
  HeadsetIcon,
  CodeIcon,
  ChartLineUpIcon,
  DotsThreeIcon,
  TrashIcon,
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
import { isGitHubToolkitConnected } from "@tags/core/composio-toolkits";
import {
  describeScheduleCadence,
  formatScheduleTimezone,
  scheduleTitleFromPrompt,
} from "@tags/core/schedule-display";
import {
  createSpace,
  deleteSpace as deleteSpaceRequest,
  authorizeComposioTool,
  createSpaceSchedule,
  loadControlPlane,
  loadComposioDirectory,
  loadComposioToolStatus,
  loadGitHubRepos,
  loadSpaceArtifacts,
  loadSpaceSchedules,
  loadSlackChannels,
  loadRunEvents,
  loadApprovals,
  respondToApproval,
  updateSpaceConfig,
  loadSpaceApprovalTools,
  setSpaceApprovalTool,
  loadToolkitActions,
  composioToolApprovalKey,
  type ActivityPoint,
  type Approval,
  type Artifact,
  type ComposioAction,
  type ComposioDirectoryTool,
  type GitHubRepo,
  type Repo,
  type Run,
  type RunEvent,
  type RunEventType,
  type RunStatus,
  type Schedule,
  type Space,
  type SpaceStatus,
  type SlackChannel,
  type Tool,
  type ToolAuthState,
} from "./api";
// ===== Types =====

type View =
  | { page: "spaces" }
  | { page: "space-detail"; id: string }
  | { page: "approvals" }
  | { page: "runs" }
  | { page: "run-detail"; id: string }
  | { page: "workspace" };

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
            <UserButton userProfileMode="modal" />
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

function SlackConnectEmpty() {
  return (
    <LayerCard className="w-full max-w-md">
      <Empty
        icon={<ChatCircleIcon size={40} />}
        title="Connect Slack workspace"
        description="Connect one Slack workspace to this Tags account before creating Spaces."
        contents={
          <Button
            variant="primary"
            icon={ArrowSquareOutIcon}
            onClick={() => {
              window.location.href = "/api/slack/oauth/start";
            }}
          >
            Connect Slack
          </Button>
        }
      />
    </LayerCard>
  );
}

// ===== Mock Data =====

const INITIAL_DAILY_USAGE = [
  { date: "2026-06-30", runs: 0, tokens: 0 },
  { date: "2026-07-01", runs: 0, tokens: 0 },
  { date: "2026-07-02", runs: 0, tokens: 0 },
  { date: "2026-07-03", runs: 0, tokens: 0 },
  { date: "2026-07-04", runs: 0, tokens: 0 },
  { date: "2026-07-05", runs: 0, tokens: 0 },
  { date: "2026-07-06", runs: 0, tokens: 0 },
];

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
    dailyUsage: INITIAL_DAILY_USAGE,
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
    dailyUsage: INITIAL_DAILY_USAGE,
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
    dailyUsage: INITIAL_DAILY_USAGE,
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
    dailyUsage: INITIAL_DAILY_USAGE,
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
  { id: "run_001", spaceId: "sp_01", spaceName: "Customer Support", channel: "support-bot", status: "success", startedAt: "Today, 14:32", duration: "18s", toolCalls: 3, trigger: "mention", triggeredBy: "@dana" },
  { id: "run_002", spaceId: "sp_02", spaceName: "Engineering Assistant", channel: "eng-help", status: "running", startedAt: "Today, 14:28", duration: "4m 12s", toolCalls: 7, trigger: "mention", triggeredBy: "@marcus" },
  { id: "run_003", spaceId: "sp_04", spaceName: "DevOps Monitor", channel: "devops-alerts", status: "failed", startedAt: "Today, 13:51", duration: "2s", toolCalls: 1, trigger: "schedule", triggeredBy: "scheduled" },
  { id: "run_004", spaceId: "sp_01", spaceName: "Customer Support", channel: "support-bot", status: "success", startedAt: "Today, 13:44", duration: "31s", toolCalls: 5, trigger: "mention", triggeredBy: "@priya" },
  { id: "run_005", spaceId: "sp_02", spaceName: "Engineering Assistant", channel: "eng-help", status: "success", startedAt: "Today, 13:20", duration: "1m 02s", toolCalls: 4, trigger: "mention", triggeredBy: "@tom" },
  { id: "run_006", spaceId: "sp_04", spaceName: "DevOps Monitor", channel: "devops-alerts", status: "pending", startedAt: "Today, 12:58", duration: "—", toolCalls: 2, trigger: "schedule", triggeredBy: "scheduled" },
  { id: "run_007", spaceId: "sp_01", spaceName: "Customer Support", channel: "support-bot", status: "success", startedAt: "Today, 12:33", duration: "22s", toolCalls: 4, trigger: "mention", triggeredBy: "@lee" },
  { id: "run_008", spaceId: "sp_03", spaceName: "Sales Intelligence", channel: "sales-team", status: "success", startedAt: "Jul 1, 09:17", duration: "44s", toolCalls: 6, trigger: "mention", triggeredBy: "@alex" },
];

const INITIAL_APPROVALS: Approval[] = [
  {
    id: "apr_001",
    spaceId: "sp_04",
    spaceName: "DevOps Monitor",
    summary: "Deploy to production cluster",
    requestedAt: "Today, 12:58",
  },
  {
    id: "apr_002",
    spaceId: "sp_01",
    spaceName: "Customer Support",
    summary: "Send refund confirmation email",
    requestedAt: "Today, 14:05",
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

const RUN_STATUS_DISTRIBUTION = [
  { name: "Success", value: 812, color: "var(--color-kumo-success, #16a34a)" },
  { name: "Failed", value: 24, color: "var(--color-kumo-danger, #dc2626)" },
  { name: "Running", value: 6, color: "var(--color-kumo-info, #2563eb)" },
  { name: "Pending", value: 3, color: "var(--color-kumo-warning, #d97706)" },
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

const runStatusToBadge: Record<
  RunStatus,
  { variant: "success" | "info" | "error" | "warning"; label: string }
> = {
  success: { variant: "success", label: "Success" },
  running: { variant: "info", label: "Running" },
  failed: { variant: "error", label: "Failed" },
  pending: { variant: "warning", label: "Pending" },
};

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

function formatChartDay(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    timeZone: "UTC",
  });
}

function formatShortDate(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatScheduleLastRun(value: string | null) {
  if (!value) return "Not run yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not run yet";
  return `Last run ${formatShortDate(value)}`;
}

function scheduleCadenceHint(cron: string, timezone: string) {
  const cadence = describeScheduleCadence(cron);
  const zone = formatScheduleTimezone(timezone);
  if (cadence === cron.trim()) return `${cron} · ${zone}`;
  return `${cadence} · ${zone}`;
}

function formatArtifactKind(kind: string) {
  const trimmed = kind.trim();
  if (!trimmed) return "File";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

function formatRunStartedAt(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ToolLogo({
  tool,
  size = "base",
}: {
  tool: Pick<Tool, "id" | "name" | "logoUrl"> | ComposioDirectoryTool;
  size?: "sm" | "base";
}) {
  const boxSize = size === "sm" ? "h-7 w-7" : "h-9 w-9";
  const logoSize = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  const iconSize = size === "sm" ? 14 : 18;

  return (
    <div className={cn("flex items-center justify-center rounded-md border border-kumo-hairline bg-kumo-base text-kumo-subtle shrink-0", boxSize)}>
      {"logoUrl" in tool && tool.logoUrl ? (
        <img src={tool.logoUrl} alt="" className={cn("rounded-sm object-contain", logoSize)} />
      ) : (
        <ActionIcon action={tool.id} size={iconSize} />
      )}
    </div>
  );
}

function StatusLine({ space }: { space: Space }) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-kumo-subtle">
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", statusTone(space.status))} />
      <Text variant="secondary" size="xs" truncate>
        {space.status === "active" ? "production" : space.status}
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

function LiveConnectionDot() {
  return (
    <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
      <span className="ws-live-ring absolute inline-flex h-full w-full rounded-full bg-kumo-success" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-kumo-success" />
    </span>
  );
}

function WorkspaceView({
  slackWorkspace,
}: {
  slackWorkspace: SlackWorkspace | null;
}) {
  const reconnect = () => {
    window.location.href = "/api/slack/oauth/start";
  };

  if (!slackWorkspace) {
    return <SlackConnectEmpty />;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Workspace"
        description="The Slack workspace connected to Tags."
      />
      <WorkspaceConnectionCard slackWorkspace={slackWorkspace} onReconnect={reconnect} />
    </div>
  );
}

function WorkspaceConnectionCard({
  slackWorkspace,
  onReconnect,
}: {
  slackWorkspace: SlackWorkspace;
  onReconnect: () => void;
}) {
  const workspaceName = slackWorkspace.name || "Unnamed workspace";
  const scopes = slackWorkspace.scopes ?? [];

  return (
    <LayerCard className="ws-rise overflow-hidden p-0">
      <div className="flex items-center gap-4 p-5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-kumo-hairline bg-kumo-base p-2 shadow-sm">
          <img src={slackLogo} alt="" className="h-full w-full object-contain" />
        </div>
        <div className="min-w-0 flex-1">
          <Text variant="heading3" as="h2" truncate>
            {workspaceName}
          </Text>
          <div className="mt-1 flex min-w-0 items-center gap-2 text-kumo-subtle">
            <LiveConnectionDot />
            <Text variant="secondary" size="sm">Connected</Text>
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          icon={ArrowClockwiseIcon}
          onClick={onReconnect}
          className="shrink-0"
        >
          Reconnect
        </Button>
      </div>

      {scopes.length > 0 && (
        <Collapsible.Root className="border-t border-kumo-hairline">
          <Collapsible.Trigger className="group flex w-full cursor-pointer items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors duration-150 ease-out hover:bg-kumo-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-kumo-focus">
            <span className="flex items-center gap-2.5">
              <ShieldCheckIcon size={16} className="text-kumo-subtle" />
              <Text size="sm">Permissions</Text>
            </span>
            <span className="flex items-center gap-2 text-kumo-subtle">
              <Text variant="secondary" size="xs">{scopes.length} granted</Text>
              <CaretDownIcon
                size={14}
                className="transition-transform duration-200 ease-out [[data-panel-open]_&]:rotate-180"
              />
            </span>
          </Collapsible.Trigger>
          <Collapsible.Panel className="ws-perms-panel">
            <div className="flex flex-wrap gap-1.5 px-5 pb-5 pt-0.5">
              {scopes.map((scope, i) => (
                <span
                  key={scope}
                  className="ws-chip rounded-md border border-kumo-hairline bg-kumo-recessed px-2 py-1 font-mono text-xs text-kumo-subtle"
                  style={{ animationDelay: `${Math.min(i * 25, 200)}ms` }}
                >
                  {scope}
                </span>
              ))}
            </div>
          </Collapsible.Panel>
        </Collapsible.Root>
      )}
    </LayerCard>
  );
}

function SpacesView({
  spaces,
  onSelectSpace,
  onDeleteSpace,
  onNewSpace,
}: {
  spaces: Space[];
  onSelectSpace: (id: string) => void;
  onDeleteSpace: (id: string) => Promise<void>;
  onNewSpace: () => void;
}) {
  const activeCount = spaces.filter((s) => s.status === "active").length;
  const errorCount = spaces.filter((s) => s.status === "error").length;

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
            {errorCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-kumo-hairline bg-kumo-base px-2 py-1 text-kumo-danger">
                <WarningIcon size={14} />
                <Text variant="error" size="xs">{errorCount} needs attention</Text>
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
          <Button variant="primary" icon={PlusIcon} onClick={onNewSpace}>
            New Space
          </Button>
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 min-[520px]:[grid-template-columns:repeat(auto-fill,minmax(17.5rem,17.5rem))]">
        {spaces.map((space) => (
          <SpaceProjectCard
            key={space.id}
            space={space}
            onClick={() => onSelectSpace(space.id)}
            onDelete={() => onDeleteSpace(space.id)}
          />
        ))}
      </div>
    </div>
  );
}

function SpaceProjectCard({
  space,
  onClick,
  onDelete,
}: {
  space: Space;
  onClick: () => void;
  onDelete: () => Promise<void>;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const composioTools = space.tools.filter(isComposioTool);
  const nativeTools = space.tools.filter((tool) => !isComposioTool(tool));
  const centerTools = [
    { id: "tags", name: "Tags", logoUrl: undefined },
    ...composioTools.slice(0, 2),
  ];

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete();
      setConfirmOpen(false);
    } catch {
      // The parent owns the error banner and state rollback.
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
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
        className="group w-full max-w-[17.5rem] min-w-0 cursor-pointer overflow-hidden p-0 transition-colors hover:bg-kumo-base focus-visible:ring-2 focus-visible:ring-kumo-focus min-[520px]:max-w-none"
      >
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <div className="min-w-0">
            <Text bold truncate as="div">{space.name}</Text>
            <div className="mt-1 flex items-center gap-1.5 text-kumo-subtle">
              <HashIcon size={12} />
              <Text variant="secondary" size="xs" truncate>{space.channel}</Text>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenu.Trigger
              render={(
                <Button
                  variant="ghost"
                  shape="square"
                  size="sm"
                  icon={DotsThreeIcon}
                  aria-label={`Open menu for ${space.name}`}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                  className="shrink-0"
                />
              )}
            />
            <DropdownMenu.Content onClick={(event) => event.stopPropagation()}>
              <DropdownMenu.Item
                variant="danger"
                icon={TrashIcon}
                onClick={(event) => {
                  event.stopPropagation();
                  setConfirmOpen(true);
                }}
              >
                Delete
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu>
        </div>

        <div className="px-2 pb-2">
          <div className="relative aspect-[7/4] overflow-hidden rounded-md border border-kumo-hairline bg-kumo-recessed">
            <div
              className="absolute inset-0 opacity-60"
              style={{
                backgroundImage: "radial-gradient(var(--color-kumo-line) 1px, transparent 1px)",
                backgroundSize: "8px 8px",
              }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex items-center gap-2">
                {centerTools.map((tool) => (
                  <div
                    key={tool.id}
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-kumo-line bg-kumo-base text-kumo-default shadow-sm transition-transform group-hover:-translate-y-0.5"
                  >
                    {tool.id === "tags" ? (
                      <BrainIcon size={16} weight="duotone" />
                    ) : (
                      <ToolLogo tool={tool} size="sm" />
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="absolute inset-x-3 bottom-2.5 flex items-center justify-between gap-2">
              <StatusLine space={space} />
              <div className="flex shrink-0 items-center gap-2 text-kumo-subtle">
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
      </LayerCard>

      <Dialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
        <Dialog className="max-w-md p-6">
          <div className="mb-4 flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-kumo-danger/30 bg-kumo-danger/10 text-kumo-danger">
              <TrashIcon size={16} />
            </div>
            <div className="min-w-0">
              <Dialog.Title>Delete {space.name}?</Dialog.Title>
              <Dialog.Description>
                This deletes the space and its runs, messages, schedules, tools, memory, and artifacts from Tags.
              </Dialog.Description>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Dialog.Close
              render={(p) => (
                <Button {...p} variant="ghost" type="button" disabled={deleting}>
                  Cancel
                </Button>
              )}
            />
            <Button
              variant="primary"
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="bg-kumo-danger text-white hover:bg-kumo-danger/90"
            >
              {deleting ? "Deleting" : "Delete"}
            </Button>
          </div>
        </Dialog>
      </Dialog.Root>
    </>
  );
}

function SpaceDetailView({
  space,
  runs,
  onBack,
  onAuthTool,
  onAddTool,
  authLoadingToolId,
  onToggleTool,
  onRemoveTool,
  onAddRepo,
  onSetDefaultRepo,
  onRemoveRepo,
  onSelectRun,
}: {
  space: Space;
  runs: Run[];
  onBack: () => void;
  onAuthTool: (spaceId: string, toolId: string) => Promise<boolean>;
  onAddTool: (spaceId: string, composio: ComposioDirectoryTool) => Promise<boolean>;
  authLoadingToolId: string | null;
  onToggleTool: (spaceId: string, toolId: string, enabled: boolean) => void;
  onRemoveTool: (spaceId: string, toolId: string) => void;
  onAddRepo: (spaceId: string, fullName: string) => void | Promise<void>;
  onSetDefaultRepo: (spaceId: string, repoId: string) => void;
  onRemoveRepo: (spaceId: string, repoId: string) => void;
  onSelectRun: (id: string) => void;
}) {
  const spaceRuns = runs.filter((r) => r.spaceId === space.id);
  const [tab, setTab] = useState("overview");
  const [addRepoOpen, setAddRepoOpen] = useState(false);
  const [addToolOpen, setAddToolOpen] = useState(false);
  const [addScheduleOpen, setAddScheduleOpen] = useState(false);
  const [schedulePrompt, setSchedulePrompt] = useState("");
  const [scheduleCron, setScheduleCron] = useState("");
  const [scheduleTimezone, setScheduleTimezone] = useState("UTC");
  const [toolSearch, setToolSearch] = useState("");
  const [schedules, setSchedules] = useState<Schedule[] | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[] | null>(null);
  const [schedulesLoading, setSchedulesLoading] = useState(false);
  const [artifactsLoading, setArtifactsLoading] = useState(false);
  const [creatingSchedule, setCreatingSchedule] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [directorySource, setDirectorySource] = useState<"composio" | "fallback">("fallback");
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [composioDirectory, setComposioDirectory] = useState<ComposioDirectoryTool[]>([]);
  const [approvalKeys, setApprovalKeys] = useState<Set<string>>(new Set());
  const [approvalToolsLoaded, setApprovalToolsLoaded] = useState(false);
  const [approvalDialogTool, setApprovalDialogTool] = useState<Tool | null>(null);
  const [toolkitActions, setToolkitActions] = useState<Record<string, ComposioAction[]>>({});
  const [toolkitActionsLoading, setToolkitActionsLoading] = useState(false);
  const [actionSearch, setActionSearch] = useState("");
  const composioTools = space.tools.filter(isComposioTool);
  const readyComposioTools = composioTools.filter((tool) => tool.authState === "connected" && tool.enabled);
  const githubConnected = isGitHubToolkitConnected(space.tools);
  const dailyUsage = space.dailyUsage.map((point) => ({
    d: formatChartDay(point.date),
    runs: point.runs,
    tokens: Math.round(point.tokens / 1000),
  }));
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
  const addToolAuthPending = Boolean(authLoadingToolId?.startsWith(`${space.id}:`));

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

  useEffect(() => {
    if (tab !== "tools" || approvalToolsLoaded) return;
    loadSpaceApprovalTools(space.id)
      .then((payload) => {
        setApprovalKeys(new Set(payload.toolKeys));
        setApprovalToolsLoaded(true);
      })
      .catch(() => setApprovalToolsLoaded(true));
  }, [tab, approvalToolsLoaded, space.id]);

  useEffect(() => {
    if (!approvalDialogTool) return;
    const toolkitId = approvalDialogTool.id;
    if (toolkitActions[toolkitId] || toolkitActionsLoading) return;
    setToolkitActionsLoading(true);
    loadToolkitActions(space.id, toolkitId)
      .then((payload) => setToolkitActions((prev) => ({ ...prev, [toolkitId]: payload.actions })))
      .catch(() => setToolkitActions((prev) => ({ ...prev, [toolkitId]: [] })))
      .finally(() => setToolkitActionsLoading(false));
  }, [approvalDialogTool, toolkitActions, toolkitActionsLoading, space.id]);

  const toggleApproval = async (toolKey: string, required: boolean) => {
    setApprovalKeys((prev) => {
      const next = new Set(prev);
      if (required) next.add(toolKey);
      else next.delete(toolKey);
      return next;
    });
    try {
      await setSpaceApprovalTool(space.id, toolKey, required);
    } catch {
      setApprovalKeys((prev) => {
        const next = new Set(prev);
        if (required) next.delete(toolKey);
        else next.add(toolKey);
        return next;
      });
    }
  };

  const composioApprovalCount = (toolkitId: string) => {
    const prefix = `composio:${toolkitId.toUpperCase()}`;
    let count = 0;
    for (const key of approvalKeys) {
      if (key === prefix || key.startsWith(`${prefix}_`)) count += 1;
    }
    return count;
  };

  useEffect(() => {
    if (tab !== "schedules" || schedules || schedulesLoading) return;
    setSchedulesLoading(true);
    setDetailError(null);
    loadSpaceSchedules(space.id)
      .then((payload) => setSchedules(payload.schedules))
      .catch((error) => setDetailError(error instanceof Error ? error.message : "Failed to load schedules"))
      .finally(() => setSchedulesLoading(false));
  }, [schedules, schedulesLoading, space.id, tab]);

  useEffect(() => {
    if (tab !== "artifacts" || artifacts || artifactsLoading) return;
    setArtifactsLoading(true);
    setDetailError(null);
    loadSpaceArtifacts(space.id)
      .then((payload) => setArtifacts(payload.artifacts))
      .catch((error) => setDetailError(error instanceof Error ? error.message : "Failed to load artifacts"))
      .finally(() => setArtifactsLoading(false));
  }, [artifacts, artifactsLoading, space.id, tab]);

  const resetScheduleForm = () => {
    setSchedulePrompt("");
    setScheduleCron("");
    setScheduleTimezone("UTC");
    setCreatingSchedule(false);
  };

  const submitSchedule = async (event: FormEvent) => {
    event.preventDefault();
    if (!schedulePrompt.trim() || !scheduleCron.trim()) return;
    setCreatingSchedule(true);
    setDetailError(null);
    try {
      const payload = await createSpaceSchedule(space.id, {
        prompt: schedulePrompt.trim(),
        cron: scheduleCron.trim(),
        timezone: scheduleTimezone.trim() || "UTC",
      });
      setSchedules((prev) => [payload.schedule, ...(prev ?? [])]);
      resetScheduleForm();
      setAddScheduleOpen(false);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "Failed to create schedule");
      setCreatingSchedule(false);
    }
  };

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
          { value: "schedules", label: "Schedules" },
          { value: "artifacts", label: "Artifacts" },
          { value: "runs", label: `Runs (${spaceRuns.length})` },
        ]}
      />

      {detailError && (
        <LayerCard className="mb-4 border-kumo-danger/40">
          <LayerCard.Primary>
            <Text variant="error" size="sm">{detailError}</Text>
          </LayerCard.Primary>
        </LayerCard>
      )}

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
                    <BarChart data={dailyUsage} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
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
                    <AreaChart data={dailyUsage} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
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
                onClick={() => {
                  if (githubConnected) {
                    setAddRepoOpen(true);
                    return;
                  }
                  setTab("tools");
                }}
              >
                {githubConnected ? "Add repo" : "Connect GitHub"}
              </Button>
            </LayerCard.Secondary>
            <LayerCard.Primary>
              {space.repos.length === 0 ? (
                <Text variant="secondary" size="sm">
                  {githubConnected
                    ? "No repositories connected. Add one to give the agent code context."
                    : "Connect GitHub in Tools to add repositories."}
                </Text>
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
        <div className="flex flex-col gap-4">
          <LayerCard className="p-0 overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-kumo-hairline px-4 py-3">
              <div className="flex min-w-0 items-baseline gap-2">
                <Text bold>Connected tools</Text>
                {composioTools.length > 0 && (
                  <Text variant="secondary" size="xs">
                    {readyComposioTools.length}/{composioTools.length} ready
                  </Text>
                )}
              </div>
              <Button
                variant="primary"
                size="sm"
                icon={PlusIcon}
                onClick={() => setAddToolOpen(true)}
              >
                Add
              </Button>
            </div>

            <div>
              {composioTools.length === 0 ? (
                <div className="px-5 py-12">
                  <Empty
                    icon={<WrenchIcon size={40} />}
                    title="No external tools"
                    description="Add GitHub to connect repositories, or another service when this Space needs access outside Slack."
                  />
                  <div className="mt-5 flex justify-center">
                    <Button variant="primary" icon={PlusIcon} onClick={() => setAddToolOpen(true)}>
                      Add tool
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-kumo-hairline">
                  {composioTools.map((tool) => {
                    const connected = tool.authState === "connected";
                    const authLoading = authLoadingToolId === `${space.id}:${tool.id}`;
                    const approvalCount = composioApprovalCount(tool.id);
                    return (
                      <div key={tool.id} className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
                        <ToolLogo tool={tool} size="sm" />
                        <div className="min-w-0">
                          <Text bold size="sm" truncate>{tool.name}</Text>
                          <Text variant="secondary" size="xs" truncate as="p">
                            {tool.toolsCount ? displayToolCount(tool.toolsCount) : tool.description}
                          </Text>
                        </div>
                        <div className="flex items-center justify-end gap-2">
                          {connected && (
                            <Button
                              variant="ghost"
                              size="sm"
                              icon={ShieldCheckIcon}
                              onClick={() => {
                                setActionSearch("");
                                setApprovalDialogTool(tool);
                              }}
                            >
                              {approvalCount > 0 ? `Approvals · ${approvalCount}` : "Approvals"}
                            </Button>
                          )}
                          {connected ? (
                            <Switch
                              aria-label={tool.enabled ? `Disable ${tool.name}` : `Enable ${tool.name}`}
                              checked={tool.enabled}
                              onCheckedChange={(checked) => onToggleTool(space.id, tool.id, checked)}
                            />
                          ) : (
                            <Button
                              variant="secondary"
                              size="sm"
                              loading={authLoading}
                              disabled={authLoading}
                              onClick={() => onAuthTool(space.id, tool.id)}
                            >
                              Reconnect
                            </Button>
                          )}
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
                    );
                  })}
                </div>
              )}
            </div>
          </LayerCard>
        </div>
      )}

      {tab === "schedules" && (
        <LayerCard className="overflow-hidden p-0">
          <div className="flex items-center justify-between gap-3 border-b border-kumo-hairline px-4 py-3">
            <div className="flex min-w-0 items-baseline gap-2">
              <Text bold>Schedules</Text>
              {schedules && schedules.length > 0 && (
                <Text variant="secondary" size="xs">
                  {schedules.length}
                </Text>
              )}
            </div>
            <Button
              variant="primary"
              size="sm"
              icon={PlusIcon}
              onClick={() => setAddScheduleOpen(true)}
            >
              New
            </Button>
          </div>
          {schedulesLoading ? (
            <div className="flex min-h-40 items-center justify-center">
              <Loader />
            </div>
          ) : !schedules || schedules.length === 0 ? (
            <div className="px-5 py-12">
              <Empty
                icon={<ClockIcon size={40} />}
                title="No schedules"
                description="Set a recurring task for this Space."
              />
              <div className="mt-5 flex justify-center">
                <Button variant="primary" icon={PlusIcon} onClick={() => setAddScheduleOpen(true)}>
                  New schedule
                </Button>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-kumo-hairline">
              {schedules.map((schedule) => {
                const title = scheduleTitleFromPrompt(schedule.prompt);
                return (
                  <div
                    key={schedule.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3.5"
                  >
                    <div className="min-w-0" title={schedule.prompt}>
                      <Text bold size="sm" truncate>
                        {title}
                      </Text>
                      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                        <Text variant="secondary" size="xs">
                          {scheduleCadenceHint(schedule.cron, schedule.timezone)}
                        </Text>
                        <Text variant="secondary" size="xs">
                          ·
                        </Text>
                        <Text variant="secondary" size="xs">
                          {formatScheduleLastRun(schedule.lastRunAt)}
                        </Text>
                      </div>
                    </div>
                    <Badge variant={schedule.enabled ? "success" : "neutral"} appearance="dot">
                      {schedule.enabled ? "On" : "Off"}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </LayerCard>
      )}

      {tab === "artifacts" && (
        <LayerCard className="overflow-hidden p-0">
          <div className="flex items-center justify-between gap-3 border-b border-kumo-hairline px-4 py-3">
            <div className="flex min-w-0 items-baseline gap-2">
              <Text bold>Artifacts</Text>
              {artifacts && artifacts.length > 0 && (
                <Text variant="secondary" size="xs">
                  {artifacts.length}
                </Text>
              )}
            </div>
          </div>
          {artifactsLoading ? (
            <div className="flex min-h-40 items-center justify-center">
              <Loader />
            </div>
          ) : !artifacts || artifacts.length === 0 ? (
            <div className="px-5 py-12">
              <Empty
                icon={<FileTextIcon size={40} />}
                title="No artifacts"
                description="Generated files and recordings will show up here."
              />
            </div>
          ) : (
            <div className="divide-y divide-kumo-hairline">
              {artifacts.map((artifact) => (
                <button
                  key={artifact.id}
                  type="button"
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-kumo-elevated/40 active:scale-[0.995]"
                  onClick={() => window.open(artifact.url, "_blank", "noopener,noreferrer")}
                >
                  <div className="min-w-0" title={artifact.title}>
                    <Text bold size="sm" truncate>
                      {artifact.title}
                    </Text>
                    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                      <Text variant="secondary" size="xs">
                        {formatArtifactKind(artifact.kind)}
                      </Text>
                      <Text variant="secondary" size="xs">
                        ·
                      </Text>
                      <Text variant="secondary" size="xs">
                        {formatShortDate(artifact.createdAt)}
                      </Text>
                    </div>
                  </div>
                  <ArrowSquareOutIcon size={14} className="shrink-0 text-kumo-subtle" />
                </button>
              ))}
            </div>
          )}
        </LayerCard>
      )}

      <Dialog.Root
        open={addScheduleOpen}
        onOpenChange={(nextOpen) => {
          setAddScheduleOpen(nextOpen);
          if (!nextOpen) resetScheduleForm();
        }}
      >
        <Dialog className="p-0 max-w-md">
          <form onSubmit={submitSchedule}>
            <div className="flex items-center justify-between gap-4 border-b border-kumo-hairline px-5 py-4">
              <Dialog.Title>New schedule</Dialog.Title>
              <Dialog.Close
                aria-label="Close"
                render={(p) => (
                  <Button {...p} variant="ghost" shape="square" size="sm" icon={XIcon} aria-label="Close" type="button" />
                )}
              />
            </div>
            <div className="flex flex-col gap-4 px-5 py-5">
              <Field label="What should it do?">
                <InputArea
                  value={schedulePrompt}
                  onChange={(event) => setSchedulePrompt(event.target.value)}
                  placeholder="Post a morning standup digest in this channel"
                  rows={4}
                  autoFocus
                />
              </Field>
              <Field
                label="When"
                description={
                  scheduleCron.trim()
                    ? scheduleCadenceHint(scheduleCron, scheduleTimezone || "UTC")
                    : "Example: 30 9 * * 1-5 for weekdays at 9:30 AM"
                }
              >
                <Input
                  value={scheduleCron}
                  onChange={(event) => setScheduleCron(event.target.value)}
                  placeholder="30 9 * * 1-5"
                />
              </Field>
              <Field label="Timezone">
                <Input
                  value={scheduleTimezone}
                  onChange={(event) => setScheduleTimezone(event.target.value)}
                  placeholder="America/New_York"
                />
              </Field>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-kumo-hairline px-5 py-4">
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
                disabled={creatingSchedule || !schedulePrompt.trim() || !scheduleCron.trim()}
              >
                {creatingSchedule ? "Creating" : "Create"}
              </Button>
            </div>
          </form>
        </Dialog>
      </Dialog.Root>

      <AddRepoDialog
        open={addRepoOpen}
        onOpenChange={setAddRepoOpen}
        spaceId={space.id}
        existingRepos={space.repos}
        onAddRepo={onAddRepo}
      />

      {/* Add tool from Composio directory */}
      <Dialog.Root
        open={addToolOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && addToolAuthPending) return;
          setAddToolOpen(nextOpen);
        }}
      >
        <Dialog className="p-0 max-w-4xl" size="xl">
          <div className="flex flex-col gap-4 border-b border-kumo-hairline px-6 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Dialog.Title>
                  <Text variant="heading3">Add tool</Text>
                </Dialog.Title>
                <Dialog.Description>
                  <Text variant="secondary" size="sm">
                    Choose a service to connect to this Space.
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
              <div className="flex items-center gap-2 text-kumo-subtle">
                <span className={cn("h-1.5 w-1.5 rounded-full", directorySource === "composio" ? "bg-kumo-success" : "bg-kumo-subtle")} />
                <Text variant="secondary" size="xs">
                  {directorySource === "composio" ? "Live directory" : "Directory cache"}
                </Text>
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
              <div className="divide-y divide-kumo-hairline">
                {visibleDirectory.map((toolkit) => {
                  const connectedTool = composioTools.find((tool) => tool.id === toolkit.id);
                  const isConnected = connectedTool?.authState === "connected";
                  const isAdded = Boolean(connectedTool);
                  const authLoading = authLoadingToolId === `${space.id}:${toolkit.id}`;

                  return (
                    <div
                      key={toolkit.id}
                      className="flex min-w-0 flex-col gap-3 px-2 py-3 sm:flex-row sm:items-start"
                    >
                      <ToolLogo tool={toolkit} />
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <Text bold size="sm" truncate>{toolkit.name}</Text>
                          {toolkit.toolsCount ? (
                            <Text variant="secondary" size="xs" truncate>
                              {displayToolCount(toolkit.toolsCount)}
                            </Text>
                          ) : null}
                        </div>
                        <Text variant="secondary" size="xs" as="p" truncate>
                          {toolkit.description}
                        </Text>
                        {toolkit.categories.length > 0 && (
                          <Text variant="secondary" size="xs" as="p" truncate>
                            {toolkit.categories.slice(0, 2).join(" · ")}
                          </Text>
                        )}
                      </div>
                      <Button
                        variant={isConnected ? "secondary" : "primary"}
                        size="sm"
                        className="sm:ml-auto"
                        loading={authLoading}
                        disabled={authLoading}
                        onClick={async () => {
                          const connected = await onAddTool(space.id, toolkit);
                          if (connected) setAddToolOpen(false);
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

      <ToolApprovalsDialog
        tool={approvalDialogTool}
        onClose={() => setApprovalDialogTool(null)}
        actions={approvalDialogTool ? toolkitActions[approvalDialogTool.id] : undefined}
        loading={toolkitActionsLoading}
        approvalKeys={approvalKeys}
        onToggle={toggleApproval}
        search={actionSearch}
        onSearchChange={setActionSearch}
      />

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
                <Table.Cell><Text variant="secondary" size="xs">{formatRunStartedAt(run.startedAt)}</Text></Table.Cell>
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

function ApprovalToggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Switch
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onCheckedChange={onChange}
    />
  );
}

const MARKDOWN_INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)\s]+\))/g;

function renderMarkdownInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let token = 0;
  for (let match = MARKDOWN_INLINE.exec(text); match; match = MARKDOWN_INLINE.exec(text)) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const raw = match[0];
    const key = `${keyPrefix}-${token++}`;
    if (raw.startsWith("`")) {
      nodes.push(
        <code key={key} className="rounded border border-kumo-hairline bg-kumo-recessed px-1 py-0.5 font-mono text-[0.85em]">
          {raw.slice(1, -1)}
        </code>,
      );
    } else if (raw.startsWith("**")) {
      nodes.push(<strong key={key}>{raw.slice(2, -2)}</strong>);
    } else if (raw.startsWith("*")) {
      nodes.push(<em key={key}>{raw.slice(1, -1)}</em>);
    } else {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(raw);
      nodes.push(
        link ? (
          <a key={key} href={link[2]} target="_blank" rel="noreferrer" className="text-kumo-default underline underline-offset-2">
            {link[1]}
          </a>
        ) : (
          raw
        ),
      );
    }
    lastIndex = MARKDOWN_INLINE.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

/** Minimal markdown renderer for tool descriptions: paragraphs, bullet lists, and inline emphasis/code/links. */
function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks = text.trim().split(/\n{2,}/).filter(Boolean);
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {blocks.map((block, blockIdx) => {
        const lines = block.split("\n");
        const isList = lines.length > 0 && lines.every((line) => /^\s*[-*]\s+/.test(line));
        if (isList) {
          return (
            <ul key={blockIdx} className="flex list-disc flex-col gap-0.5 pl-4">
              {lines.map((line, lineIdx) => (
                <li key={lineIdx}>
                  {renderMarkdownInline(line.replace(/^\s*[-*]\s+/, ""), `${blockIdx}-${lineIdx}`)}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={blockIdx}>
            {lines.map((line, lineIdx) => (
              <span key={lineIdx}>
                {lineIdx > 0 && <br />}
                {renderMarkdownInline(line, `${blockIdx}-${lineIdx}`)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function ToolApprovalsDialog({
  tool,
  onClose,
  actions,
  loading,
  approvalKeys,
  onToggle,
  search,
  onSearchChange,
}: {
  tool: Tool | null;
  onClose: () => void;
  actions: ComposioAction[] | undefined;
  loading: boolean;
  approvalKeys: Set<string>;
  onToggle: (toolKey: string, required: boolean) => void;
  search: string;
  onSearchChange: (value: string) => void;
}) {
  const query = search.trim().toLowerCase();
  const visible = (actions ?? []).filter((action) => {
    if (!query) return true;
    return (
      action.slug.toLowerCase().includes(query) ||
      action.name.toLowerCase().includes(query) ||
      action.description.toLowerCase().includes(query)
    );
  });
  const requiredCount = (actions ?? []).filter((action) =>
    approvalKeys.has(composioToolApprovalKey(action.slug)),
  ).length;

  return (
    <Dialog.Root open={Boolean(tool)} onOpenChange={(next) => (next ? undefined : onClose())}>
      <Dialog className="p-0 max-w-2xl" size="lg">
        <div className="flex items-start justify-between gap-4 border-b border-kumo-hairline px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            {tool && <ToolLogo tool={tool} size="sm" />}
            <div className="min-w-0">
              <Dialog.Title>{tool?.name ?? "Tool"} approvals</Dialog.Title>
              <Dialog.Description>
                <Text variant="secondary" size="sm">
                  Pick which actions pause for a human. Everything else runs instantly.
                </Text>
              </Dialog.Description>
            </div>
          </div>
          <Dialog.Close
            aria-label="Close"
            render={(p) => (
              <Button {...p} variant="ghost" shape="square" size="sm" icon={XIcon} aria-label="Close" />
            )}
          />
        </div>
        <div className="flex items-center gap-3 border-b border-kumo-hairline px-5 py-3">
          <Input
            size="sm"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search actions"
            aria-label="Search tool actions"
            className="min-w-0 flex-1"
          />
          <Badge variant={requiredCount > 0 ? "warning" : "neutral"}>
            {requiredCount > 0 ? `${requiredCount} need approval` : "None gated"}
          </Badge>
        </div>
        <div className="max-h-[440px] overflow-y-auto">
          {loading && !actions ? (
            <div className="flex min-h-40 items-center justify-center">
              <Loader />
            </div>
          ) : visible.length === 0 ? (
            <Empty
              icon={<WrenchIcon size={36} />}
              title={query ? "No matching actions" : "No actions"}
              description={query ? "Try another search." : "This tool exposes no configurable actions."}
            />
          ) : (
            <div className="divide-y divide-kumo-hairline">
              {visible.map((action) => {
                const key = composioToolApprovalKey(action.slug);
                const checked = approvalKeys.has(key);
                return (
                  <div key={action.slug} className="flex items-start gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <Text bold size="sm" truncate>{action.name}</Text>
                        {action.readOnly && <Badge variant="neutral">read-only</Badge>}
                      </div>
                      {action.description && (
                        <div className="mt-1 text-xs text-kumo-subtle [&_p]:leading-relaxed">
                          <Markdown text={action.description} />
                        </div>
                      )}
                      <div className="mt-1 font-mono opacity-70">
                        <Text variant="secondary" size="xs">{action.slug}</Text>
                      </div>
                    </div>
                    <div className="pt-0.5">
                      <ApprovalToggle
                        label={`Require approval for ${action.name}`}
                        checked={checked}
                        onChange={(next) => onToggle(key, next)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Dialog>
    </Dialog.Root>
  );
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
        description="Quick yes or no — the agent waits until you decide."
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
              title="All caught up"
              description="Nothing waiting on you right now."
            />
          </LayerCard.Primary>
        </LayerCard>
      ) : (
        <div className="flex flex-col gap-3">
          {approvals.map((apr) => (
            <LayerCard key={apr.id}>
              <LayerCard.Secondary className="flex items-center justify-between gap-4 py-4">
                <div className="min-w-0 flex-1">
                  <Text bold className="block">
                    {apr.summary}
                  </Text>
                  <Text variant="secondary" size="xs" className="mt-1 block">
                    {apr.spaceName}
                  </Text>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="secondary-destructive"
                    size="sm"
                    icon={XIcon}
                    onClick={() => onReject(apr.id)}
                  >
                    Decline
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
            </LayerCard>
          ))}
        </div>
      )}
    </div>
  );
}

function RunsView({
  runs,
  activity24h,
  onSelectRun,
}: {
  runs: Run[];
  activity24h: ActivityPoint[];
  onSelectRun: (id: string) => void;
}) {
  const activityTotals = activity24h.reduce(
    (acc, point) => {
      acc.runs += point.runs;
      acc.failed += point.failed;
      return acc;
    },
    { runs: 0, failed: 0 },
  );
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
                  {activityTotals.runs} runs
                </Text>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-kumo-danger" />
                <Text variant="secondary" size="xs">
                  {activityTotals.failed} failed
                </Text>
              </div>
            </div>
          </LayerCard.Secondary>
          <LayerCard.Primary>
            <div className="h-44 -mx-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activity24h} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="runsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_BRAND} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={CHART_BRAND} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--color-kumo-hairline)" vertical={false} />
                  <XAxis dataKey="h" interval={1} tick={{ fontSize: 10, fill: CHART_MUTED }} axisLine={false} tickLine={false} />
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
                <Table.Cell><Text variant="secondary" size="xs">{formatRunStartedAt(run.startedAt)}</Text></Table.Cell>
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

function RunDetailView({ run, events, eventsLoading, onBack }: { run: Run; events: RunEvent[]; eventsLoading: boolean; onBack: () => void }) {
  const eventIconMap: Record<RunEventType, ReactNode> = {
    start: <PlayIcon size={14} className="text-kumo-subtle" />,
    tool_call: <LightningIcon size={14} className="text-kumo-info" />,
    approval: <ShieldCheckIcon size={14} className="text-kumo-warning" />,
    error: <WarningIcon size={14} className="text-kumo-danger" />,
    artifact: <FileTextIcon size={14} className="text-kumo-info" />,
    end: <CheckIcon size={14} className="text-kumo-success" />,
  };

  const statusDotColor: Record<string, string> = {
    success: "bg-kumo-success",
    failed: "bg-kumo-danger",
    pending: "bg-kumo-warning",
  };

  const toolCallCount =
    events.length > 0
      ? events.filter((event) => event.type === "tool_call" && event.status === "pending").length
      : run.toolCalls;

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
          { label: "Started", value: formatRunStartedAt(run.startedAt), icon: <ClockIcon size={14} /> },
          { label: "Duration", value: run.duration, icon: <ActivityIcon size={14} /> },
          { label: "Tool calls", value: toolCallCount, icon: <LightningIcon size={14} /> },
          { label: "Triggered by", value: run.triggeredBy, icon: <BrainIcon size={14} /> },
        ]}
      />

      <SectionHeader title="Timeline" />
      {eventsLoading ? (
        <div className="flex min-h-[240px] items-center justify-center">
          <Loader size="lg" />
        </div>
      ) : events.length === 0 ? (
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
            const hasBody = Boolean(event.detail || event.json);
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
                        <div className="ml-auto flex items-center gap-1.5">
                          <span className={cn("h-2 w-2 rounded-full shrink-0", statusDotColor[event.status])} />
                        </div>
                      )}
                    </LayerCard.Secondary>
                    {hasBody && (
                      <LayerCard.Primary>
                        {event.detail && (
                          <div className="text-xs text-kumo-subtle break-words">
                            <Markdown text={event.detail} />
                          </div>
                        )}
                        {event.json && (
                          <div className={cn(
                            "max-w-full overflow-x-auto rounded-md border border-kumo-fill bg-kumo-base [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_pre]:overflow-wrap-anywhere [&_pre]:p-2.5 [&_pre]:text-xs [&_pre]:max-h-80 [&_pre]:overflow-y-auto",
                            event.detail && "mt-2",
                          )}>
                            <Code.Block code={event.json} lang="jsonc" />
                          </div>
                        )}
                      </LayerCard.Primary>
                    )}
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

function AddRepoDialog({
  open,
  onOpenChange,
  spaceId,
  existingRepos,
  onAddRepo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
  existingRepos: Repo[];
  onAddRepo: (spaceId: string, fullName: string) => void | Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    loadGitHubRepos(spaceId)
      .then((payload) => {
        setRepos(payload.repos);
      })
      .catch((loadError) => {
        setRepos([]);
        setError(loadError instanceof Error ? loadError.message : "Failed to load GitHub repositories");
      })
      .finally(() => setLoading(false));
  }, [open, spaceId]);

  const existingRepoSet = new Set(
    existingRepos.flatMap((repo) => [
      repo.name.toLowerCase(),
      repo.id.toLowerCase(),
      repo.id.replace(/^https:\/\/github.com\//i, "").replace(/\.git$/, "").toLowerCase(),
    ]),
  );
  const availableRepos = repos.filter(
    (repo) =>
      !existingRepoSet.has(repo.fullName.toLowerCase()) &&
      !existingRepoSet.has(repo.htmlUrl.toLowerCase()),
  );
  const filteredRepos = availableRepos
    .filter((repo) => {
      const normalizedQuery = query.trim().toLowerCase();
      return !normalizedQuery || repo.fullName.toLowerCase().includes(normalizedQuery);
    })
    .slice(0, 24);

  const reset = () => {
    setQuery("");
    setSelectedRepo(null);
    setSubmitting(false);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedRepo) return;
    setSubmitting(true);
    try {
      await onAddRepo(spaceId, selectedRepo.fullName);
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
      <Dialog className="flex max-h-[calc(100vh-2rem)] !w-[calc(100vw-2rem)] max-w-[440px] flex-col overflow-hidden p-0 sm:!w-[440px]">
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-col">
          <div className="flex items-center justify-between gap-4 border-b border-kumo-hairline px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title>Connect a repository</Dialog.Title>
              <Dialog.Description>
                <Text variant="secondary" size="xs" as="p">
                  Choose a GitHub repository from your connected account.
                </Text>
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Close"
              render={(p) => (
                <Button {...p} variant="ghost" shape="square" size="sm" icon={XIcon} aria-label="Close" type="button" />
              )}
            />
          </div>

          <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-5 py-5">
            <Field label="Repository">
              <div className="flex flex-col gap-3">
                <div className="relative w-full">
                  <MagnifyingGlassIcon size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-kumo-subtle" />
                  <Input
                    value={selectedRepo ? selectedRepo.fullName : query}
                    onChange={(event) => {
                      setSelectedRepo(null);
                      setQuery(event.target.value);
                    }}
                    placeholder="Search repositories"
                    aria-label="GitHub repository"
                    className="w-full pl-9"
                    autoFocus
                  />
                </div>

                <div className="max-h-56 overflow-y-auto rounded-lg border border-kumo-hairline bg-kumo-base p-1">
                  {loading ? (
                    <div className="flex items-center gap-2 px-3 py-3 text-kumo-subtle">
                      <ArrowClockwiseIcon size={14} className="animate-spin" />
                      <Text variant="secondary" size="xs">Loading repositories</Text>
                    </div>
                  ) : error ? (
                    <div className="px-3 py-3">
                      <Text variant="error" size="xs">{error}</Text>
                    </div>
                  ) : filteredRepos.length === 0 ? (
                    <div className="px-3 py-3">
                      <Text variant="secondary" size="xs">No matching repositories.</Text>
                    </div>
                  ) : (
                    filteredRepos.map((repo) => {
                      const selected = selectedRepo?.id === repo.id;
                      return (
                        <button
                          key={repo.id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => {
                            setSelectedRepo(repo);
                            setQuery(repo.fullName);
                          }}
                          className={cn(
                            "flex w-full items-center justify-between gap-3 rounded-md border border-transparent px-3 py-2.5 text-left transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kumo-focus",
                            selected
                              ? "border-kumo-hairline bg-kumo-tint text-kumo-default"
                              : "text-kumo-subtle hover:bg-kumo-tint hover:text-kumo-default",
                          )}
                        >
                          <span className="inline-flex min-w-0 items-center gap-2">
                            <GitBranchIcon size={14} className="shrink-0" />
                            <Text size="sm" truncate>{repo.fullName}</Text>
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            {repo.private && (
                              <Badge variant="neutral" appearance="dot">
                                Private
                              </Badge>
                            )}
                            {selected && <CheckIcon size={15} className="text-kumo-default" />}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </Field>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-kumo-hairline px-5 py-4">
            <Dialog.Close
              render={(p) => (
                <Button {...p} variant="ghost" type="button">
                  Cancel
                </Button>
              )}
            />
            <Button variant="primary" type="submit" disabled={submitting || !selectedRepo}>
              {submitting ? "Connecting" : "Connect"}
            </Button>
          </div>
        </form>
      </Dialog>
    </Dialog.Root>
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
      <Dialog className="flex max-h-[calc(100vh-2rem)] !w-[calc(100vw-2rem)] max-w-[440px] flex-col overflow-hidden p-0 sm:!w-[440px]">
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-col">
          <div className="flex items-center justify-between gap-4 border-b border-kumo-hairline px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title>Create Space</Dialog.Title>
            </div>
            <Dialog.Close
              aria-label="Close"
              render={(p) => (
                <Button {...p} variant="ghost" shape="square" size="sm" icon={XIcon} aria-label="Close" type="button" />
              )}
            />
          </div>

          <div className="flex min-h-0 flex-col gap-5 overflow-y-auto px-5 py-5">
            <Field label="Space name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Customer Support"
                aria-label="Space name"
                autoFocus
              />
            </Field>

            <Field label="Slack channel">
              <div className="flex flex-col gap-3">
                <div className="relative w-full">
                  <MagnifyingGlassIcon size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-kumo-subtle" />
                  <Input
                    value={selectedChannel ? selectedChannel.name : channelQuery}
                    onChange={(e) => {
                      setSelectedChannel(null);
                      setChannelQuery(e.target.value.replace(/^#/, ""));
                    }}
                    placeholder="Search channels"
                    aria-label="Slack channel"
                    className="w-full pl-9"
                  />
                </div>

                <div className="max-h-56 overflow-y-auto rounded-lg border border-kumo-hairline bg-kumo-base p-1">
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
                          aria-pressed={selected}
                          onClick={() => {
                            setSelectedChannel(channel);
                            setChannelQuery(channel.name);
                          }}
                          className={cn(
                            "flex w-full items-center justify-between gap-3 rounded-md border border-transparent px-3 py-2.5 text-left transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kumo-focus",
                            selected
                              ? "border-kumo-hairline bg-kumo-tint text-kumo-default"
                              : "text-kumo-subtle hover:bg-kumo-tint hover:text-kumo-default"
                          )}
                        >
                          <span className="inline-flex min-w-0 items-center gap-2">
                            <HashIcon size={14} className="shrink-0" />
                            <Text size="sm" truncate>{channel.name}</Text>
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            {channel.isPrivate && (
                              <Badge variant={channel.isMember ? "neutral" : "warning"} appearance="dot">
                                {channel.isMember ? "Private" : "Invite app"}
                              </Badge>
                            )}
                            {selected && <CheckIcon size={15} className="text-kumo-default" />}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
                {selectedChannel?.isPrivate && !selectedChannel.isMember && (
                  <div className="flex items-start gap-2 rounded-md border border-kumo-hairline bg-kumo-recessed px-3 py-2 text-kumo-subtle">
                    <WarningIcon size={14} className="mt-0.5 shrink-0 text-kumo-warning" />
                    <Text variant="secondary" size="xs" as="p">
                      Invite the Tags app to this private channel in Slack, then refresh channels.
                    </Text>
                  </div>
                )}
              </div>
            </Field>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-kumo-hairline px-5 py-4">
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
              {submitting ? "Creating" : "Create"}
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
  const [activity24h, setActivity24h] = useState<ActivityPoint[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [eventsByRun, setEventsByRun] = useState<Record<string, RunEvent[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authLoadingToolId, setAuthLoadingToolId] = useState<string | null>(null);

  const refresh = async () => {
    setError(null);
    const payload = await loadControlPlane();
    setSlackWorkspace(payload.slackWorkspace);
    setSpaces(payload.spaces);
    setRuns(payload.runs);
    setActivity24h(payload.activity24h);
    setApprovals(payload.approvals);
    return payload;
  };

  useEffect(() => {
    refresh()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load control plane"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // Keep Slack and the dashboard in sync: poll fast while reviewing approvals,
    // and at a relaxed cadence elsewhere so new requests surface promptly.
    const intervalMs = view.page === "approvals" ? 2000 : 5000;
    const poll = () => {
      if (document.hidden) return;
      loadApprovals()
        .then(setApprovals)
        .catch(() => undefined);
    };
    const timer = setInterval(poll, intervalMs);
    const onFocus = () => poll();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [view.page]);

  useEffect(() => {
    if (view.page !== "run-detail" || view.id in eventsByRun) return;
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

  const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

  const openConnectPopup = () => {
    const popup = window.open("", "_blank", "width=520,height=720");
    if (!popup) return null;
    try {
      popup.document.title = "Connect tool";
      popup.document.body.innerHTML =
        '<div style="min-height:100vh;display:grid;place-items:center;margin:0;background:#0b0f19;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif"><div style="text-align:center"><div style="margin-bottom:12px">Connecting...</div><div style="color:#94a3b8;font-size:14px">Waiting for Composio</div></div></div>';
      popup.opener = null;
    } catch {
      // The blank shell is best effort; navigation below is what matters.
    }
    return popup;
  };

  const navigateConnectPopup = (popup: Window | null, url: string | null) => {
    if (!url) return false;
    if (popup && !popup.closed) {
      popup.location.href = url;
      return true;
    }
    const fallback = window.open(url, "_blank", "noopener,noreferrer");
    return Boolean(fallback);
  };

  const waitForToolConnection = async (spaceId: string, toolId: string, popup: Window | null) => {
    const deadline = Date.now() + 3 * 60 * 1000;
    let popupClosedAt: number | null = null;

    while (Date.now() < deadline) {
      const status = await loadComposioToolStatus(spaceId, toolId).catch(() => null);
      if (status?.authState === "connected") return true;

      if (popup?.closed) {
        popupClosedAt ??= Date.now();
        if (Date.now() - popupClosedAt > 10_000) return false;
      }

      await delay(1_500);
    }

    return false;
  };

  const enableConnectedTool = async (spaceId: string, toolId: string) => {
    const payload = await refresh();
    const space = payload.spaces.find((item) => item.id === spaceId);
    if (!space) return;
    const enabledConnections = space.tools
      .filter((tool) => isComposioTool(tool) && tool.authState === "connected")
      .filter((tool) => tool.id === toolId || tool.enabled)
      .map((tool) => tool.id);
    await updateSpaceConfig(spaceId, { enabledConnections });
    await refresh();
  };

  const handleAuthTool = async (spaceId: string, toolId: string) => {
    const authKey = `${spaceId}:${toolId}`;
    const popup = openConnectPopup();
    setAuthLoadingToolId(authKey);
    updateSpace(spaceId, (s) => ({
      ...s,
      tools: s.tools.map((t) =>
        t.id === toolId ? { ...t, authState: "requires_auth", enabled: false } : t
      ),
    }));
    try {
      const auth = await authorizeComposioTool(spaceId, toolId);
      const opened = navigateConnectPopup(popup, auth.connectUrl);
      if (!opened && auth.connectUrl) {
        setError("The Composio popup was blocked. Allow popups for Tags and try again.");
        await refresh().catch(() => undefined);
        return false;
      }
      const connected = await waitForToolConnection(spaceId, toolId, popup);
      if (!connected) {
        setError("Composio authentication did not finish. Complete the connection window and try again.");
        await refresh().catch(() => undefined);
        return false;
      }
      await enableConnectedTool(spaceId, toolId);
      return true;
    } catch (err) {
      if (popup && !popup.closed) popup.close();
      setError(err instanceof Error ? err.message : "Failed to authenticate tool");
      await refresh().catch(() => undefined);
      return false;
    } finally {
      setAuthLoadingToolId((current) => (current === authKey ? null : current));
    }
  };

  const handleAddTool = async (spaceId: string, composio: ComposioDirectoryTool) => {
    const space = spaces.find((s) => s.id === spaceId);
    if (!space) return false;
    const authKey = `${spaceId}:${composio.id}`;
    const popup = openConnectPopup();
    setAuthLoadingToolId(authKey);
    updateSpace(spaceId, (s) => ({
      ...s,
      tools: s.tools.some((tool) => tool.id === composio.id)
        ? s.tools.map((tool) =>
            tool.id === composio.id ? { ...tool, authState: "requires_auth", enabled: false } : tool
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
              enabled: false,
              authState: composio.noAuth ? "connected" : "requires_auth",
            },
          ],
    }));
    try {
      const auth = await authorizeComposioTool(spaceId, composio.id);
      const opened = navigateConnectPopup(popup, auth.connectUrl);
      if (!opened && auth.connectUrl) {
        setError("The Composio popup was blocked. Allow popups for Tags and try again.");
        await refresh().catch(() => undefined);
        return false;
      }
      const connected = await waitForToolConnection(spaceId, composio.id, popup);
      if (!connected) {
        setError("Composio authentication did not finish. Complete the connection window and try again.");
        await refresh().catch(() => undefined);
        return false;
      }
      await enableConnectedTool(spaceId, composio.id);
      return true;
    } catch (err) {
      if (popup && !popup.closed) popup.close();
      setError(err instanceof Error ? err.message : "Failed to add tool");
      await refresh().catch(() => undefined);
      return false;
    } finally {
      setAuthLoadingToolId((current) => (current === authKey ? null : current));
    }
  };

  const handleRemoveTool = async (spaceId: string, toolId: string) => {
    const space = spaces.find((s) => s.id === spaceId);
    if (!space) return;
    const availableConnections = space.tools
      .filter((tool) => isComposioTool(tool) && tool.id !== toolId)
      .map((tool) => tool.id);
    const enabledConnections = space.tools
      .filter((tool) => isComposioTool(tool) && tool.id !== toolId && tool.enabled && tool.authState === "connected")
      .map((tool) => tool.id);
    updateSpace(spaceId, (s) => ({
      ...s,
      tools: s.tools.filter((t) => !isComposioTool(t) || t.id !== toolId),
    }));
    try {
      await updateSpaceConfig(spaceId, { availableConnections, enabledConnections });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove tool");
      await refresh().catch(() => undefined);
    }
  };

  const handleToggleTool = async (spaceId: string, toolId: string, enabled: boolean) => {
    const space = spaces.find((s) => s.id === spaceId);
    if (!space) return;
    const enabledConnections = space.tools
      .filter((tool) => isComposioTool(tool) && tool.authState === "connected")
      .filter((tool) => (tool.id === toolId ? enabled : tool.enabled))
      .map((tool) => tool.id);

    updateSpace(spaceId, (s) => ({
      ...s,
      tools: s.tools.map((tool) =>
        isComposioTool(tool) && tool.id === toolId ? { ...tool, enabled } : tool,
      ),
    }));
    try {
      await persistConnections(spaceId, enabledConnections);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update tool");
      await refresh().catch(() => undefined);
    }
  };

  const normalizeRepo = (name: string) => {
    const value = name.trim();
    if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("git@")) return value;
    return `https://github.com/${value.replace(/^\/+/, "")}`;
  };

  const handleAddRepo = async (spaceId: string, fullName: string) => {
    const space = spaces.find((s) => s.id === spaceId);
    if (!space) return;
    const repoUrl = normalizeRepo(fullName);
    const repos = [...space.repos, { id: repoUrl, name: fullName, isDefault: space.repos.length === 0 }];
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve request");
      await loadApprovals().then(setApprovals).catch(() => undefined);
    }
  };

  const handleReject = async (id: string) => {
    setApprovals((prev) => prev.filter((a) => a.id !== id));
    try {
      await respondToApproval(id, "rejected");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject request");
      await loadApprovals().then(setApprovals).catch(() => undefined);
    }
  };

  const handleDeleteSpace = async (id: string) => {
    const previousSpaces = spaces;
    const previousRuns = runs;
    setSpaces((prev) => prev.filter((space) => space.id !== id));
    setRuns((prev) => prev.filter((run) => run.spaceId !== id));
    if (view.page === "space-detail" && view.id === id) setView({ page: "spaces" });
    try {
      await deleteSpaceRequest(id);
      await refresh();
    } catch (err) {
      setSpaces(previousSpaces);
      setRuns(previousRuns);
      setError(err instanceof Error ? err.message : "Failed to delete space");
      await refresh().catch(() => undefined);
      throw err;
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

  useEffect(() => {
    const suffix = "Tags";
    let title: string;
    if (!slackWorkspace) {
      title = `Connect Slack | ${suffix}`;
    } else {
      switch (view.page) {
        case "spaces":
          title = `Spaces | ${suffix}`;
          break;
        case "space-detail":
          title = `${currentSpace?.name ?? "Space"} | ${suffix}`;
          break;
        case "approvals":
          title = `Approvals | ${suffix}`;
          break;
        case "runs":
          title = `Runs | ${suffix}`;
          break;
        case "run-detail":
          title = currentRun
            ? `${currentRun.spaceName} · Run | ${suffix}`
            : `Run | ${suffix}`;
          break;
        case "workspace":
          title = `Workspace | ${suffix}`;
          break;
        default: {
          const _exhaustive: never = view;
          void _exhaustive;
          title = suffix;
          break;
        }
      }
    }
    document.title = title;
  }, [view, slackWorkspace, currentSpace, currentRun]);

  const activeNav = ((): "spaces" | "approvals" | "runs" | "workspace" => {
    if (!slackWorkspace) return "workspace";
    if (view.page === "workspace") return "workspace";
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

            <Sidebar.Group className="mt-6 pt-4 group-not-data-[state=collapsed]/sidebar:border-t group-not-data-[state=collapsed]/sidebar:border-kumo-hairline group-data-[state=collapsed]/sidebar:mt-0 group-data-[state=collapsed]/sidebar:pt-0">
              <Sidebar.GroupLabel DANGEROUS_className="group-data-[state=collapsed]/sidebar:hidden">
                Settings
              </Sidebar.GroupLabel>
              <Sidebar.Menu>
                <Sidebar.MenuButton
                  icon={GearSixIcon}
                  active={activeNav === "workspace"}
                  onClick={() => setView({ page: "workspace" })}
                >
                  Workspace
                </Sidebar.MenuButton>
              </Sidebar.Menu>
            </Sidebar.Group>
          </Sidebar.Content>

          <Sidebar.Footer>
            {clerkEnabled ? <ClerkAccountFooter /> : <FallbackAccountFooter />}
          </Sidebar.Footer>
        </Sidebar>

        <main className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-kumo-canvas">
          <div
            className={cn(
              "mx-auto w-full max-w-6xl p-4 sm:p-6",
              !loading && !slackWorkspace && "flex flex-1 flex-col items-center justify-center",
            )}
          >
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
                {!slackWorkspace || view.page === "workspace" ? (
                  <WorkspaceView
                    slackWorkspace={slackWorkspace}
                  />
                ) : (
                  <>
                    {view.page === "spaces" && (
                      <SpacesView
                        spaces={spaces}
                        onSelectSpace={(id) => setView({ page: "space-detail", id })}
                        onDeleteSpace={handleDeleteSpace}
                        onNewSpace={() => setNewSpaceOpen(true)}
                      />
                    )}
                    {view.page === "space-detail" && currentSpace && (
                      <SpaceDetailView
                        space={currentSpace}
                        runs={runs}
                        onBack={() => setView({ page: "spaces" })}
                        onAuthTool={handleAuthTool}
                        onAddTool={handleAddTool}
                        authLoadingToolId={authLoadingToolId}
                        onToggleTool={handleToggleTool}
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
                      <RunsView
                        runs={runs}
                        activity24h={activity24h}
                        onSelectRun={(id) => setView({ page: "run-detail", id })}
                      />
                    )}
                    {view.page === "run-detail" && currentRun && (
                      <RunDetailView
                        run={currentRun}
                        events={eventsByRun[currentRun.id] ?? []}
                        eventsLoading={!(currentRun.id in eventsByRun)}
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

  if (!isSignedIn) return <RedirectToLanding />;

  return <DashboardApp clerkEnabled />;
}

function RedirectToLanding() {
  useEffect(() => {
    window.location.replace("/home");
  }, []);

  return (
    <div data-mode="dark" className="flex min-h-screen items-center justify-center bg-kumo-canvas">
      <Loader size="lg" />
    </div>
  );
}

export default function App({ clerkEnabled = false }: { clerkEnabled?: boolean }) {
  return clerkEnabled ? <ClerkGate /> : <DashboardApp clerkEnabled={false} />;
}
