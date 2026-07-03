import { describe, expect, it } from "vitest";
import {
  formatChannelContext,
  isChannelContextRequest,
  isTopLevelChannelMessage,
  packChannelContext,
} from "./channel-context";
import type { SlackChannelMessage } from "./client";

describe("channel context", () => {
  it("detects channel summary requests", () => {
    expect(isChannelContextRequest("@tags summarize the convo in this channel")).toBe(true);
    expect(isChannelContextRequest("@tags summarize this thread")).toBe(false);
  });

  it("keeps only top-level channel posts", () => {
    expect(
      isTopLevelChannelMessage({
        ts: "1.0",
        text: "hello",
      }),
    ).toBe(true);
    expect(
      isTopLevelChannelMessage({
        ts: "1.1",
        thread_ts: "1.0",
        text: "reply",
      }),
    ).toBe(false);
    expect(
      isTopLevelChannelMessage({
        ts: "1.0",
        thread_ts: "1.0",
        text: "thread parent",
        reply_count: 2,
      }),
    ).toBe(true);
  });

  it("formats and packs channel history for prompts", () => {
    const messages: SlackChannelMessage[] = [
      { ts: "1.0", user: "U1", text: "first topic" },
      { ts: "2.0", user: "U2", text: "follow-up", reply_count: 3 },
    ];

    const formatted = formatChannelContext(messages);
    expect(formatted).toContain("U1: first topic");
    expect(formatted).toContain("3 replies in thread");
    expect(packChannelContext(formatted)).toContain("Recent channel messages");
  });
});
