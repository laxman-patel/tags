import {
  bigint,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  authorTypeEnum,
  approvalStatusEnum,
  riskLevelEnum,
  runStatusEnum,
  runTriggerEnum,
  threadStatusEnum,
  toolStatusEnum,
} from "./enums";
import { organizations } from "./org";
import { spaces } from "./org";
import { users } from "./org";

export const threads = pgTable(
  "threads",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id),
    providerThreadId: text("provider_thread_id").notNull(),
    rootMessageId: text("root_message_id").notNull(),
    title: text("title"),
    summary: jsonb("summary"),
    status: threadStatusEnum("status").notNull().default("open"),
    activeRunId: uuid("active_run_id"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("threads_space_provider_thread_idx").on(
      table.spaceId,
      table.providerThreadId,
    ),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id),
    providerMessageId: text("provider_message_id").notNull(),
    authorType: authorTypeEnum("author_type").notNull(),
    authorId: text("author_id").notNull(),
    text: text("text").notNull(),
    uiMessageJson: jsonb("ui_message_json"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("messages_thread_provider_message_idx").on(
      table.threadId,
      table.providerMessageId,
    ),
  ],
);

export const runs = pgTable(
  "runs",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id),
    spaceConfigVersion: integer("space_config_version").notNull(),
    workflowRunId: text("workflow_run_id"),
    status: runStatusEnum("status").notNull().default("queued"),
    trigger: runTriggerEnum("trigger").notNull(),
    modelId: text("model_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    inputMessageId: uuid("input_message_id").references(() => messages.id),
    tokenUsage: jsonb("token_usage").$type<{
      prompt: number;
      completion: number;
      total: number;
    }>(),
    costMicroUsd: bigint("cost_micro_usd", { mode: "number" }),
    error: jsonb("error").$type<{ code: string; message: string }>(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("runs_idempotency_key_idx").on(table.idempotencyKey)],
);

export const runEvents = pgTable(
  "run_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id),
    seq: bigint("seq", { mode: "number" }).notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("run_events_run_seq_idx").on(table.runId, table.seq)],
);

export const toolInvocations = pgTable(
  "tool_invocations",
  {
    id: uuid("id").primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id),
    toolName: text("tool_name").notNull(),
    toolInput: jsonb("tool_input").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    externalResourceKind: text("external_resource_kind"),
    externalResourceId: text("external_resource_id"),
    status: toolStatusEnum("status").notNull().default("pending"),
    result: jsonb("result"),
    error: jsonb("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("tool_invocations_idempotency_key_idx").on(table.idempotencyKey),
  ],
);

export const approvalRequests = pgTable(
  "approval_requests",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id),
    toolInvocationId: uuid("tool_invocation_id")
      .notNull()
      .references(() => toolInvocations.id),
    requestId: text("request_id").notNull(),
    toolName: text("tool_name").notNull(),
    toolInput: jsonb("tool_input").notNull(),
    riskLevel: riskLevelEnum("risk_level").notNull(),
    requestText: text("request_text").notNull(),
    status: approvalStatusEnum("status").notNull().default("pending"),
    requestedByUserId: uuid("requested_by_user_id").references(() => users.id),
    requestedBySlackUserId: text("requested_by_slack_user_id"),
    resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("approval_requests_request_id_idx").on(table.requestId)],
);
