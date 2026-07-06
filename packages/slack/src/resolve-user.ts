import type { WebClient } from "@slack/web-api";
import { and, eq, inArray, users, type Db } from "@tags/db";
import { resolveOrCreateUser } from "@tags/core/users";

export function slackUserDisplayName(user: {
  name?: string;
  real_name?: string;
  profile?: { display_name?: string; real_name?: string };
} | undefined): string | null {
  if (!user) return null;
  const candidates = [
    user.name,
    user.profile?.display_name,
    user.profile?.real_name,
    user.real_name,
  ];
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

export async function ensureSlackUserDisplayName(
  slack: WebClient,
  db: Db,
  args: {
    organizationId: string;
    slackUserId: string;
  },
): Promise<string | null> {
  const { organizationId, slackUserId } = args;
  if (!slackUserId || slackUserId === "unknown" || slackUserId === "schedule") {
    return null;
  }

  try {
    const info = await slack.users.info({ user: slackUserId });
    const name = slackUserDisplayName(info.user);
    if (!name) return null;
    await resolveOrCreateUser(db, { organizationId, slackUserId, displayName: name });
    return name;
  } catch {
    return null;
  }
}

export async function resolveSlackUserDisplayNames(
  slack: WebClient | undefined,
  db: Db,
  organizationId: string,
  slackUserIds: Set<string>,
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (slackUserIds.size === 0) return names;

  const cachedUsers = await db
    .select({
      externalUserId: users.externalUserId,
      displayName: users.displayName,
    })
    .from(users)
    .where(
      and(
        eq(users.organizationId, organizationId),
        eq(users.externalProvider, "slack"),
        inArray(users.externalUserId, [...slackUserIds]),
      ),
    );

  for (const user of cachedUsers) {
    const displayName = user.displayName?.trim();
    if (displayName) {
      names.set(user.externalUserId, displayName);
    }
  }

  if (!slack) return names;

  for (const slackUserId of slackUserIds) {
    if (names.has(slackUserId)) continue;
    const name = await ensureSlackUserDisplayName(slack, db, { organizationId, slackUserId });
    if (name) names.set(slackUserId, name);
  }

  return names;
}
