import { z } from "zod";
import { createArtifact } from "@tags/core/artifacts";
import { getSpaceSandboxSessionBySpaceId } from "@tags/core/space-sandboxes";
import { getThreadById } from "@tags/core/threads";
import type { Db } from "@tags/db";
import { newId } from "@tags/db";
import {
  connectDesktopSandbox,
  recordProofInSandbox,
  type ProofStep,
} from "@tags/sandbox";
import {
  createSlackClient,
  postThreadMessage,
  uploadThreadFile,
} from "@tags/slack";
import {
  artifactBinaryObjectKey,
  publicArtifactUrl,
  uploadArtifactBytes,
} from "@tags/storage";
import type { RuntimeProviderConfig } from "../providers";
import type { TagsTool, ToolContext } from "./types";

const proofStepSchema: z.ZodType<ProofStep> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("navigate"), url: z.string().min(1) }),
  z.object({ type: z.literal("click"), selector: z.string().min(1) }),
  z.object({
    type: z.literal("fill"),
    selector: z.string().min(1),
    value: z.string(),
  }),
  z.object({ type: z.literal("press"), key: z.string().min(1) }),
  z.object({
    type: z.literal("waitForSelector"),
    selector: z.string().min(1),
    timeoutMs: z.number().int().positive().optional(),
  }),
  z.object({
    type: z.literal("waitForText"),
    text: z.string().min(1),
    timeoutMs: z.number().int().positive().optional(),
  }),
  z.object({ type: z.literal("waitMs"), ms: z.number().int().positive() }),
  z.object({ type: z.literal("assertText"), text: z.string().min(1) }),
  z.object({
    type: z.literal("waitForUrl"),
    url: z.string().min(1),
    timeoutMs: z.number().int().positive().optional(),
  }),
  z.object({ type: z.literal("assertUrl"), url: z.string().min(1) }),
]);

const inputSchema = z.object({
  title: z
    .string()
    .min(1)
    .describe("Short title for the Slack file and artifact"),
  baseUrl: z
    .string()
    .url()
    .describe("Local app URL already serving in the sandbox, e.g. http://127.0.0.1:3000"),
  journeys: z
    .array(
      z.object({
        name: z.string().min(1).describe("Journey label, e.g. happy path"),
        steps: z.array(proofStepSchema).min(1),
      }),
    )
    .min(1)
    .describe("All relevant paths to demonstrate (happy path + edge cases)"),
  maxSeconds: z.number().int().positive().max(180).optional(),
});

export function createRecordProofTool(
  db: Db,
  providerConfig?: RuntimeProviderConfig,
): TagsTool {
  return {
    name: "record_proof",
    description:
      "Record a video proof of a local app running in the Space sandbox. Start the server first, then call with baseUrl and journeys covering every path the change affects. Uploads the MP4 to R2 and the Slack thread.",
    inputSchema,
    risk: "low",
    approval: { kind: "never" },
    sideEffecting: true,
    async execute(input: unknown, ctx: ToolContext) {
      const parsed = inputSchema.parse(input);
      const proof = providerConfig?.proofRecording ?? {
        maxSeconds: 90,
        width: 1280,
        height: 800,
        fps: 15,
      };

      if (!providerConfig?.e2bApiKey) {
        throw new Error("E2B_API_KEY is not configured; cannot record proof");
      }
      if (!ctx.r2?.config.publicBaseUrl) {
        throw new Error("R2_PUBLIC_BASE_URL is not configured; cannot store proof video");
      }

      const session = await getSpaceSandboxSessionBySpaceId(db, ctx.spaceId);
      const sandboxId = session?.externalSandboxId?.trim();
      if (!sandboxId) {
        throw new Error(
          "No live Space sandbox is available. record_proof only works during an active coding run in the desktop sandbox.",
        );
      }

      await ctx.emit({ type: "recording.started", demoKind: "web" });

      const desktop = await connectDesktopSandbox({
        sandboxId,
        apiKey: providerConfig.e2bApiKey,
        timeoutMs: (parsed.maxSeconds ?? proof.maxSeconds) * 1000 + 3 * 60_000,
      });

      let recording;
      try {
        recording = await recordProofInSandbox({
          sandbox: desktop,
          baseUrl: parsed.baseUrl,
          journeys: parsed.journeys,
          maxSeconds: parsed.maxSeconds ?? proof.maxSeconds,
          width: proof.width,
          height: proof.height,
          fps: proof.fps,
          filenameHint: ctx.runId,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Proof recording failed";
        await ctx.emit({ type: "recording.failed", error: message });
        throw error;
      }

      const artifactId = newId();
      const key = artifactBinaryObjectKey(ctx.organizationId, artifactId, recording.filename);
      const artifactUrl = publicArtifactUrl(ctx.r2.config, key);
      if (!artifactUrl) {
        throw new Error("R2_PUBLIC_BASE_URL is not configured");
      }

      await uploadArtifactBytes(
        ctx.r2.client,
        ctx.r2.config,
        key,
        recording.video,
        recording.contentType,
      );

      // Persist the artifact before Slack so a bad bot token cannot wipe a
      // successful recording (agent was seeing invalid_auth and retrying forever).
      const artifact = await createArtifact(db, {
        id: artifactId,
        organizationId: ctx.organizationId,
        spaceId: ctx.spaceId,
        threadId: ctx.threadId,
        runId: ctx.runId,
        kind: "video",
        title: parsed.title,
        url: artifactUrl,
        contentRef: key,
        contentType: recording.contentType,
        sizeBytes: recording.video.byteLength,
        metadata: {
          baseUrl: parsed.baseUrl,
          durationMs: recording.durationMs,
          journeys: recording.journeys,
          sandboxId,
        },
      });
      if (!artifact) throw new Error("Failed to create proof artifact");

      await ctx.emit({
        type: "artifact.created",
        artifactId,
        artifactUrl,
        artifactTitle: parsed.title,
      });

      const thread = await getThreadById(db, ctx.threadId, {
        organizationId: ctx.organizationId,
        spaceId: ctx.spaceId,
      });
      const threadTs = thread?.providerThreadId;

      let slackFile: { fileId?: string; permalink?: string } = {};
      let slackWarning: string | undefined;
      if (providerConfig.slackBotToken && threadTs) {
        const slack = createSlackClient(providerConfig.slackBotToken);
        try {
          slackFile = await uploadThreadFile(slack, {
            channelId: ctx.channelId,
            threadTs,
            file: recording.video,
            filename: recording.filename,
            title: parsed.title,
            initialComment: `${parsed.title}\n${artifactUrl}`,
          });
        } catch (error) {
          const slackErr = error instanceof Error ? error.message : String(error);
          const hint = /missing_scope/i.test(slackErr)
            ? " Reinstall the Slack app so it grants `files:write`."
            : /invalid_auth/i.test(slackErr)
              ? " Workspace bot token is invalid — check Slack install / TAGS_ENCRYPTION_KEY."
              : "";
          slackWarning = `Slack file upload failed: ${slackErr}.${hint}`;
          try {
            await postThreadMessage(
              slack,
              ctx.channelId,
              threadTs,
              `${parsed.title}\n${artifactUrl}\n_(${slackWarning})_`,
            );
          } catch {
            // Chat may fail with the same bad token; artifact URL is still valid.
          }
        }
      }

      await ctx.emit({
        type: "recording.finished",
        artifactId,
        artifactUrl,
        slackFileId: slackFile.fileId,
      });

      return {
        modelOutput: {
          artifactId,
          artifactUrl,
          title: parsed.title,
          durationMs: recording.durationMs,
          journeys: recording.journeys,
          slackFileId: slackFile.fileId,
          slackPermalink: slackFile.permalink,
          ...(slackWarning ? { slackWarning } : {}),
        },
        uiCard: {
          kind: "artifact",
          title: parsed.title,
          artifactKind: "video",
          url: artifactUrl,
          contentType: recording.contentType,
        },
      };
    },
  };
}
