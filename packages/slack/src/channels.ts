import type { WebClient } from "@slack/web-api";

export type SlackChannelSummary = {
  id: string;
  name: string;
  isPrivate: boolean;
  isMember: boolean;
};

export async function listSlackChannels(client: WebClient): Promise<SlackChannelSummary[]> {
  const channels: SlackChannelSummary[] = [];
  let cursor: string | undefined;

  do {
    const page = await client.conversations.list({
      cursor,
      exclude_archived: true,
      limit: 200,
      types: "public_channel,private_channel",
    });

    if (!page.ok) throw new Error(page.error ?? "Failed to list Slack channels");

    for (const channel of page.channels ?? []) {
      if (!channel.id || !channel.name) continue;
      channels.push({
        id: channel.id,
        name: channel.name,
        isPrivate: Boolean(channel.is_private),
        isMember: Boolean(channel.is_member),
      });
    }
    cursor = page.response_metadata?.next_cursor || undefined;
  } while (cursor);

  return channels;
}

export async function joinSlackChannel(client: WebClient, channelId: string): Promise<void> {
  const result = await client.conversations.join({ channel: channelId });
  if (!result.ok) throw new Error(result.error ?? "Failed to join Slack channel");
}

export async function authTest(client: WebClient): Promise<{
  ok: boolean;
  teamId?: string;
  userId?: string;
  botId?: string;
}> {
  const result = await client.auth.test();
  if (!result.ok) throw new Error(result.error ?? "Slack auth.test failed");
  return {
    ok: true,
    teamId: result.team_id,
    userId: result.user_id,
    botId: result.bot_id,
  };
}
