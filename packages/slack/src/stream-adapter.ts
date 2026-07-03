import type { WebClient } from "@slack/web-api";
import { buildWorkingMessage, renderSlackBlocks } from "./blocks/render";
import { updateMessage } from "./client";
import type { TagsEvent } from "@tags/core/events";

const THROTTLE_MS = 1500;
const MAX_TEXT_LENGTH = 2800;

export class SlackStreamAdapter {
  private buffer = "";
  private pendingBlocks: Array<Record<string, unknown>> = [];
  private lastFlush = 0;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private statusLabel: string | null = null;

  constructor(
    private client: WebClient,
    private channelId: string,
    private messageTs: string,
  ) {}

  async pushEvent(event: TagsEvent): Promise<void> {
    if (event.type === "text.delta") {
      this.buffer += event.text;
      await this.scheduleFlush();
      return;
    }

    if (event.type === "status") {
      this.statusLabel = event.detail ? `${event.label} — ${event.detail}` : event.label;
      await this.flush(true);
      return;
    }

    if (event.type === "run.finished" || event.type === "run.failed") {
      this.statusLabel = null;
    }

    await this.flush();
    const blocks = renderSlackBlocks(event);
    this.pendingBlocks.push(...blocks);
    await this.flush(true);
  }

  async setStatus(label: string, detail?: string): Promise<void> {
    await this.pushEvent({ type: "status", label, detail });
  }

  async flush(force = false): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    const now = Date.now();
    if (!force && now - this.lastFlush < THROTTLE_MS && this.buffer.length < 200) {
      return;
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

  async finalize(finalText: string): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.statusLabel = null;
    this.buffer = finalText;
    await this.flush(true);
  }
}
