# Missing Fixes For Tags/Claude-Tag Parity

This file captures the currently missing or dysfunctional pieces compared with the behavior described in `anthropic-claude-tag.md` and `The next paradigm shift (according to Karpathy)-theot3.txt`.

Important product decision: full ambient/proactive mode is deferred. Do not implement proactive "Tags decided to message the channel" behavior yet. However, passive Hermes-style channel-wide learning is in scope and should be implemented.

## P0: Keep The Runtime Opencode-Only

### Problem

Initial Slack runs use the opencode/E2B path, but approval and question resumes switch to the AI SDK orchestrator path.

Current initial path:

- `packages/runtime/src/inngest/functions.ts`
- `agentSegmentStep(...)`
- calls `runOpencodeSegment(...)`

Current resume path:

- `resumeAfterApprovalStep(...)`
- `resumeAfterQuestionStep(...)`
- both call `runAgentSegment(...)`

This is wrong for this project because opencode is the runtime. After a HITL pause, the agent should continue in the same conceptual runtime, with the same persistent Space sandbox and the same opencode-oriented tool exposure. Switching harnesses changes behavior, context shape, tool availability, and coding continuity.

### Required Fix

Make approval/question continuation opencode-native.

Implement one of these approaches:

1. Preferred: extend `runOpencodeSegment` to accept continuation context:
   - approved tool result
   - answered user question
   - prior paused tool name/input/result
   - final instruction telling opencode to continue the original task using that resolved result

2. Alternative: create a `resumeOpencodeSegment(...)` wrapper that builds a continuation prompt and calls the same sandbox/opencode execution path as `runOpencodeSegment`.

Do not call `runAgentSegment` from the Inngest Slack run workflow anymore.

### Suggested Implementation

In `packages/runtime/src/agent/opencode-segment.ts`:

- Add optional args:
  - `approvedToolContinuation?: { toolName: string; toolInput: unknown; toolOutput: unknown; uiCard?: UICard }`
  - or a generic `continuation?: { kind: "approved_tool" | "question_answered"; ... }`
- When continuation exists, append a final user message to the opencode prompt, similar to what `runAgentSegment` currently does:
  - for approved tools: "Approved action completed..."
  - for questions: "Human answered..."
- Keep using:
  - `getOrCreateSpaceSandboxSession`
  - `acquireSpaceSandboxLease`
  - `providers.sandbox.runCodingAgent`
  - Tags MCP
  - Composio MCP

In `packages/runtime/src/inngest/functions.ts`:

- Change `resumeAfterApprovalStep(...)` to call the opencode continuation path.
- Change `resumeAfterQuestionStep(...)` to call the opencode continuation path.
- Remove or stop using `runAgentSegment` in the normal Slack workflow.

### Acceptance Criteria

- A task that requests approval resumes through opencode after approval.
- A task that asks a user a question resumes through opencode after answer.
- Run timeline shows a single runtime style, not opencode first and AI SDK later.
- No call to `runAgentSegment(...)` remains in `tagsRunFunction` continuation paths.
- `pnpm -r typecheck` passes.

## P0: Make HITL And Approval Usable Directly In Slack

### Problem

There is already Slack interaction infrastructure:

- `packages/runtime/src/tools/approval-gate.ts`
- `packages/runtime/src/tools/question-gate.ts`
- `packages/slack/src/blocks/render.ts`
- `apps/web/src/app/api/slack/interactions/route.ts`

However, because the opencode MCP bridge excludes `ask_user`, `create_schedule`, and `run_coding_agent`, the primary opencode runtime cannot currently initiate all HITL flows through Tags native tools.

Also, approval messages are too generic:

- `"Approval needed before executing this action."`
- `"Approve <tool>?"`

The user needs a Slack UI-ish prompt with enough detail to approve or reject safely.

### Required Fix

Expose HITL capabilities to opencode and make Slack approval/question cards informative.

For approvals:

- Slack message must show:
  - tool name
  - risk level
  - requester
  - concise input summary
  - expiration time if available
  - Approve and Reject buttons

For questions:

- Slack message must show:
  - the exact question
  - answer button
  - answer modal
  - expiration behavior

### Suggested Implementation

#### A. Make approval event richer

Update event types in `packages/core/src/events.ts` if needed.

When `gateSideEffectingTool(...)` emits `approval.requested`, include:

- `toolName`
- `riskLevel`
- `requestText`
- `inputPreview`
- `requestedBySlackUserId`
- `expiresAt`

Source: `packages/runtime/src/tools/approval-gate.ts`

Render those details in `packages/slack/src/blocks/render.ts`.

Keep the existing buttons:

- `approval:approve:<approvalId>`
- `approval:reject:<approvalId>`

Keep `apps/web/src/app/api/slack/interactions/route.ts` as the interaction handler, but verify it handles the richer card unchanged.

#### B. Make question event richer if needed

`question.requested` already includes `questionText`; render expiration if available.

Source files:

- `packages/runtime/src/tools/question-gate.ts`
- `packages/slack/src/blocks/render.ts`
- `apps/web/src/app/api/slack/interactions/route.ts`

#### C. Expose `ask_user` to opencode safely

Currently excluded in:

- `packages/runtime/src/tools/tags-mcp.ts`
- `OPENCODE_MCP_EXCLUDED_TOOLS`

Remove `ask_user` from the excluded set, but make sure the MCP request can propagate the `QuestionPauseError` in a way the opencode run can pause the parent Inngest workflow.

Do not let the MCP server swallow `QuestionPauseError` and return a generic tool error. The parent run must enter `waiting`, show a Slack card, and resume when the answer arrives.

If MCP cannot propagate thrown pause errors cleanly through opencode, implement a dedicated opencode-HITL mechanism:

- opencode writes a structured HITL request
- the wrapper detects it
- wrapper creates the question/approval request
- Inngest pauses

But the preferred path is native Tags MCP tools.

### Acceptance Criteria

- From Slack, Tags can ask a clarifying question during an opencode run.
- Slack shows an Answer button and modal.
- Submitting the modal resumes the same opencode runtime path.
- A side-effecting tool approval appears in Slack with enough details to evaluate the action.
- Approve resumes the opencode runtime path.
- Reject stops the run cleanly and posts a clear Slack result.

## P0: Support Multiple Repositories Per Space

### Problem

The schema and config model already support multiple repo URLs:

- `packages/db/src/schema/org.ts`
- `spaceConfigs.repoUrls`
- `packages/core/src/spaces.ts`
- `ActiveSpaceConfig.repoUrls`

But the opencode runtime only uses `config.repoUrl`:

- `packages/runtime/src/agent/opencode-segment.ts`
- `getOrCreateSpaceSandboxSession(... repoUrl: config.repoUrl ...)`
- `providers.sandbox.runCodingAgent(... repoUrl: config.repoUrl ...)`

This means multi-repo configuration is mostly un-wired.

### Required Fix

Make `repoUrls` first-class in the opencode sandbox/runtime path.

The agent should be able to inspect and modify all configured repositories for a Space, not just the first one.

### Suggested Implementation

#### A. Decide sandbox layout

Use a deterministic workspace layout, for example:

- `/workspace/repos/<safe-repo-name-1>`
- `/workspace/repos/<safe-repo-name-2>`
- `/workspace/repos/<safe-repo-name-3>`

Keep a stable root working directory where opencode starts, for example:

- `/workspace`

The prompt should list all checked out repositories and their paths.

#### B. Update sandbox provider types

Inspect and update:

- `packages/sandbox/src/types.ts`
- `packages/sandbox/src/e2b-provider.ts`
- `packages/runtime/src/agent/opencode-segment.ts`
- `packages/runtime/src/tools/run-coding-agent.ts`

Current APIs appear singular around `repoUrl`. Add support for:

- `repoUrls?: string[]`
- optional repo path map in result metadata

Maintain backwards compatibility:

- if only `repoUrl` exists, behavior should remain unchanged
- if `repoUrls` exists, clone/sync all repos

#### C. Update Space sandbox session model if needed

Current session row has singular `repoUrl`:

- `packages/db/src/schema/runtime.ts`
- `spaceSandboxSessions.repoUrl`

Options:

1. Keep `repoUrl` as legacy primary repo and store full repo map in `metadata`.
2. Add a migration for `repoUrls jsonb not null default []`.

Prefer option 2 if the implementation needs reliable matching/reuse by repo set.

#### D. Update admin UI

Check:

- `apps/web/src/app/admin/spaces/[spaceId]/codebase/page.tsx`
- `apps/web/src/app/api/spaces/[spaceId]/codebase/route.ts`
- `apps/web/src/lib/github-repo.ts`

Ensure admins can add/remove multiple repos and the active config persists `repoUrls`.

### Acceptance Criteria

- A Space can be configured with two or more repos.
- A Slack task can read from and edit files in each configured repo.
- The opencode prompt tells the agent where each repo is checked out.
- The run timeline records the repo map.
- Existing single-repo Spaces still work.
- Tests cover config loading and sandbox run argument construction.

## P1: Implement Hermes-Style Passive Channel-Wide Learning

### Problem

The project has thread memory and post-run memory extraction, but it does not passively learn from the full channel.

Current behavior:

- A run syncs the active Slack thread.
- The agent can fetch channel history when asked.
- Post-run extraction can save durable memories from the current thread.

Missing behavior:

- selected channel messages should be ingested passively
- channel-level durable facts should be extracted without requiring a direct tag
- this should not proactively post to Slack yet

This is the desired Hermes-style behavior: the Space learns from ambient channel traffic, but does not take initiative or interrupt users.

### Required Fix

Add a passive ingestion and learning pipeline for configured Spaces/channels.

This is not full ambient proactive mode. It should not post unsolicited messages. It should only read, index, summarize, and propose/save durable memory according to the Space memory policy.

### Suggested Implementation

#### A. Subscribe to Slack message events safely

Update Slack setup docs and code to support `message.channels` when passive learning is enabled.

Files:

- `apps/web/src/app/api/slack/events/route.ts`
- `README.md`

Important:

- keep ignoring bot messages via `event.bot_id`
- ignore edits/deletes/join/leave noise unless explicitly needed
- do not trigger a run for every message

Current route only starts a run for mentions/thread replies. Add a separate path for passive ingestion before the run-trigger return.

#### B. Add per-Space passive learning config

Add config fields to the Space or memory policy. Suggested fields:

- `passiveLearningEnabled: boolean`
- `passiveLearningMode: "off" | "ingest_only" | "extract_memory"`
- optional `passiveLearningMinBatchSize`
- optional `passiveLearningIntervalMinutes`

Likely places:

- `packages/db/src/schema/org.ts` or policy schema
- migrations under `packages/db/migrations`
- admin settings UI

#### C. Store passive channel messages

You can reuse `threads/messages` by creating a synthetic channel-log thread per Space, or create dedicated tables.

Preferred simple implementation:

- create one synthetic thread per Space, e.g. providerThreadId `channel-log:<channelId>`
- upsert each channel root message into that thread
- mark metadata `{ passive: true, channelId, slackTs }`

Be careful not to mix passive channel logs into active task threads unless explicitly searched or summarized.

#### D. Batch memory extraction

Create an Inngest function that periodically processes new passive messages.

Flow:

1. Find Spaces with passive learning enabled.
2. Load new passive messages since last processed timestamp.
3. Summarize/extract candidate durable facts.
4. Save through the existing Space memory mechanism:
   - `mutateSpaceMemoryFile`
   - `addMemoryEntry`
   - existing memory policy checks
5. Record audit events for extracted/skipped memories.

Reuse ideas from:

- `packages/runtime/src/context/post-run.ts`
- `maybeExtractMemories(...)`

Do not save:

- secrets
- one-off chatter
- raw logs
- private or unrelated data
- content from channels not mapped to the Space

#### E. Make passive learning searchable

`session_search` and/or a new `search_channel_memory` should find relevant passive channel context.

At minimum:

- passive messages should be included in `session_search` results only when scoped to the same Space.
- the agent prompt should explain that durable Space memory may include passively learned channel facts.

### Acceptance Criteria

- Posting a normal non-mention message in a mapped channel does not start a Tags run.
- The message is stored for the correct Space.
- After the batch learner runs, durable facts can be added to Space memory.
- No Slack message is posted by passive learning.
- Bot messages do not create ingestion loops.
- Audit logs show passive memory extraction activity.
- Tests cover non-mention ingestion and "does not start run" behavior.

## P1: Fix Scheduled Run Thread History

### Problem

Scheduled runs create a Slack root message, but the schedule prompt is not stored as a message in the DB because this block is skipped for scheduled runs:

- `packages/runtime/src/inngest/functions.ts`
- `if (!input.isScheduled) { ... upsertMessage(...) }`

`buildThreadContext(...)` later appends `triggerText`, so the model sees the prompt during that execution. But the DB thread can be incomplete, which weakens later thread search, auditability, replay, and summarization.

### Required Fix

When a scheduled run creates its Slack root message, upsert a system or human-like message representing the schedule prompt.

### Suggested Implementation

In `ingestStep(...)`:

- after the scheduled root Slack message is posted and `triggerMessageTs` is set, upsert a message:
  - `providerMessageId: triggerMessageTs`
  - `authorType: "system"` or `"human"` depending on schema constraints and desired UX
  - `authorId: "schedule"`
  - `text: input.triggerText`
  - `metadata: { scheduled: true }`

Avoid duplicating the message when idempotency retries happen.

### Acceptance Criteria

- A scheduled run has its prompt stored in `messages`.
- `search_thread` can find the scheduled prompt after the run.
- Thread summaries include scheduled prompts.
- Inngest retries do not create duplicates.

## P1: Fix Slack Thread Reply Mention Detection

### Problem

The current thread-reply trigger detection is fragile:

```ts
const text = event.text?.replace(/<@[^>]+>/g, "").trim() ?? "";
...
const isThreadReply =
  event.type === "message" &&
  event.thread_ts &&
  (text.toLowerCase().includes("@tags") || text.toLowerCase().startsWith("tags "));
```

Slack mention text is usually `<@USERID>`, not literal `@tags`. The code strips mentions before checking for `@tags`, so `includes("@tags")` is effectively dead for real Slack mentions.

File:

- `apps/web/src/app/api/slack/events/route.ts`

### Required Fix

Detect bot mentions before stripping Slack mention tokens, or resolve the bot user ID and check for `<@BOT_USER_ID>`.

### Suggested Implementation

Add env/config for bot user ID if needed:

- `SLACK_BOT_USER_ID`

Then:

```ts
const rawText = event.text ?? "";
const mentionsBot = env.SLACK_BOT_USER_ID
  ? rawText.includes(`<@${env.SLACK_BOT_USER_ID}>`)
  : /<@[^>]+>/.test(rawText);
const strippedText = rawText.replace(/<@[^>]+>/g, "").trim();
const isThreadReply =
  event.type === "message" &&
  Boolean(event.thread_ts) &&
  (mentionsBot || strippedText.toLowerCase().startsWith("tags "));
```

Be careful with the fallback. A generic `/<@[^>]+>/` fallback may trigger on mentions of other users if `message.channels` is enabled. Prefer requiring `SLACK_BOT_USER_ID` in production when thread-reply triggers are enabled.

### Acceptance Criteria

- A thread reply containing `<@BOT_USER_ID> please continue` starts a run.
- A thread reply saying `tags please continue` starts a run.
- A thread reply mentioning another user does not start a run.
- Bot messages are still ignored.
- Tests cover raw Slack mention formats.

## P2: Remove Or Reframe `runtimeMode`

### Problem

`runtimeMode` exists in config and supports `"opencode"` and `"orchestrator"`:

- `packages/core/src/spaces.ts`
- `parseRuntimeMode(...)`
- `ActiveSpaceConfig.runtimeMode`

But the current product direction is opencode-only. The initial run path ignores `runtimeMode` and always calls `runOpencodeSegment(...)`.

This is confusing and can mislead implementers into wiring a second runtime path.

### Required Fix

Since opencode is the only runtime, remove user-facing/runtime branching around `runtimeMode`, or make it internal/deprecated.

### Suggested Implementation

Choose one:

1. Remove `runtimeMode` from admin UI and stop presenting it as configurable, but keep DB column for backwards compatibility.
2. Keep `runtimeMode` in DB but force `parseRuntimeMode` to return `"opencode"` and add comments that orchestrator is legacy/non-product.
3. Fully delete orchestrator code later after opencode-native HITL is implemented.

Do not build new features against the orchestrator path.

### Acceptance Criteria

- Admin UI does not imply orchestrator is a supported runtime.
- The Slack workflow does not branch into orchestrator.
- Comments/docs clearly state opencode is the runtime.

## P2: Improve Tool Availability Inside Opencode MCP

### Problem

The opencode prompt says native Tags tools are exposed through MCP, but `OPENCODE_MCP_EXCLUDED_TOOLS` removes important tools:

- `run_coding_agent`
- `ask_user`
- `create_schedule`

Some exclusions make sense:

- `run_coding_agent` inside opencode can recurse and should probably stay excluded.

Some exclusions block required behavior:

- `ask_user` is needed for HITL.
- `create_schedule` is needed for "plan tasks for itself in the future."

### Required Fix

Revisit the excluded tool list.

Recommended target:

- keep excluding `run_coding_agent`
- expose `ask_user` once opencode-native pause/resume works
- expose `create_schedule` with approval or policy guard

### Implementation Notes

`create_schedule` is side-effecting and should likely require approval or a policy decision when created by the agent.

Check:

- `packages/runtime/src/tools/create-schedule.ts`
- `packages/runtime/src/tools/tags-mcp.ts`
- `packages/runtime/src/agent/prompt.ts`

Update the prompt so opencode knows it can schedule future work only when the tool is actually enabled for that Space.

### Acceptance Criteria

- If `create_schedule` is enabled for a Space, opencode can create a schedule after required approval.
- If disabled, opencode cannot access it.
- Created schedules appear in admin UI and fire through the existing schedule tick.

## Implementation Order

1. Fix opencode-only continuation for approvals/questions.
2. Improve Slack HITL cards and expose `ask_user` safely.
3. Fix scheduled prompt persistence.
4. Fix Slack thread-reply mention detection.
5. Wire multi-repo support into sandbox/opencode.
6. Add Hermes-style passive channel-wide learning.
7. Expose `create_schedule` through opencode MCP with approval/policy guard.
8. Hide or deprecate `runtimeMode`.

## Verification Commands

Run these after each substantial change:

```bash
pnpm -r typecheck
pnpm test
```

Note: current DB-backed RLS tests require Postgres on `localhost:5433`. If that service is not running, the RLS suite will fail with `ECONNREFUSED` even when unit tests pass.
