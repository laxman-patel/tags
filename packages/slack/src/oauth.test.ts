import { describe, expect, it } from "vitest";
import { DEFAULT_SLACK_BOT_SCOPES, buildSlackAuthorizeUrl, exchangeSlackOAuthCode } from "./oauth";

describe("Slack OAuth helpers", () => {
  it("includes users:read in default bot scopes for trigger display names", () => {
    expect(DEFAULT_SLACK_BOT_SCOPES).toContain("users:read");
  });

  it("builds Slack OAuth v2 authorize URLs with redirect, state, scopes, and team hint", () => {
    const url = new URL(
      buildSlackAuthorizeUrl({
        clientId: "123.abc",
        redirectUri: "https://tags.example.com/api/slack/oauth/callback",
        state: "state_123",
        scopes: ["channels:read", "chat:write"],
        teamId: "T123",
      }),
    );

    expect(url.origin + url.pathname).toBe("https://slack.com/oauth/v2/authorize");
    expect(url.searchParams.get("client_id")).toBe("123.abc");
    expect(url.searchParams.get("redirect_uri")).toBe("https://tags.example.com/api/slack/oauth/callback");
    expect(url.searchParams.get("state")).toBe("state_123");
    expect(url.searchParams.get("scope")).toBe("channels:read,chat:write");
    expect(url.searchParams.get("team")).toBe("T123");
  });

  it("exchanges OAuth code with HTTP Basic auth and form encoding", async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    const fetchFn: typeof fetch = async (input, init) => {
      calls.push({ input: String(input), init });
      return new Response(
        JSON.stringify({
          ok: true,
          access_token: "xoxb-token",
          team: { id: "T123", name: "Acme" },
        }),
        { status: 200 },
      );
    };

    const result = await exchangeSlackOAuthCode({
      clientId: "client",
      clientSecret: "secret",
      code: "oauth-code",
      redirectUri: "https://tags.example.com/callback",
      fetchFn,
    });

    expect(result.access_token).toBe("xoxb-token");
    expect(calls[0]?.input).toBe("https://slack.com/api/oauth.v2.access");
    const init = calls[0]?.init;
    if (!init) throw new Error("fetch init was not captured");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      authorization: `Basic ${Buffer.from("client:secret").toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    });
    expect(init.body).toBeInstanceOf(URLSearchParams);
    expect((init.body as URLSearchParams).get("code")).toBe("oauth-code");
    expect((init.body as URLSearchParams).get("redirect_uri")).toBe("https://tags.example.com/callback");
  });

  it("throws Slack API errors", async () => {
    await expect(
      exchangeSlackOAuthCode({
        clientId: "client",
        clientSecret: "secret",
        code: "bad-code",
        redirectUri: "https://tags.example.com/callback",
        fetchFn: async () => new Response(JSON.stringify({ ok: false, error: "bad_code" }), { status: 200 }),
      }),
    ).rejects.toThrow("bad_code");
  });
});
