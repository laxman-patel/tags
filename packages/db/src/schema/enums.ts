import { pgEnum } from "drizzle-orm/pg-core";

export const providerEnum = pgEnum("provider", ["slack"]);

export const userRoleEnum = pgEnum("user_role", ["owner", "admin", "member"]);

export const authorTypeEnum = pgEnum("author_type", ["human", "agent", "system"]);

export const threadStatusEnum = pgEnum("thread_status", [
  "open",
  "running",
  "waiting",
  "done",
  "failed",
]);

export const runStatusEnum = pgEnum("run_status", [
  "queued",
  "streaming",
  "waiting",
  "done",
  "failed",
  "cancelled",
]);

export const runTriggerEnum = pgEnum("run_trigger", [
  "mention",
  "reply",
  "schedule",
  "approval_response",
]);

export const toolStatusEnum = pgEnum("tool_status", [
  "pending",
  "succeeded",
  "failed",
]);

export const approvalStatusEnum = pgEnum("approval_status", [
  "pending",
  "approved",
  "rejected",
  "expired",
]);

export const riskLevelEnum = pgEnum("risk_level", [
  "none",
  "low",
  "medium",
  "high",
]);

export const reasoningEffortEnum = pgEnum("reasoning_effort", [
  "provider-default",
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
]);

export const sourceEnum = pgEnum("source", ["human", "agent", "system"]);

export const memoryKindEnum = pgEnum("memory_kind", [
  "fact",
  "summary",
  "preference",
  "decision",
  "artifact",
]);

export const artifactKindEnum = pgEnum("artifact_kind", [
  "markdown",
  "html",
  "diff",
  "image",
  "table",
  "json",
  "link",
]);
