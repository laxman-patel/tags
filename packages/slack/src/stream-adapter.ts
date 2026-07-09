import type { WebClient } from "@slack/web-api";
import { buildWorkingMessage, renderSlackBlocks } from "./blocks/render";
import {
  appendStream,
  stopStream,
  updateMessage,
  type SlackStreamChunk,
} from "./client";
import type { TagsEvent } from "@tags/core/events";

const THROTTLE_MS = 1500;
const MAX_TEXT_LENGTH = 2800;
/** task_update titles are limited to 256 chars by Slack. */
const MAX_TASK_TITLE = 250;

function taskId(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

/**
 * Streams TagsEvents into a single Slack message.
 *
 * Native mode drives Slack's chat.appendStream / chat.stopStream APIs: text
 * deltas render as real markdown, statuses and tools render as task cards in a
 * timeline, and Slack shows the animated "Tags is thinking…" indicator until
 * content arrives. If a native call fails (e.g. the stream was already
 * stopped), the adapter degrades to the classic chat.update flow.
 */
export class SlackStreamAdapter {
  private buffer = "";
  private sentText = "";
  private pendingBlocks: Array<Record<string, unknown>> = [];
  private lastFlush = 0;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private statusLabel: string | null = null;
  private native: boolean;
  private openTasks = new Map<string, string>();
  /** Latest subtitle under an open task (e.g. opencode step). */
  private taskDetails = new Map<string, string>();
  private lastProgressAt = 0;
  private lastProgressStep: string | null = null;
  private stopped = false;

  constructor(
    private client: WebClient,
    private channelId: string,
    private messageTs: string,
    options?: { native?: boolean },
  ) {
    this.native = options?.native ?? false;
  }

  async pushEvent(event: TagsEvent): Promise<void> {
    switch (event.type) {
      case "text.delta":
        this.buffer += event.text;
        await this.scheduleFlush();
        return;
      case "status": {
        const label = event.detail ? `${event.label} — ${event.detail}` : event.label;
        if (this.native) {
          await this.pushTask(taskId(event.label), label, "in_progress");
        } else {
          this.statusLabel = label;
          await this.flush(true);
        }
        return;
      }
      case "tool.started":
        if (this.native) {
          await this.pushTask(`tool-${taskId(event.toolName)}`, `Running ${event.toolName}`, "in_progress");
        } else {
          await this.appendClassicBlocks(event);
        }
        return;
      case "tool.progress":
        if (this.native) {
          await this.updateTaskDetails(`tool-${taskId(event.toolName)}`, event.step);
        } else {
          this.statusLabel = `Running ${event.toolName} — ${event.step}`;
          await this.flush(true);
        }
        return;
      case "tool.finished":
        if (this.native) {
          this.taskDetails.delete(`tool-${taskId(event.toolName)}`);
          await this.pushTask(`tool-${taskId(event.toolName)}`, `Ran ${event.toolName}`, "complete");
        } else {
          await this.appendClassicBlocks(event);
        }
        return;
      case "run.finished":
        // Intentionally silent in Slack: the final reply is the signal.
        this.statusLabel = null;
        if (this.native) {
          await this.completeOpenTasks("complete");
        }
        return;
      case "run.failed":
        this.statusLabel = null;
        if (this.native) {
          await this.completeOpenTasks("error");
          await this.appendChunks([
            { type: "markdown_text", text: `\n\n❌ Run failed: ${event.error}` },
          ]);
          // Close the stream so the message doesn't sit in "thinking" state.
          if (!this.stopped) {
            try {
              await stopStream(this.client, this.channelId, this.messageTs);
              this.stopped = true;
            } catch {
              this.native = false;
            }
          }
        } else {
          await this.appendClassicBlocks(event);
        }
        return;
      case "approval.requested":
        // Interactive Approve/Decline lives on the standalone card posted by
        // Inngest (`postApprovalStep`). Don't embed a second set of buttons in
        // the streaming run message — that made the UX feel duplicated/janky.
        if (this.native) {
          await this.pushTask(
            "approval-wait",
            `Waiting for approval — ${event.requestText || event.toolName || "action"}`,
            "in_progress",
          );
        } else {
          this.statusLabel = `Waiting for approval — ${event.requestText || event.toolName || "action"}`;
          await this.flush(true);
        }
        return;
      case "question.requested":
      case "artifact.created":
      case "recording.started":
      case "recording.finished":
      case "recording.failed":
        if (this.native) {
          await this.flush(true);
          await this.appendChunks([
            { type: "blocks", blocks: renderSlackBlocks(event) },
          ]);
        } else {
          await this.appendClassicBlocks(event);
        }
        return;
      default: {
        const _exhaustive: never = event;
        return _exhaustive;
      }
    }
  }

  async setStatus(label: string, detail?: string): Promise<void> {
    await this.pushEvent({ type: "status", label, detail });
  }

  /**
   * Finalize the message: native mode appends any remaining text and stops the
   * stream (blocks render at the bottom); classic mode replaces the message.
   */
  async finalize(finalText: string, blocks?: Array<Record<string, unknown>>): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.statusLabel = null;

    // Already finalized natively (e.g. run.failed stopped the stream).
    if (this.native && this.stopped) return;

    if (this.native && !this.stopped) {
      try {
        const streamedSoFar = this.sentText;
        const remainder = finalText.startsWith(streamedSoFar)
          ? finalText.slice(streamedSoFar.length)
          : streamedSoFar.length === 0
            ? finalText
            : "";

        const chunks: SlackStreamChunk[] = [];
        for (const [id, title] of this.openTasks) {
          chunks.push({ type: "task_update", id, title, status: "complete" });
        }
        this.openTasks.clear();
        const pendingDelta = this.buffer;
        this.buffer = "";
        const text = remainder || (streamedSoFar ? "" : pendingDelta);
        if (text) {
          chunks.push({ type: "markdown_text", text });
        }

        await stopStream(this.client, this.channelId, this.messageTs, {
          ...(chunks.length > 0 ? { chunks } : {}),
          ...(blocks && blocks.length > 0 ? { blocks } : {}),
        });
        this.stopped = true;
        this.sentText = finalText;
        return;
      } catch {
        this.native = false;
      }
    }

    this.buffer = finalText;
    this.pendingBlocks = [];
    await this.flush(true, blocks);
  }

  private async pushTask(
    id: string,
    title: string,
    status: "in_progress" | "complete" | "error",
  ): Promise<void> {
    const chunks: SlackStreamChunk[] = [];
    if (status === "in_progress") {
      // Close the previous in-flight task so the timeline advances.
      for (const [openId, openTitle] of this.openTasks) {
        if (openId !== id) {
          chunks.push({ type: "task_update", id: openId, title: openTitle, status: "complete" });
          this.taskDetails.delete(openId);
        }
      }
      this.openTasks.clear();
      this.openTasks.set(id, title.slice(0, MAX_TASK_TITLE));
    } else {
      this.openTasks.delete(id);
      this.taskDetails.delete(id);
    }
    const details = status === "in_progress" ? this.taskDetails.get(id) : undefined;
    chunks.push({
      type: "task_update",
      id,
      title: title.slice(0, MAX_TASK_TITLE),
      status,
      ...(details ? { details } : {}),
    });
    await this.appendChunks(chunks);
  }

  /** Update the small subtitle under an in-flight task (throttled). */
  private async updateTaskDetails(id: string, step: string): Promise<void> {
    const title = this.openTasks.get(id);
    if (!title) return;
    const cleaned = step.replace(/\s+/g, " ").trim().slice(0, 120);
    if (!cleaned || cleaned === this.lastProgressStep) return;

    const now = Date.now();
    // Keep Slack traffic light while still feeling live.
    if (now - this.lastProgressAt < 900) return;

    this.lastProgressAt = now;
    this.lastProgressStep = cleaned;
    this.taskDetails.set(id, cleaned);
    await this.appendChunks([
      {
        type: "task_update",
        id,
        title: title.slice(0, MAX_TASK_TITLE),
        status: "in_progress",
        details: cleaned,
      },
    ]);
  }

  private async completeOpenTasks(status: "complete" | "error"): Promise<void> {
    if (this.openTasks.size === 0) return;
    const chunks: SlackStreamChunk[] = [];
    for (const [id, title] of this.openTasks) {
      chunks.push({ type: "task_update", id, title, status });
    }
    this.openTasks.clear();
    await this.appendChunks(chunks);
  }

  private async appendChunks(chunks: SlackStreamChunk[]): Promise<void> {
    if (!this.native || this.stopped || chunks.length === 0) return;
    try {
      await appendStream(this.client, this.channelId, this.messageTs, chunks);
    } catch {
      this.degradeToClassic();
    }
  }

  private degradeToClassic(): void {
    this.native = false;
    // Preserve anything already streamed so classic updates don't lose text.
    this.buffer = this.sentText + this.buffer;
    this.sentText = "";
  }

  private async appendClassicBlocks(event: TagsEvent): Promise<void> {
    await this.flush();
    this.pendingBlocks.push(...renderSlackBlocks(event));
    await this.flush(true);
  }

  async flush(force = false, finalBlocks?: Array<Record<string, unknown>>): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    const now = Date.now();
    if (!force && now - this.lastFlush < THROTTLE_MS && this.buffer.length < 200) {
      return;
    }

    if (this.native && !this.stopped) {
      if (!this.buffer) return;
      const delta = this.buffer;
      this.buffer = "";
      try {
        await appendStream(this.client, this.channelId, this.messageTs, [
          { type: "markdown_text", text: delta },
        ]);
        this.sentText += delta;
        this.lastFlush = Date.now();
        return;
      } catch {
        this.buffer = delta;
        this.degradeToClassic();
      }
    }

    const text =
      this.buffer.length > MAX_TEXT_LENGTH
        ? `${this.buffer.slice(0, MAX_TEXT_LENGTH)}…`
        : this.buffer;

    const headline = this.statusLabel
      ? [{ type: "context", elements: [{ type: "mrkdwn", text: `⏳ ${this.statusLabel}` }] }]
      : [];

    const blocks = [
      ...headline,
      ...buildWorkingMessage(text || "_Tags is working…_"),
      ...this.pendingBlocks,
      ...(finalBlocks ?? []),
    ];

    await updateMessage(this.client, this.channelId, this.messageTs, text || "Tags", blocks);
    this.lastFlush = Date.now();
    this.pendingBlocks = [];
  }

  private async scheduleFlush(): Promise<void> {
    if (this.flushTimer) return;

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush(true);
    }, THROTTLE_MS);
  }
}
