import { z } from "zod";
import { eq } from "drizzle-orm";
import { createArtifact } from "@tags/core/artifacts";
import type { Db } from "@tags/db";
import { artifacts } from "@tags/db";
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
      const artifact = await createArtifact(db, {
        organizationId: ctx.organizationId,
        spaceId: ctx.spaceId,
        threadId: ctx.threadId,
        runId: ctx.runId,
        kind: parsed.kind,
        title: parsed.title,
        url: `${appUrl}/artifacts/placeholder`,
        contentType:
          parsed.kind === "html" ? "text/html" : parsed.kind === "json" ? "application/json" : "text/markdown",
      });
      if (!artifact) throw new Error("Failed to create artifact");

      const { uploadArtifactBody, artifactObjectKey } = await import("@tags/storage");
      const contentRef = artifactObjectKey(ctx.organizationId, artifact.id);
      let bodyStoredInDb: string | undefined;

      if (ctx.r2) {
        await uploadArtifactBody(
          ctx.r2.client,
          ctx.r2.config,
          contentRef,
          parsed.body,
          artifact.contentType ?? "text/markdown",
        );
        await db
          .update(artifacts)
          .set({
            contentRef,
            sizeBytes: Buffer.byteLength(parsed.body, "utf8"),
          })
          .where(eq(artifacts.id, artifact.id));
      } else {
        bodyStoredInDb = parsed.body;
        await db
          .update(artifacts)
          .set({
            body: parsed.body,
            sizeBytes: Buffer.byteLength(parsed.body, "utf8"),
          })
          .where(eq(artifacts.id, artifact.id));
      }

      const finalUrl = `${appUrl}/artifacts/${artifact.id}`;
      await db.update(artifacts).set({ url: finalUrl }).where(eq(artifacts.id, artifact.id));

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
