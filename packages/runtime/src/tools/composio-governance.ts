import { tool } from "ai";
import type { ToolSet } from "ai";
import type { TagsEvent } from "@tags/core/events";
import type { Db } from "@tags/db";
import type { AgentLoopArgs } from "../agent/loop";
import { gateSideEffectingTool } from "./approval-gate";

/**
 * Wraps Composio MCP tools so they respect Tags approval policy in orchestrator mode.
 * All Composio tools are treated as side-effecting (external integrations).
 *
 * Composio is disabled entirely on opencode-primary runs — see runAgentSegment.
 */
export function wrapComposioToolsWithApproval(
  composioTools: ToolSet,
  ctx: {
    db: Db;
    args: AgentLoopArgs;
    emit: (event: TagsEvent) => Promise<void>;
  },
): ToolSet {
  const wrapped: ToolSet = {};

  for (const [name, composioTool] of Object.entries(composioTools)) {
    const original = composioTool as {
      description?: string;
      inputSchema?: Parameters<typeof tool>[0]["inputSchema"];
      execute?: (input: unknown, options: unknown) => Promise<unknown>;
    };

    const gatedName = `composio.${name}`;

    wrapped[name] = tool({
      description: original.description ?? name,
      inputSchema: original.inputSchema!,
      execute: async (input: unknown, options: unknown) => {
        await ctx.emit({
          type: "tool.started",
          toolName: gatedName,
          inputPreview: input,
        });

        const gate = await gateSideEffectingTool({
          db: ctx.db,
          runId: ctx.args.runId,
          organizationId: ctx.args.organizationId,
          spaceId: ctx.args.spaceId,
          threadId: ctx.args.threadId,
          toolName: gatedName,
          toolInput: input,
          actorUserId: ctx.args.actorUserId,
          slackChannelId: ctx.args.channelId,
          slackMessageTs: ctx.args.slackMessageTs,
          approvedTool: ctx.args.approvedTool,
          emit: ctx.emit,
        });

        if (gate.cachedResult !== undefined) {
          await ctx.emit({
            type: "tool.finished",
            toolName: gatedName,
            outputPreview: gate.cachedResult,
          });
          return gate.cachedResult;
        }

        const output = await original.execute!(input, options);

        await ctx.emit({
          type: "tool.finished",
          toolName: gatedName,
          outputPreview: output,
        });

        return output;
      },
    });
  }

  return wrapped;
}
