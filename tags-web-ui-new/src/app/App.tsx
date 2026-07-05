import { useEffect, useState } from "react";
import tagsLogo from "../imports/Group_101__5_.png";
import {
  Sidebar,
  Table,
  LayerCard,
  Button,
  Badge,
  Text,
  Empty,
  Field,
  Input,
  Switch,
  Tabs,
  Surface,
  Link,
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
  loadControlPlane,
  loadRunEvents,
  respondToApproval,
  updateSpaceConfig,
  type Approval,
  type Repo,
  type Run,
  type RunEvent,
  type RunEventType,
  type RunStatus,
  type Space,
  type SpaceStatus,
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
  | { page: "new-space" };

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

// ===== Composio directory (mock) =====

interface ComposioTool {
  id: string;
  name: string;
  description: string;
  provider: string;
  icon: React.ComponentType<{ size?: number; className?: string; weight?: "duotone" | "fill" | "regular" }>;
}

const COMPOSIO_DIRECTORY: ComposioTool[] = [
  { id: "linear", name: "linear", description: "Create and query Linear issues", provider: "Linear", icon: WrenchIcon },
  { id: "notion", name: "notion", description: "Read and write Notion pages", provider: "Notion", icon: FileTextIcon },
  { id: "sentry", name: "sentry", description: "Query error events and issues", provider: "Sentry", icon: WarningIcon },
  { id: "pagerduty", name: "pagerduty", description: "Trigger and ack incidents", provider: "PagerDuty", icon: LightningIcon },
  { id: "vercel", name: "vercel", description: "Read deployments and logs", provider: "Vercel", icon: RocketIcon },
  { id: "stripe", name: "stripe", description: "Query customers and payments", provider: "Stripe", icon: CoinsIcon },
  { id: "zendesk", name: "zendesk", description: "Manage Zendesk tickets", provider: "Zendesk", icon: HeadsetIcon },
  { id: "hubspot", name: "hubspot", description: "Query CRM contacts and deals", provider: "HubSpot", icon: ChartLineUpIcon },
  { id: "datadog", name: "datadog", description: "Query metrics and monitors", provider: "Datadog", icon: ActivityIcon },
  { id: "figma", name: "figma", description: "Read Figma files and comments", provider: "Figma", icon: CodeIcon },
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
  actions?: React.ReactNode;
  breadcrumb?: React.ReactNode;
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
  action?: React.ReactNode;
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

// ===== Metric Grid =====

interface Metric {
  label: string;
  value: string | number;
  icon: React.ReactNode;
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
  onSelectSpace,
  onNewSpace,
  onSelectRun,
}: {
  spaces: Space[];
  runs: Run[];
  onSelectSpace: (id: string) => void;
  onNewSpace: () => void;
  onSelectRun: (id: string) => void;
}) {
  const totalRuns = spaces.reduce((a, s) => a + s.runCount, 0);
  const activeCount = spaces.filter((s) => s.status === "active").length;
  const errorCount = spaces.filter((s) => s.status === "error").length;
  const totalToday = ACTIVITY_24H.reduce((a, x) => a + x.runs, 0);
  const totalFailed = ACTIVITY_24H.reduce((a, x) => a + x.failed, 0);
  const successRate = ((totalToday - totalFailed) / totalToday) * 100;

  return (
    <div>
      <PageHeader
        title="Spaces"
        description="AI agents connected to Slack channels."
        actions={
          <Button variant="primary" icon={PlusIcon} onClick={onNewSpace}>
            New Space
          </Button>
        }
      />

      <SectionHeader title="Spaces" />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
        {spaces.map((space) => {
          const statusRing = {
            active: "bg-kumo-success",
            paused: "bg-kumo-warning",
            error: "bg-kumo-danger",
          }[space.status];
          const Icon = getSpaceIcon(space.id);

          return (
            <button
              key={space.id}
              type="button"
              onClick={() => onSelectSpace(space.id)}
              className="group text-left rounded-lg border border-kumo-hairline bg-kumo-base p-4 hover:border-kumo-line hover:bg-kumo-tint/40 transition-colors cursor-pointer"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md border border-kumo-hairline bg-kumo-canvas text-kumo-subtle shrink-0">
                  <Icon size={18} weight="regular" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Text bold truncate as="div">{space.name}</Text>
                    <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", statusRing)} />
                  </div>
                  <div className="mt-1 inline-flex items-center gap-1 text-kumo-subtle">
                    <HashIcon size={12} />
                    <Text variant="mono-secondary" size="xs">{space.channel}</Text>
                  </div>
                </div>
                <CaretRightIcon
                  size={14}
                  className="mt-2.5 text-kumo-inactive transition-transform group-hover:translate-x-0.5 group-hover:text-kumo-subtle"
                />
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-kumo-hairline pt-3 text-kumo-subtle">
                <div className="flex min-w-0 items-center gap-1.5">
                  <PlayIcon size={12} />
                  <Text variant="mono-secondary" size="xs">
                    {space.runCount.toLocaleString()}
                  </Text>
                </div>
                <div className="flex min-w-0 items-center gap-1.5">
                  <CoinsIcon size={12} />
                  <Text variant="mono-secondary" size="xs">
                    ${space.cost.toFixed(2)}
                  </Text>
                </div>
                <div className="flex min-w-0 items-center justify-end gap-1.5">
                  <ClockIcon size={12} />
                  <Text variant="mono-secondary" size="xs" truncate>
                    {space.lastRun}
                  </Text>
                </div>
              </div>
            </button>
          );
        })}
      </div>

    </div>
  );
}

function SpaceDetailView({
  space,
  runs,
  onBack,
  onToggleTool,
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
  onToggleTool: (spaceId: string, toolId: string) => void;
  onAuthTool: (spaceId: string, toolId: string) => void;
  onAddTool: (spaceId: string, composio: ComposioTool) => void;
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
          { value: "tools", label: `Tools (${space.tools.filter((t) => t.enabled).length})` },
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
                      <Text variant="mono" size="sm">{repo.name}</Text>
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
          <div className="flex items-center justify-between px-4 py-3 border-b border-kumo-hairline">
            <Text variant="secondary" size="sm">
              {space.tools.filter((t) => t.enabled).length} enabled · {space.tools.length} total
            </Text>
            <Button
              variant="primary"
              size="sm"
              icon={PlusIcon}
              onClick={() => setAddToolOpen(true)}
            >
              Add tool
            </Button>
          </div>
          {space.tools.length === 0 ? (
            <Empty
              icon={<WrenchIcon size={40} />}
              title="No tools connected"
              description="Browse the Composio directory to give this agent capabilities."
            />
          ) : (
            space.tools.map((tool, i) => (
              <div
                key={tool.id}
                className={cn(
                  "flex items-center gap-4 px-4 py-3",
                  i < space.tools.length - 1 && "border-b border-kumo-hairline"
                )}
              >
                <div className="w-8 h-8 rounded-md bg-kumo-tint flex items-center justify-center shrink-0">
                  <ActionIcon action={tool.id} size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Text variant="mono" size="sm">{tool.name}</Text>
                    <Text variant="secondary" size="xs">· {tool.provider}</Text>
                  </div>
                  <Text variant="secondary" size="xs" as="p">
                    {tool.description}
                  </Text>
                </div>
                {tool.authState === "connected" ? (
                  <Badge variant="success" appearance="dot">Connected</Badge>
                ) : tool.authState === "requires_auth" ? (
                  <Badge variant="warning" appearance="dot">Reauth needed</Badge>
                ) : (
                  <Badge variant="outline" appearance="dot">Not authenticated</Badge>
                )}
                {tool.authState !== "connected" ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onAuthTool(space.id, tool.id)}
                  >
                    Authenticate
                  </Button>
                ) : (
                  <Switch
                    checked={tool.enabled}
                    onCheckedChange={() => onToggleTool(space.id, tool.id)}
                    aria-label={`Toggle ${tool.name}`}
                  />
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
            ))
          )}
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
        <Dialog className="p-0 max-w-2xl">
          <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-kumo-hairline">
            <div>
              <Dialog.Title>
                <Text variant="heading3">Composio directory</Text>
              </Dialog.Title>
              <Dialog.Description>
                <Text variant="secondary" size="sm">
                  Pick a tool to add to this space. You'll be prompted to authenticate.
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
          <div className="max-h-[420px] overflow-y-auto p-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {COMPOSIO_DIRECTORY.filter(
                (c) => !space.tools.some((t) => t.id === c.id)
              ).map((c) => {
                const Icon = c.icon;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      onAddTool(space.id, c);
                      setAddToolOpen(false);
                    }}
                    className="text-left flex items-center gap-3 p-3 rounded-lg border border-kumo-hairline hover:border-kumo-line hover:bg-kumo-tint transition-colors cursor-pointer"
                  >
                    <div className="w-9 h-9 rounded-md bg-kumo-tint flex items-center justify-center shrink-0">
                      <Icon size={18} className="text-kumo-default" weight="duotone" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Text variant="mono" size="sm">{c.name}</Text>
                        <Text variant="secondary" size="xs">· {c.provider}</Text>
                      </div>
                      <Text variant="secondary" size="xs" truncate as="p">
                        {c.description}
                      </Text>
                    </div>
                    <PlusIcon size={14} className="text-kumo-subtle shrink-0" />
                  </button>
                );
              })}
            </div>
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
                    <Table.Cell><Text variant="mono-secondary" size="xs">{run.id}</Text></Table.Cell>
                    <Table.Cell><Text variant="mono-secondary" size="xs">{run.triggeredBy}</Text></Table.Cell>
                    <Table.Cell><Text variant="mono-secondary" size="xs">{run.startedAt}</Text></Table.Cell>
                    <Table.Cell><Text variant="mono-secondary" size="xs">{run.duration}</Text></Table.Cell>
                    <Table.Cell><Text variant="mono" size="xs">{run.toolCalls}</Text></Table.Cell>
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

const SPACE_ICONS: Record<string, React.ComponentType<{ size?: number; weight?: "fill" | "duotone" | "regular"; className?: string }>> = {
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
  { icon: React.ComponentType<{ size?: number; className?: string }>; variant: "warning" | "info" | "error" | "primary" }
> = {
  deploy: { icon: RocketIcon, variant: "warning" },
  send_email: { icon: EnvelopeIcon, variant: "info" },
  github_write: { icon: GitPullRequestIcon, variant: "primary" },
  search_docs: { icon: MagnifyingGlassIcon, variant: "info" },
  run_query: { icon: DatabaseIcon, variant: "info" },
  slack_post: { icon: ChatCircleIcon, variant: "info" },
  github_read: { icon: GitBranchIcon, variant: "info" },
  jira: { icon: WrenchIcon, variant: "info" },
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
                      <Text variant="mono-secondary" size="xs">{apr.spaceName}</Text>
                    </span>
                    <span className="inline-flex items-center gap-1 text-kumo-subtle">
                      <HashIcon size={12} />
                      <Text variant="mono-secondary" size="xs">{apr.channel}</Text>
                    </span>
                    <span className="inline-flex items-center gap-1 text-kumo-subtle">
                      <ClockIcon size={12} />
                      <Text variant="mono-secondary" size="xs">{apr.requestedAt}</Text>
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
                <Text variant="mono-secondary" size="xs">
                  {ACTIVITY_24H.reduce((a, x) => a + x.runs, 0)} runs
                </Text>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-kumo-danger" />
                <Text variant="mono-secondary" size="xs">
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
                <Table.Cell><Text variant="mono-secondary" size="xs">{run.id}</Text></Table.Cell>
                <Table.Cell><Text>{run.spaceName}</Text></Table.Cell>
                <Table.Cell>
                  <span className="inline-flex items-center gap-1 text-kumo-subtle">
                    <HashIcon size={12} />
                    <Text variant="mono-secondary" size="xs">{run.channel}</Text>
                  </span>
                </Table.Cell>
                <Table.Cell><Text variant="mono-secondary" size="xs">{run.triggeredBy}</Text></Table.Cell>
                <Table.Cell><Text variant="mono-secondary" size="xs">{run.startedAt}</Text></Table.Cell>
                <Table.Cell><Text variant="mono-secondary" size="xs">{run.duration}</Text></Table.Cell>
                <Table.Cell><Text variant="mono" size="xs">{run.toolCalls}</Text></Table.Cell>
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
  const eventIconMap: Record<RunEventType, React.ReactNode> = {
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
                      <Text variant="mono-secondary" size="xs">
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
                      <Text variant="mono-secondary" size="xs" as="p">
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

const SLACK_CHANNELS = [
  "general",
  "engineering",
  "product",
  "design",
  "support-bot",
  "eng-help",
  "sales-team",
  "devops-alerts",
  "incidents",
  "releases",
];

function NewSpaceView({
  onBack,
  onCreate,
  existingChannels,
}: {
  onBack: () => void;
  onCreate: (name: string, channel: string) => void;
  existingChannels: string[];
}) {
  const [name, setName] = useState("");
  const [channel, setChannel] = useState("");

  const availableChannels = SLACK_CHANNELS.filter(
    (c) => !existingChannels.includes(c)
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && channel.trim()) {
      onCreate(name.trim(), channel.trim().replace(/^#/, ""));
    }
  };

  return (
    <div className="max-w-xl">
      <BackLink label="All Spaces" onClick={onBack} />
      <PageHeader
        title="New Space"
        description="Connect an AI agent to a Slack channel."
      />

      <form onSubmit={handleSubmit}>
        <LayerCard>
          <LayerCard.Primary>
            <div className="flex flex-col gap-5">
              <Field label="Space name" description="Shown in the dashboard and Slack.">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Customer Support"
                  autoFocus
                />
              </Field>

              <Field
                label="Slack channel"
                description="The agent will listen for messages in this channel."
              >
                <div className="flex flex-col gap-2">
                  <Input
                    value={channel}
                    onChange={(e) => setChannel(e.target.value.replace(/^#/, ""))}
                    placeholder="channel-name"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {availableChannels.slice(0, 8).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setChannel(c)}
                        className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-md border transition-colors",
                          channel === c
                            ? "border-kumo-line bg-kumo-tint text-kumo-default"
                            : "border-kumo-hairline text-kumo-subtle hover:text-kumo-default hover:bg-kumo-tint"
                        )}
                      >
                        <HashIcon size={11} />
                        <Text variant="mono-secondary" size="xs">
                          {c}
                        </Text>
                      </button>
                    ))}
                  </div>
                </div>
              </Field>
            </div>
          </LayerCard.Primary>
          <LayerCard.Secondary className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={onBack} type="button">
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={!name.trim() || !channel.trim()}
            >
              Create Space
            </Button>
          </LayerCard.Secondary>
        </LayerCard>
      </form>
    </div>
  );
}

// ===== App =====

export default function App() {
  const [view, setView] = useState<View>({ page: "spaces" });
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [eventsByRun, setEventsByRun] = useState<Record<string, RunEvent[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setError(null);
    const payload = await loadControlPlane();
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

  const persistTools = async (spaceId: string, enabledTools: string[]) => {
    await updateSpaceConfig(spaceId, { enabledTools });
    await refresh();
  };

  const persistRepos = async (spaceId: string, repos: Repo[]) => {
    await updateSpaceConfig(spaceId, { repoUrls: repos.map((repo) => repo.id) });
    await refresh();
  };

  const handleToggleTool = async (spaceId: string, toolId: string) => {
    const space = spaces.find((s) => s.id === spaceId);
    if (!space) return;
    const enabled = new Set(space.tools.filter((tool) => tool.enabled).map((tool) => tool.id));
    if (enabled.has(toolId)) enabled.delete(toolId);
    else enabled.add(toolId);
    updateSpace(spaceId, (s) => ({
      ...s,
      tools: s.tools.map((t) => (t.id === toolId ? { ...t, enabled: !t.enabled } : t)),
    }));
    try {
      await persistTools(spaceId, [...enabled]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update tools");
      await refresh().catch(() => undefined);
    }
  };

  const handleAuthTool = async (spaceId: string, toolId: string) => {
    const space = spaces.find((s) => s.id === spaceId);
    if (!space) return;
    const enabled = Array.from(new Set([...space.tools.filter((tool) => tool.enabled).map((tool) => tool.id), toolId]));
    updateSpace(spaceId, (s) => ({
      ...s,
      tools: s.tools.map((t) =>
        t.id === toolId ? { ...t, authState: "connected", enabled: true } : t
      ),
    }));
    try {
      await persistTools(spaceId, enabled);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to authenticate tool");
      await refresh().catch(() => undefined);
    }
  };

  const handleAddTool = async (spaceId: string, composio: ComposioTool) => {
    const space = spaces.find((s) => s.id === spaceId);
    if (!space) return;
    const enabled = Array.from(new Set([...space.tools.filter((tool) => tool.enabled).map((tool) => tool.id), composio.id]));
    updateSpace(spaceId, (s) => ({
      ...s,
      tools: s.tools.some((tool) => tool.id === composio.id)
        ? s.tools
        : [
            ...s.tools,
            {
          id: composio.id,
          name: composio.name,
          description: composio.description,
          provider: composio.provider,
              enabled: true,
              authState: "connected",
            },
          ],
    }));
    try {
      await persistTools(spaceId, enabled);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add tool");
      await refresh().catch(() => undefined);
    }
  };

  const handleRemoveTool = async (spaceId: string, toolId: string) => {
    const space = spaces.find((s) => s.id === spaceId);
    if (!space) return;
    const enabled = space.tools.filter((tool) => tool.id !== toolId && tool.enabled).map((tool) => tool.id);
    updateSpace(spaceId, (s) => ({
      ...s,
      tools: s.tools.filter((t) => t.id !== toolId),
    }));
    try {
      await persistTools(spaceId, enabled);
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

  const handleCreateSpace = async (name: string, channel: string) => {
    try {
      await createSpace({ name, channel });
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
    <div data-mode="light" className="h-screen w-screen bg-kumo-canvas">
      <Sidebar.Provider
        defaultOpen={false}
        collapsible="icon"
        peekable
        contained
        className="h-full"
      >
        <Sidebar variant="sidebar">
          <Sidebar.Header>
            <div className="flex items-center gap-2 px-2 py-1">
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
            <div className="flex items-center gap-2 px-2 py-2">
              <div className="w-7 h-7 rounded-full bg-kumo-tint flex items-center justify-center shrink-0">
                <Text variant="mono" size="xs">A</Text>
              </div>
              <div className="min-w-0">
                <Text size="sm" truncate>Admin</Text>
                <Text variant="mono-secondary" size="xs" truncate>
                  acme.workspace
                </Text>
              </div>
            </div>
          </Sidebar.Footer>
        </Sidebar>

        <main className="flex-1 overflow-y-auto bg-kumo-canvas">
          <div className="p-6 max-w-6xl mx-auto">
            {error && (
              <LayerCard className="mb-4 border-kumo-danger/40">
                <LayerCard.Primary>
                  <Text variant="error" size="sm">{error}</Text>
                </LayerCard.Primary>
              </LayerCard>
            )}
            {loading && (
              <LayerCard>
                <LayerCard.Primary>
                  <Empty
                    icon={<ArrowClockwiseIcon size={40} />}
                    title="Loading control plane"
                    description="Fetching spaces, runs, and approvals."
                  />
                </LayerCard.Primary>
              </LayerCard>
            )}
            {!loading && (
              <>
            {view.page === "spaces" && (
              <SpacesView
                spaces={spaces}
                runs={runs}
                onSelectSpace={(id) => setView({ page: "space-detail", id })}
                onNewSpace={() => setView({ page: "new-space" })}
                onSelectRun={(id) => setView({ page: "run-detail", id })}
              />
            )}
            {view.page === "space-detail" && currentSpace && (
              <SpaceDetailView
                space={currentSpace}
                runs={runs}
                onBack={() => setView({ page: "spaces" })}
                onToggleTool={handleToggleTool}
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
            {view.page === "new-space" && (
              <NewSpaceView
                onBack={() => setView({ page: "spaces" })}
                onCreate={handleCreateSpace}
                existingChannels={spaces.map((s) => s.channel)}
              />
            )}
              </>
            )}
          </div>
        </main>
      </Sidebar.Provider>
    </div>
  );
}
