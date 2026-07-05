import { describe, expect, it, vi } from "vitest";
import type { WebClient } from "@slack/web-api";
import { authTest, joinSlackChannel, listSlackChannels } from "./channels";

describe("Slack channel helpers", () => {
  it("lists public and private Slack channels with membership state", async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        channels: [
          { id: "C_PUBLIC", name: "general", is_private: false, is_member: false },
        ],
        response_metadata: { next_cursor: "cursor-2" },
      })
      .mockResolvedValueOnce({
        ok: true,
        channels: [
          { id: "G_PRIVATE", name: "ops-private", is_private: true, is_member: true },
        ],
        response_metadata: { next_cursor: "" },
      });
    const client = { conversations: { list } } as unknown as WebClient;

    await expect(listSlackChannels(client)).resolves.toEqual([
      { id: "C_PUBLIC", name: "general", isPrivate: false, isMember: false },
      { id: "G_PRIVATE", name: "ops-private", isPrivate: true, isMember: true },
    ]);
    expect(list).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ types: "public_channel,private_channel", limit: 200 }),
    );
    expect(list).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ cursor: "cursor-2" }),
    );
  });

  it("joins a public Slack channel by ID", async () => {
    const join = vi.fn(async () => ({ ok: true }));
    const client = { conversations: { join } } as unknown as WebClient;

    await joinSlackChannel(client, "C_PUBLIC");

    expect(join).toHaveBeenCalledWith({ channel: "C_PUBLIC" });
  });

  it("returns auth.test identity metadata", async () => {
    const test = vi.fn(async () => ({
      ok: true,
      team_id: "T123",
      user_id: "U_BOT",
      bot_id: "B123",
    }));
    const client = { auth: { test } } as unknown as WebClient;

    await expect(authTest(client)).resolves.toEqual({
      ok: true,
      teamId: "T123",
      userId: "U_BOT",
      botId: "B123",
    });
  });
});
