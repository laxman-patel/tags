import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { artifactKindEnum, memoryKindEnum } from "./enums";
import { organizations, spaces, users } from "./org";
import { messages, runs, threads } from "./runtime";
import { sourceEnum } from "./enums";

export const approvalPolicies = pgTable("approval_policies", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  name: text("name").notNull(),
  requireAdminRole: boolean("require_admin_role").notNull().default(false),
  approverAllowlist: jsonb("approver_allowlist").$type<string[]>().notNull().default([]),
  allowSelfApprove: boolean("allow_self_approve").notNull().default(false),
  defaultExpiryMinutes: integer("default_expiry_minutes").notNull().default(60),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const budgetPolicies = pgTable("budget_policies", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  name: text("name").notNull(),
  monthlyBudgetMicroUsd: bigint("monthly_budget_micro_usd", { mode: "number" })
    .notNull()
    .default(0),
  hardLimit: boolean("hard_limit").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const memoryPolicies = pgTable("memory_policies", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  name: text("name").notNull(),
  allowAgentProposed: boolean("allow_agent_proposed").notNull().default(true),
  requireApprovalForSensitive: boolean("require_approval_for_sensitive")
    .notNull()
    .default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const memories = pgTable("memories", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  spaceId: uuid("space_id")
    .notNull()
    .references(() => spaces.id),
  kind: memoryKindEnum("kind").notNull(),
  content: text("content").notNull(),
  searchText: text("search_text").notNull(),
  sourceThreadId: uuid("source_thread_id").references(() => threads.id),
  sourceMessageId: uuid("source_message_id").references(() => messages.id),
  confidence: integer("confidence").notNull().default(50),
  createdBy: sourceEnum("created_by").notNull().default("agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const artifacts = pgTable("artifacts", {
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
  runId: uuid("run_id")
    .notNull()
    .references(() => runs.id),
  kind: artifactKindEnum("kind").notNull(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  contentRef: text("content_ref"),
  contentType: text("content_type"),
  sizeBytes: bigint("size_bytes", { mode: "number" }),
  metadata: jsonb("metadata"),
  body: text("body"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const auditEvents = pgTable("audit_events", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  spaceId: uuid("space_id").references(() => spaces.id),
  actorUserId: uuid("actor_user_id").references(() => users.id),
  actorType: sourceEnum("actor_type").notNull().default("system"),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const usageRecords = pgTable("usage_records", {
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
  modelId: text("model_id").notNull(),
  provider: text("provider"),
  promptTokens: integer("prompt_tokens").notNull().default(0),
  completionTokens: integer("completion_tokens").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  costMicroUsd: bigint("cost_micro_usd", { mode: "number" }).notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const schedules = pgTable("schedules", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  spaceId: uuid("space_id")
    .notNull()
    .references(() => spaces.id),
  cron: text("cron").notNull(),
  timezone: text("timezone").notNull().default("UTC"),
  prompt: text("prompt").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
