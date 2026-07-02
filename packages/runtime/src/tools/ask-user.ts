import { z } from "zod";
import { gateQuestionTool } from "./question-gate";
import type { Db } from "@tags/db";
import type { TagsTool } from "./types";

const inputSchema = z.object({
  question: z.string().describe("The clarifying question to ask the human"),
});

export function createAskUserTool(db: Db): TagsTool {
  return {
    name: "ask_user",
    description:
      "Ask the human a clarifying question and wait for their answer before continuing.",
    inputSchema,
    risk: "none",
    approval: { kind: "never" },
    sideEffecting: false,
    async execute(input: unknown, ctx) {
      const parsed = inputSchema.parse(input);
      const gate = await gateQuestionTool({
        db,
        runId: ctx.runId,
        organizationId: ctx.organizationId,
        spaceId: ctx.spaceId,
        threadId: ctx.threadId,
        toolName: "ask_user",
        toolInput: input,
        questionText: parsed.question,
        emit: ctx.emit,
      });

      if (gate.cachedResult !== undefined) {
        return { modelOutput: gate.cachedResult };
      }

      return { modelOutput: { answered: true } };
    },
  };
}
