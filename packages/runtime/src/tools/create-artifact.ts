import { z } from "zod";
import { createArtifact } from "@tags/core/artifacts";
import type { Db } from "@tags/db";
import { newId } from "@tags/db";
import type { TagsTool, ToolContext } from "./types";

const inputSchema = z.object({
  title: z.string(),
  body: z.string().describe("Markdown body"),
  kind: z.enum(["markdown", "html", "json", "link"]).default("markdown"),
});

export function createCreateArtifactTool(db: Db, appUrl: string): TagsTool {
  return {
    name: "create_artifact",
    description: "Create a durable artifact linked from Slack and the web app.",
    inputSchema,
    risk: "none",
    approval: { kind: "never" },
    sideEffecting: true,
    async execute(input: unknown, ctx: ToolContext) {
      const parsed = inputSchema.parse(input);
      const id = newId();
      const finalUrl = `${appUrl}/artifacts/${id}`;
      const contentType =
        parsed.kind === "html"
          ? "text/html"
          : parsed.kind === "json"
            ? "application/json"
            : "text/markdown";
      const sizeBytes = Buffer.byteLength(parsed.body, "utf8");

      const { uploadArtifactBody, artifactObjectKey } = await import("@tags/storage");
      const contentRef = artifactObjectKey(ctx.organizationId, id);

      let bodyStoredInDb: string | undefined;

      if (ctx.r2) {
        await uploadArtifactBody(
          ctx.r2.client,
          ctx.r2.config,
          contentRef,
          parsed.body,
          contentType,
        );
      } else {
        bodyStoredInDb = parsed.body;
      }

      const artifact = await createArtifact(db, {
        id,
        organizationId: ctx.organizationId,
        spaceId: ctx.spaceId,
        threadId: ctx.threadId,
        runId: ctx.runId,
        kind: parsed.kind,
        title: parsed.title,
        url: finalUrl,
        contentType,
        sizeBytes,
        ...(ctx.r2 ? { contentRef } : { body: parsed.body }),
      });
      if (!artifact) throw new Error("Failed to create artifact");

      await ctx.emit({
        type: "artifact.created",
        artifactId: artifact.id,
        artifactUrl: finalUrl,
        artifactTitle: parsed.title,
      });

      return {
        modelOutput: {
          artifactId: artifact.id,
          url: finalUrl,
          title: parsed.title,
          contentRef: ctx.r2 ? contentRef : undefined,
          storedInDb: bodyStoredInDb !== undefined,
        },
      };
    },
  };
}
