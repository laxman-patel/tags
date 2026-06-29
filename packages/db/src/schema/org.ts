import {
  boolean,
  bigint,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { providerEnum, userRoleEnum } from "./enums";

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    externalProvider: text("external_provider").notNull(),
    externalUserId: text("external_user_id").notNull(),
    displayName: text("display_name"),
    role: userRoleEnum("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("users_org_provider_external_idx").on(
      table.organizationId,
      table.externalProvider,
      table.externalUserId,
    ),
  ],
);

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    provider: providerEnum("provider").notNull(),
    externalWorkspaceId: text("external_workspace_id").notNull(),
    connectInstallationId: text("connect_installation_id"),
    name: text("name"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("workspaces_provider_external_idx").on(
      table.provider,
      table.externalWorkspaceId,
    ),
  ],
);

export const spaces = pgTable(
  "spaces",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    provider: providerEnum("provider").notNull(),
    externalSpaceId: text("external_space_id").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    approvalPolicyId: uuid("approval_policy_id"),
    budgetPolicyId: uuid("budget_policy_id"),
    memoryPolicyId: uuid("memory_policy_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("spaces_workspace_external_idx").on(
      table.workspaceId,
      table.externalSpaceId,
    ),
    uniqueIndex("spaces_org_slug_idx").on(table.organizationId, table.slug),
  ],
);

export const spaceConfigs = pgTable(
  "space_configs",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id),
    version: integer("version").notNull(),
    modelId: text("model_id").notNull(),
    reasoning: text("reasoning").notNull().default("provider-default"),
    instructions: text("instructions").notNull(),
    enabledSkills: jsonb("enabled_skills").$type<string[]>().notNull().default([]),
    enabledTools: jsonb("enabled_tools").$type<string[]>().notNull().default([]),
    enabledConnections: jsonb("enabled_connections").$type<string[]>().notNull().default([]),
    maxSteps: integer("max_steps").notNull().default(12),
    runtimeMode: text("runtime_mode").notNull().default("opencode"),
    isActive: boolean("is_active").notNull().default(false),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
    (table) => [
    uniqueIndex("space_configs_space_version_idx").on(table.spaceId, table.version),
  ],
);
