import { describe, expect, it, vi } from "vitest";
import { uploadThreadFile } from "./client";

describe("uploadThreadFile", () => {
  it("calls Slack uploadV2 with thread metadata", async () => {
    const uploadV2 = vi.fn(async () => ({
      ok: true,
      file: { id: "F123", permalink: "https://slack.example/F123" },
    }));
    const client = { files: { uploadV2 } } as never;
    const file = Buffer.from("mp4");

    const result = await uploadThreadFile(client, {
      channelId: "C123",
      threadTs: "123.456",
      file,
      filename: "demo.mp4",
      title: "Demo",
      initialComment: "watch this",
    });

    expect(result).toEqual({ fileId: "F123", permalink: "https://slack.example/F123" });
    expect(uploadV2).toHaveBeenCalledWith({
      channel_id: "C123",
      thread_ts: "123.456",
      file,
      filename: "demo.mp4",
      title: "Demo",
      initial_comment: "watch this",
    });
  });
});
