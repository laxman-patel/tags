import { describe, expect, it, vi } from "vitest";
import { appendStream, postThreadMessage, updateMessage, uploadThreadFile } from "./client";

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

describe("Slack message markdown formatting", () => {
  it("formats Markdown before posting a thread message", async () => {
    const postMessage = vi.fn(async () => ({ ok: true, ts: "123.456" }));
    const client = { chat: { postMessage } } as never;

    await postThreadMessage(client, "C123", "111.222", "**Hello** [there](https://example.com)");

    expect(postMessage).toHaveBeenCalledWith({
      channel: "C123",
      thread_ts: "111.222",
      text: "*Hello* <https://example.com|there>",
      blocks: undefined,
    });
  });

  it("formats Markdown before updating a message", async () => {
    const update = vi.fn(async () => ({ ok: true }));
    const client = { chat: { update } } as never;

    await updateMessage(client, "C123", "123.456", "**Updated**");

    expect(update).toHaveBeenCalledWith({
      channel: "C123",
      ts: "123.456",
      text: "*Updated*",
      blocks: undefined,
    });
  });

  it("formats Markdown stream chunks before appending", async () => {
    const appendStreamMock = vi.fn(async () => ({ ok: true }));
    const client = { chat: { appendStream: appendStreamMock } } as never;

    await appendStream(client, "C123", "123.456", [
      { type: "markdown_text", text: "**Streaming**" },
    ]);

    expect(appendStreamMock).toHaveBeenCalledWith({
      channel: "C123",
      ts: "123.456",
      chunks: [{ type: "markdown_text", text: "*Streaming*" }],
    });
  });
});
