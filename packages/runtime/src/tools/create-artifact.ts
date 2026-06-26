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
        body: parsed.body,
      });
      if (!artifact) throw new Error("Failed to create artifact");

      const finalUrl = `${appUrl}/artifacts/${artifact.id}`;
      await db.update(artifacts).set({ url: finalUrl }).where(eq(artifacts.id, artifact.id));

      await ctx.emit({
        type: "artifact.created",
        artifactId: artifact.id,
        artifactUrl: finalUrl,
        artifactTitle: parsed.title,
      });

      return {
        modelOutput: { artifactId: artifact.id, url: finalUrl, title: parsed.title },
      };
    },
  };
}
