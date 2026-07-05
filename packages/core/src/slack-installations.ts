import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@tags/db";
import { newId, workspaces } from "@tags/db";
import { decryptSecret, encryptSecret } from "./secret-box";

export class SlackWorkspaceAlreadyConnectedError extends Error {
  constructor(teamId: string) {
    super(`Slack workspace ${teamId} is already connected to another Tags account`);
    this.name = "SlackWorkspaceAlreadyConnectedError";
  }
}

export class OrganizationSlackWorkspaceConflictError extends Error {
  constructor() {
    super("This Tags account is already connected to a different Slack workspace");
    this.name = "OrganizationSlackWorkspaceConflictError";
  }
}

export type SlackInstallation = typeof workspaces.$inferSelect;

export async function getSlackInstallationForOrg(
  db: Db,
  organizationId: string,
): Promise<SlackInstallation | null> {
  const rows = await db
    .select()
    .from(workspaces)
    .where(
      and(
        eq(workspaces.organizationId, organizationId),
        eq(workspaces.provider, "slack"),
        sql`${workspaces.botAccessTokenCiphertext} is not null`,
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function getSlackInstallationByTeamId(
  db: Db,
  teamId: string,
): Promise<SlackInstallation | null> {
  const rows = await db
    .select()
    .from(workspaces)
    .where(
      and(
        eq(workspaces.provider, "slack"),
        eq(workspaces.externalWorkspaceId, teamId),
        sql`${workspaces.botAccessTokenCiphertext} is not null`,
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function assertWorkspaceConnectable(
  db: Db,
  args: { organizationId: string; teamId: string },
): Promise<void> {
  const [byTeam, byOrg] = await Promise.all([
    db
      .select()
      .from(workspaces)
      .where(
        and(
          eq(workspaces.provider, "slack"),
          eq(workspaces.externalWorkspaceId, args.teamId),
        ),
      )
      .limit(1),
    db
      .select()
      .from(workspaces)
      .where(
        and(
          eq(workspaces.provider, "slack"),
          eq(workspaces.organizationId, args.organizationId),
        ),
      )
      .limit(1),
  ]);

  const existingTeam = byTeam[0];
  if (existingTeam && existingTeam.organizationId !== args.organizationId) {
    throw new SlackWorkspaceAlreadyConnectedError(args.teamId);
  }

  const existingOrg = byOrg[0];
  if (existingOrg && existingOrg.externalWorkspaceId !== args.teamId) {
    throw new OrganizationSlackWorkspaceConflictError();
  }
}

export async function upsertSlackInstallation(
  db: Db,
  args: {
    organizationId: string;
    teamId: string;
    teamName?: string | null;
    botAccessToken: string;
    botRefreshToken?: string | null;
    botTokenExpiresAt?: Date | null;
    botUserId?: string | null;
    appId?: string | null;
    botScopes?: string[];
    installedBySlackUserId?: string | null;
    installedByUserId?: string | null;
    encryptionKey: string;
  },
): Promise<SlackInstallation> {
  await assertWorkspaceConnectable(db, {
    organizationId: args.organizationId,
    teamId: args.teamId,
  });

  const values = {
    organizationId: args.organizationId,
    provider: "slack" as const,
    externalWorkspaceId: args.teamId,
    name: args.teamName,
    botAccessTokenCiphertext: encryptSecret(args.botAccessToken, args.encryptionKey),
    botRefreshTokenCiphertext: args.botRefreshToken
      ? encryptSecret(args.botRefreshToken, args.encryptionKey)
      : null,
    botTokenExpiresAt: args.botTokenExpiresAt ?? null,
    botUserId: args.botUserId,
    appId: args.appId,
    botScopes: args.botScopes ?? [],
    installedBySlackUserId: args.installedBySlackUserId,
    installedByUserId: args.installedByUserId,
    updatedAt: new Date(),
  };

  const existing = await db
    .select()
    .from(workspaces)
    .where(
      and(
        eq(workspaces.organizationId, args.organizationId),
        eq(workspaces.provider, "slack"),
      ),
    )
    .limit(1);

  if (existing[0]) {
    const [row] = await db
      .update(workspaces)
      .set(values)
      .where(eq(workspaces.id, existing[0].id))
      .returning();
    if (!row) throw new Error("Failed to update Slack installation");
    return row;
  }

  const [row] = await db
    .insert(workspaces)
    .values({ id: newId(), ...values })
    .returning();

  if (!row) throw new Error("Failed to create Slack installation");
  return row;
}

export function decryptSlackBotToken(
  installation: Pick<SlackInstallation, "botAccessTokenCiphertext">,
  encryptionKey: string,
): string {
  if (!installation.botAccessTokenCiphertext) {
    throw new Error("Slack installation is missing a bot token");
  }
  return decryptSecret(installation.botAccessTokenCiphertext, encryptionKey);
}
