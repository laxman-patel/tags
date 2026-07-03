import type { WebClient } from "@slack/web-api";
import type { Db } from "@tags/db";
import { upsertMessage } from "@tags/core/threads";
import type { SlackFileRef } from "./client";

/** Per-file inline budget; keeps one attachment from evicting the whole thread history. */
const MAX_INLINE_FILE_CHARS = 6000;
const MAX_DOWNLOAD_BYTES = 500_000;

const TEXT_MIME_PREFIXES = ["text/"];
const TEXT_MIME_TYPES = new Set([
  "application/json",
  "application/javascript",
  "application/typescript",
  "application/xml",
  "application/x-yaml",
  "application/yaml",
  "application/x-sh",
  "application/sql",
]);
const TEXT_FILETYPES = new Set([
  "text",
  "markdown",
  "csv",
  "tsv",
  "json",
  "xml",
  "yaml",
  "html",
  "css",
  "javascript",
  "typescript",
  "python",
  "ruby",
  "go",
  "rust",
  "java",
  "c",
  "cpp",
  "csharp",
  "php",
  "shell",
  "sql",
  "diff",
  "dockerfile",
  "makefile",
  "toml",
  "properties",
]);

function isTextFile(file: SlackFileRef): boolean {
  const mime = file.mimetype ?? "";
  if (TEXT_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix))) return true;
  if (TEXT_MIME_TYPES.has(mime)) return true;
  return TEXT_FILETYPES.has(file.filetype ?? "");
}

async function downloadSlackFileText(
  token: string,
  file: SlackFileRef,
): Promise<string | null> {
  const url = file.url_private_download ?? file.url_private;
  if (!url) return null;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;

  // Missing files:read scope makes Slack serve an HTML login page instead.
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/html") && !(file.mimetype ?? "").includes("html")) {
    return null;
  }

  const body = await response.text();
  return body.slice(0, MAX_INLINE_FILE_CHARS);
}

/**
 * Renders a message's file attachments as text the agent can read. Text-like
 * files are downloaded and inlined (capped); binary files are noted so the
 * agent knows they exist.
 */
export async function renderSlackFilesForContext(
  token: string | undefined,
  files: SlackFileRef[],
): Promise<string> {
  const parts: string[] = [];

  for (const file of files) {
    const name = file.name ?? file.title ?? "unnamed file";
    const mime = file.mimetype ?? file.filetype ?? "unknown type";

    if (!isTextFile(file)) {
      parts.push(`[Attached file: ${name} (${mime}) — binary content not shown]`);
      continue;
    }

    if ((file.size ?? 0) > MAX_DOWNLOAD_BYTES || !token) {
      parts.push(`[Attached file: ${name} (${mime}) — too large to inline]`);
      continue;
    }

    try {
      const content = await downloadSlackFileText(token, file);
      if (content == null) {
        parts.push(
          `[Attached file: ${name} (${mime}) — could not be read; the Slack app may be missing the files:read scope]`,
        );
        continue;
      }
      const truncated = (file.size ?? 0) > MAX_INLINE_FILE_CHARS ? "\n… (truncated)" : "";
      parts.push(`[Attached file: ${name} (${mime})]\n\`\`\`\n${content}${truncated}\n\`\`\``);
    } catch {
      parts.push(`[Attached file: ${name} (${mime}) — could not be read]`);
    }
  }

  return parts.join("\n\n");
}

export async function syncSlackThreadToDb(
  client: WebClient,
  db: Db,
  args: {
    organizationId: string;
    spaceId: string;
    threadId: string;
    channelId: string;
    threadTs: string;
  },
): Promise<number> {
  const { fetchThreadReplies } = await import("./client");
  const messages = await fetchThreadReplies(client, args.channelId, args.threadTs);

  let synced = 0;
  for (const msg of messages) {
    if (!msg.ts) continue;
    const hasFiles = (msg.files?.length ?? 0) > 0;
    if (!msg.text && !hasFiles) continue;

    let text = msg.text ?? "";
    if (hasFiles && !msg.bot_id) {
      const rendered = await renderSlackFilesForContext(client.token, msg.files ?? []);
      if (rendered) {
        text = text ? `${text}\n\n${rendered}` : rendered;
      }
    }
    if (!text) continue;

    const authorType = msg.bot_id ? "agent" : "human";
    const authorId = msg.user ?? msg.bot_id ?? "unknown";
    const row = await upsertMessage(db, {
      organizationId: args.organizationId,
      spaceId: args.spaceId,
      threadId: args.threadId,
      providerMessageId: msg.ts,
      authorType,
      authorId,
      text,
      metadata: hasFiles
        ? {
            files: (msg.files ?? []).map((f) => ({
              id: f.id,
              name: f.name,
              mimetype: f.mimetype,
              size: f.size,
            })),
          }
        : undefined,
    });
    if (row) synced += 1;
  }
  return synced;
}
