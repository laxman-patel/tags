import { lt } from "drizzle-orm";
import { and, eq, isNull, or } from "@tags/db";
import type { Db } from "@tags/db";
import { newId, spaceSandboxSessions } from "@tags/db";

export type SpaceSandboxStatus = "ready" | "leased" | "expired" | "failed";

/** Must stay above the opencode command timeout in e2b-provider (20m). */
export const DEFAULT_SPACE_SANDBOX_LEASE_MS = 25 * 60_000;

export type SpaceSandboxSession = typeof spaceSandboxSessions.$inferSelect;

export type SpaceSandboxConfig = {
  organizationId: string;
  spaceId: string;
  template: string;
  repoUrl?: string | null;
  workdir: string;
};

function normalizeRepoUrl(repoUrl: string | null | undefined): string | null {
  return repoUrl ?? null;
}

function hasConfigDrift(
  session: SpaceSandboxSession,
  config: Pick<SpaceSandboxConfig, "template" | "repoUrl" | "workdir">,
): boolean {
  return (
    session.template !== config.template ||
    session.repoUrl !== normalizeRepoUrl(config.repoUrl) ||
    session.workdir !== config.workdir
  );
}

function isLeaseStale(session: Pick<SpaceSandboxSession, "leaseExpiresAt">, now: Date): boolean {
  return Boolean(session.leaseExpiresAt && session.leaseExpiresAt < now);
}

export function canAcquireSpaceSandboxLease(
  session: Pick<SpaceSandboxSession, "activeRunId" | "leaseExpiresAt">,
  args: { runId: string; now?: Date },
): boolean {
  const now = args.now ?? new Date();
  return (
    session.activeRunId === null ||
    session.activeRunId === args.runId ||
    isLeaseStale(session, now)
  );
}

export async function getOrCreateSpaceSandboxSession(
  db: Db,
  config: SpaceSandboxConfig,
): Promise<SpaceSandboxSession> {
  const existing = await db
    .select()
    .from(spaceSandboxSessions)
    .where(eq(spaceSandboxSessions.spaceId, config.spaceId))
    .limit(1);

  const current = existing[0];
  if (current) {
    const canReplace = current.status !== "leased" || isLeaseStale(current, new Date());
    if (hasConfigDrift(current, config) && canReplace) {
      const [updated] = await db
        .update(spaceSandboxSessions)
        .set({
          externalSandboxId: null,
          template: config.template,
          repoUrl: normalizeRepoUrl(config.repoUrl),
          workdir: config.workdir,
          status: "ready",
          activeRunId: null,
          leaseExpiresAt: null,
          metadata: {
            replacedReason: "space_config_changed",
            previousSandboxId: current.externalSandboxId,
          },
          updatedAt: new Date(),
        })
        .where(eq(spaceSandboxSessions.id, current.id))
        .returning();
      if (updated) return updated;
    }
    return current;
  }

  const [created] = await db
    .insert(spaceSandboxSessions)
    .values({
      id: newId(),
      organizationId: config.organizationId,
      spaceId: config.spaceId,
      template: config.template,
      repoUrl: normalizeRepoUrl(config.repoUrl),
      workdir: config.workdir,
      status: "ready",
    })
    .onConflictDoNothing()
    .returning();

  if (!created) {
    const rows = await db
      .select()
      .from(spaceSandboxSessions)
      .where(eq(spaceSandboxSessions.spaceId, config.spaceId))
      .limit(1);
    const raced = rows[0];
    if (raced) return raced;
  }

  if (!created) {
    throw new Error(`Failed to create sandbox session for space ${config.spaceId}`);
  }
  return created;
}

export async function acquireSpaceSandboxLease(
  db: Db,
  args: {
    spaceId: string;
    runId: string;
    leaseMs?: number;
    now?: Date;
  },
): Promise<SpaceSandboxSession | null> {
  const now = args.now ?? new Date();
  const leaseExpiresAt = new Date(now.getTime() + (args.leaseMs ?? DEFAULT_SPACE_SANDBOX_LEASE_MS));

  const [leased] = await db
    .update(spaceSandboxSessions)
    .set({
      status: "leased",
      activeRunId: args.runId,
      leaseExpiresAt,
      updatedAt: now,
    })
    .where(
      and(
        eq(spaceSandboxSessions.spaceId, args.spaceId),
        or(
          isNull(spaceSandboxSessions.activeRunId),
          eq(spaceSandboxSessions.activeRunId, args.runId),
          lt(spaceSandboxSessions.leaseExpiresAt, now),
        ),
      ),
    )
    .returning();

  return leased ?? null;
}

export async function releaseSpaceSandboxLease(
  db: Db,
  args: {
    spaceId: string;
    runId: string;
    status?: SpaceSandboxStatus;
    now?: Date;
  },
): Promise<SpaceSandboxSession | null> {
  const now = args.now ?? new Date();
  const [released] = await db
    .update(spaceSandboxSessions)
    .set({
      status: args.status ?? "ready",
      activeRunId: null,
      leaseExpiresAt: null,
      lastUsedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(spaceSandboxSessions.spaceId, args.spaceId),
        eq(spaceSandboxSessions.activeRunId, args.runId),
      ),
    )
    .returning();

  return released ?? null;
}

export async function recordSpaceSandboxExternalId(
  db: Db,
  args: {
    sessionId: string;
    externalSandboxId: string;
    metadata?: Record<string, unknown>;
    now?: Date;
  },
): Promise<SpaceSandboxSession | null> {
  const now = args.now ?? new Date();
  const [updated] = await db
    .update(spaceSandboxSessions)
    .set({
      externalSandboxId: args.externalSandboxId,
      lastUsedAt: now,
      metadata: args.metadata,
      updatedAt: now,
    })
    .where(eq(spaceSandboxSessions.id, args.sessionId))
    .returning();

  return updated ?? null;
}

export async function markSpaceSandboxSessionExpired(
  db: Db,
  args: {
    sessionId: string;
    reason: string;
    now?: Date;
  },
): Promise<void> {
  const now = args.now ?? new Date();
  await db
    .update(spaceSandboxSessions)
    .set({
      externalSandboxId: null,
      status: "expired",
      activeRunId: null,
      leaseExpiresAt: null,
      metadata: { expiredReason: args.reason },
      updatedAt: now,
    })
    .where(eq(spaceSandboxSessions.id, args.sessionId));
}
