import { eq } from "drizzle-orm";
import type { WebClient } from "@slack/web-api";
import { decryptSlackBotToken } from "@tags/core/slack-installations";
import { createDb, workspaces, type Db } from "@tags/db";
import { createSlackClient } from "@tags/slack";
import { buildRuntimeProviderConfig, loadRuntimeSecrets } from "../secrets";
import type { RuntimeProviderConfig } from "../providers";
import type { RuntimeSecrets } from "../secrets";

export async function loadWorkspaceRuntime(workspaceId: string): Promise<{
  secrets: RuntimeSecrets;
  db: Db;
  slack: WebClient;
  providerConfig: RuntimeProviderConfig;
}> {
  const secrets = loadRuntimeSecrets();
  const db = createDb(secrets.databaseUrl);

  const rows = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  const workspace = rows[0];
  const encryptedToken = workspace?.botAccessTokenCiphertext;
  let slackBotToken = secrets.slackBotToken;

  if (encryptedToken) {
    if (!secrets.encryptionKey) {
      throw new Error("TAGS_ENCRYPTION_KEY is required for Slack workspace tokens");
    }
    slackBotToken = decryptSlackBotToken(workspace, secrets.encryptionKey);
  }

  if (!slackBotToken) {
    throw new Error(`No Slack bot token is configured for workspace ${workspaceId}`);
  }

  const slack = createSlackClient(slackBotToken);
  const providerConfig = buildRuntimeProviderConfig(secrets, { slackBotToken });

  return { secrets, db, slack, providerConfig };
}
