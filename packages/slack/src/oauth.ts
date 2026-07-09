export const DEFAULT_SLACK_BOT_SCOPES = [
  "app_mentions:read",
  "channels:history",
  "channels:join",
  "channels:read",
  "chat:write",
  "chat:write.public",
  "files:read",
  "files:write",
  "groups:history",
  "groups:read",
  "reactions:read",
  "reactions:write",
  "users:read",
] as const;

export type SlackOAuthAccessResponse = {
  ok: boolean;
  error?: string;
  access_token?: string;
  token_type?: string;
  scope?: string;
  bot_user_id?: string;
  app_id?: string;
  refresh_token?: string;
  expires_in?: number;
  team?: { id?: string; name?: string };
  enterprise?: { id?: string; name?: string };
  authed_user?: { id?: string };
};

export function buildSlackAuthorizeUrl(args: {
  clientId: string;
  redirectUri: string;
  state: string;
  scopes?: string[];
  teamId?: string;
}): string {
  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", args.clientId);
  url.searchParams.set("redirect_uri", args.redirectUri);
  url.searchParams.set("state", args.state);
  url.searchParams.set("scope", (args.scopes ?? [...DEFAULT_SLACK_BOT_SCOPES]).join(","));
  if (args.teamId) url.searchParams.set("team", args.teamId);
  return url.toString();
}

export async function exchangeSlackOAuthCode(args: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  fetchFn?: typeof fetch;
}): Promise<SlackOAuthAccessResponse> {
  const fetchImpl = args.fetchFn ?? fetch;
  const body = new URLSearchParams({
    code: args.code,
    redirect_uri: args.redirectUri,
  });

  const response = await fetchImpl("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${args.clientId}:${args.clientSecret}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const payload = (await response.json()) as SlackOAuthAccessResponse;
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error ?? `Slack OAuth exchange failed with ${response.status}`);
  }
  return payload;
}
