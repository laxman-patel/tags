# FIX.md — Audit findings and fix instructions

This document lists every issue found in the 2026-07-02 audit of the Tags monorepo, in priority order, with exact file paths, the offending code, why it is wrong, and step-by-step fix instructions. Written so that each item can be fixed independently without extra context.

**Verification commands** (run from repo root after every fix):

```bash
pnpm -r typecheck        # must stay green
pnpm --filter @tags/web build   # must stay green
pnpm test                # runs vitest (rls.test.ts needs a local Postgres)
```

---

## Priority P0 — Broken. Must fix before deploying.

### P0-1. `pnpm db:seed` fails on a fresh database (foreign-key order bug)

**File:** `packages/db/src/seed.ts`

**Problem:** The seed script inserts rows into `approval_policies`, `budget_policies`, and `memory_policies` (lines ~24–37) **before** inserting the `organizations` row (lines ~39–43). All three policy tables declare `organization_id uuid NOT NULL REFERENCES organizations(id)` (see `packages/db/migrations/0002_phase_extensions.sql` lines 6–33). On a fresh database the first policy insert violates the foreign key and the seed crashes.

**Fix:** Reorder the inserts so the `organizations` insert runs **first**, before the three policy inserts. The correct order is:

1. `organizations`
2. `approval_policies`, `budget_policies`, `memory_policies`
3. `workspaces`
4. `spaces`
5. `space_configs`

**Also fix in the same file:** line ~85 uses fallback model `openai/gpt-4o-mini`:

```ts
${process.env.SEED_MODEL_ID ?? "openai/gpt-4o-mini"},
```

The runtime is Fireworks-only (`createFireworks` in `packages/runtime/src/agent/loop.ts`), so `openai/gpt-4o-mini` is not a valid model id. Change the fallback to `"accounts/fireworks/models/kimi-k2-instruct"` (matches `.env.example` `SEED_MODEL_ID`).

**Verify:** against a fresh database (`docker compose up -d postgres`, `pnpm db:migrate`), run `pnpm db:seed` twice. First run must succeed; second run must print "Space already exists".

---

### P0-2. Migration `0001_app_role.sql` hardcodes the database name `tags`

**File:** `packages/db/migrations/0001_app_role.sql`, line 11:

```sql
GRANT CONNECT ON DATABASE tags TO tags_app;
```

**Problem:** Production databases are rarely named `tags` (Railway Postgres defaults to `railway`, Neon uses whatever name was chosen). When the database has a different name this statement errors and `packages/db/src/migrate.ts` halts — **all** subsequent migrations stop applying.

**Fix:** Replace the hardcoded name with the current database, using a DO block:

```sql
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO tags_app', current_database());
END
$$;
```

**Important:** migrations already applied are tracked in `_tags_migrations` by filename, so editing `0001_app_role.sql` is safe for databases that already ran it, and fixes fresh databases. Do NOT rename the file.

**Verify:** create a scratch Postgres database with a name other than `tags`, point `DATABASE_MIGRATE_URL` at it, run `pnpm db:migrate`. All 4 migrations must apply.

---

### P0-3. Approving a Composio tool crashes the run ("Tool not found")

**Files:**
- `packages/runtime/src/tools/composio-governance.ts` (names Composio tools `composio.<NAME>` and pauses runs through `gateSideEffectingTool`)
- `packages/runtime/src/agent/loop.ts` — `executeApprovedTool` (lines ~222–263)
- `packages/runtime/src/inngest/functions.ts` — `executeApprovedToolStep` (lines ~230–261)

**Problem:** When a Composio MCP tool needs approval, the run pauses with `toolName: "composio.GITHUB_CREATE_ISSUE"` (or similar). When a human clicks Approve, the Inngest function calls `executeApprovedToolStep` → `executeApprovedTool`, which does:

```ts
const tagsTool = resolveTools(db, [args.toolName], args.toolOptions)[0];
if (!tagsTool) {
  throw new Error(`Tool not found: ${args.toolName}`);
}
```

`resolveTools` (`packages/runtime/src/tools/registry.ts`) only knows the five native tools (`search_thread`, `search_memory`, `save_memory`, `create_artifact`, `run_coding_agent`). Any `composio.*` name is not in the registry, so **approving a Composio action always throws and fails the run**. Rejecting works; approving does not.

**Fix (recommended approach):** In `executeApprovedToolStep` (functions.ts), detect Composio tool names (prefix `composio.`) and handle them separately:

1. If `segment.toolName.startsWith("composio.")`:
   - Load the space config (`loadActiveSpaceConfig`) and Composio tools exactly like `runAgentSegment` does (`loadComposioTools` with `apiKey: secrets.composioApiKey`, `entityId: input.spaceId`, `toolkits: config.enabledConnections`).
   - Strip the `composio.` prefix to get the raw MCP tool name, look it up in the loaded `ToolSet`, and call its `execute(segment.toolInput, {})`.
   - Mark the tool invocation complete with `completeToolInvocation(db, segment.invocationId, { status: "succeeded", result: output })`.
   - Emit `tool.finished` with the output, and `close()` the MCP client in a `finally`.
   - Return `{ modelOutput: output }`.
2. Otherwise fall through to the existing `executeApprovedTool` call for native tools.

**Verify:** with a Space in `orchestrator` mode and a Composio toolkit enabled, trigger a side-effecting Composio call, click Approve in Slack, and confirm the run resumes and finishes instead of failing.

---

### P0-4. One approval unlocks ALL side-effecting tools for the rest of the run

**Files:**
- `packages/runtime/src/agent/loop.ts`, `buildAiTools`, lines ~329–347
- `packages/runtime/src/tools/composio-governance.ts`, line ~51
- `packages/runtime/src/tools/approval-gate.ts`, line ~30

**Problem:** After a human approves one tool call, the resumed agent segment runs with `args.approvedRequestId` set. Both gates check only *whether it exists*, not *what it approved*:

```ts
// loop.ts — native tools skip the gate entirely when approvedRequestId is set:
if (
  tagsTool.sideEffecting &&
  needsApproval(tagsTool.approval, input) &&
  !args.approvedRequestId
) { ... }
```

```ts
// approval-gate.ts — same problem for Composio tools:
if (args.approvedRequestId) return {};
```

So if the model, after one approval, decides to call a *different* side-effecting tool (or the same tool with *different input*), it executes with **no approval at all**. This defeats the entire human-in-the-loop guarantee.

**Fix:** Make the approval consumable and specific:

1. In `AgentLoopArgs` (loop.ts), keep `approvedRequestId` but also thread through the approved `toolName` and the idempotency key of the approved invocation. The resume step (`resumeAfterApprovalStep` in `functions.ts`) already has `segment.toolName` and `segment.toolInput` — pass them into `AgentLoopArgs` as e.g. `approvedTool: { requestId, toolName, idempotencyKey }` where `idempotencyKey = toolIdempotencyKey(runId, toolName, toolInput)`.
2. In `buildAiTools`, only skip the gate when ALL of these hold:
   - `args.approvedTool` is set,
   - `tagsTool.name === args.approvedTool.toolName`,
   - `toolIdempotencyKey(args.runId, tagsTool.name, input) === args.approvedTool.idempotencyKey`.
   Any other side-effecting call must go through `gateSideEffectingTool` again (creating a new approval request and pausing again — the Inngest function must support a second pause; see note below).
3. Apply the same matched check in `composio-governance.ts` (compare against `approvedTool` instead of `approvedRequestId` presence).

**Note on multiple pauses:** `tagsRunFunction` in `functions.ts` currently handles exactly one `approval_required` result. Wrap the segment → wait → resume sequence in a loop (e.g. `for (let i = 0; i < MAX_APPROVALS; i++)` with unique step names like `agent-segment-${i}`, `await-approval-${i}`) so a resumed segment that pauses again is handled instead of falling through.

**Verify:** approve a `run_coding_agent` call, then have the model attempt a second distinct side-effecting call in the same run; it must pause again, not execute.

---

### P0-5. Self-approval prevention and approval expiry are dead code

**Files:**
- `packages/runtime/src/tools/approval-gate.ts` — never passes `requestedByUserId` to `createApprovalRequest`
- `packages/runtime/src/agent/loop.ts` — has `args.actorUserId` available but doesn't forward it to the gate
- `apps/web/src/app/api/slack/interactions/route.ts` — calls `canApprove(...)` without `requesterSlackUserId` (lines ~65–69) and never checks `expiresAt`
- `packages/core/src/policies.ts` — `canApprove` only blocks self-approval when `requesterSlackUserId` is provided

**Problem A (self-approval):** `approval_requests.requested_by_user_id` is never populated, and the Slack interaction handler never passes the requester to `canApprove`. Therefore `allowSelfApprove: false` (the seeded default policy) can never block anyone — the person who asked for the action can approve it themselves.

**Fix A:**
1. Add `actorUserId?: string | null` to `ApprovalGateArgs` in `approval-gate.ts` and pass it to `createApprovalRequest` as `requestedByUserId`. Note: the schema column references `users.id` (a uuid), but the runtime only has the Slack user id string. Simplest correct fix: change nothing in the schema, and instead store the Slack user id in a new plain-text column `requested_by_slack_user_id` (new migration `0004_approval_requester.sql`: `ALTER TABLE approval_requests ADD COLUMN requested_by_slack_user_id text;`), populate it from the gate, and read it in the interaction handler. Do NOT write a Slack id into the uuid FK column.
2. In `loop.ts` `buildAiTools`, pass `args.actorUserId` into `gateSideEffectingTool`. Do the same in `composio-governance.ts` (it has `ctx.args.actorUserId`).
3. In `apps/web/src/app/api/slack/interactions/route.ts`, pass `requesterSlackUserId: approval.requestedBySlackUserId ?? undefined` into `canApprove`.

**Problem B (expiry):** `expiresAt` is written (`approval-gate.ts` line ~58, hardcoded now + 60min) but never read. A click after expiry still resolves the approval and emits `APPROVAL_RESOLVED_EVENT` (which no workflow is waiting for if the 1h Inngest timeout already fired), leaving inconsistent state.

**Fix B:**
1. In both resolvers (`apps/web/src/app/api/slack/interactions/route.ts` and `apps/web/src/app/api/approvals/[approvalId]/respond/route.ts`), before resolving, check `if (approval.expiresAt && approval.expiresAt < new Date())` → mark the row `expired` (guarded update where status = 'pending') and return an "expired" message instead of resolving.
2. In `packages/runtime/src/inngest/functions.ts`, in the timeout branch (`resolved` is null after `waitForEvent`), also flip the approval row to `expired` via a guarded update (`resolveApprovalByRequestId`-style update setting status `expired` where status = 'pending'). Currently the row stays `pending` forever and clutters the approval inbox.
3. Optional improvement: read `default_expiry_minutes` from the Space's approval policy (`getApprovalPolicyForSpace`) instead of the hardcoded 60 minutes in `approval-gate.ts`.

**Verify:** (a) requester clicking Approve on their own request gets "not authorized" when `allow_self_approve` is false; (b) clicking Approve after the expiry time gets "expired" and the run does not resume; (c) letting the 1h timeout fire leaves the row in status `expired`, not `pending`.

---

### P0-6. Scheduled runs always fail (fabricated Slack thread timestamp)

**Files:**
- `packages/runtime/src/inngest/evaluate-schedules.ts`, lines ~43–59
- `packages/runtime/src/inngest/functions.ts`, `ingestStep`, lines ~144–150 and ~175

**Problem:** For each due schedule, the code fabricates a Slack timestamp:

```ts
const scheduleThreadTs = `${Date.now()}.000000`;
```

and passes it as `threadTs` / `rootMessageTs` / `triggerMessageTs`. Then `ingestStep`:
1. calls `syncSlackThreadToDb(...)` → `conversations.replies` with that fake `ts` → Slack returns `thread_not_found` → throws;
2. even if sync were skipped, `postThreadMessage(slack, channelId, input.threadTs, ...)` posts with `thread_ts` pointing at a message that does not exist → `message_not_found`.

Either way the ingest step throws, Inngest retries twice, and the scheduled run fails. Phase 8 (schedules) does not work against real Slack.

**Fix:** Scheduled runs must create their own root message first (PLAN.md: "Each fired schedule creates a run in its own thread"):

1. Add an optional flag to `TagsRunInput`, e.g. `isScheduled?: boolean` (set it in `evaluate-schedules.ts`; remove the fake `scheduleThreadTs`— pass empty strings or omit).
2. In `ingestStep`, when `input.isScheduled`:
   - First post a root channel message (`chat.postMessage` WITHOUT `thread_ts`), e.g. `Scheduled task: <prompt preview>`. Use its returned `ts` as both the thread id (`providerThreadId`) and root message id for `findOrCreateThread`.
   - Skip `syncSlackThreadToDb` (there is nothing to sync yet).
   - Then post the "Tags is working…" reply into that new thread (`thread_ts` = the root ts just created).
3. Everything downstream (agent segment, stream adapter) already works off `slackMessageTs`, so no other changes needed.

**Also fix:** `evaluate-schedules.ts` line ~21 reads `process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"` — fine, but make sure `NEXT_PUBLIC_APP_URL` is set in production (see P2-5).

**Verify:** create a schedule via the admin UI with cron `* * * * *`; within a minute a fresh root message + threaded run output must appear in the mapped channel, and the `runs` row must have `trigger = 'schedule'` and status `done`.

---

### P0-7. Budget enforcement never triggers in the default (opencode) runtime mode

**Files:**
- `packages/runtime/src/agent/opencode-segment.ts` — never calls `recordUsage`
- `packages/core/src/usage.ts` — `MODEL_COST_RATES` only contains OpenAI models

**Problem A:** `checkSpaceBudget` blocks runs when monthly spend ≥ budget, but spend is computed from `usage_records`, and only the orchestrator path (`agent/loop.ts` lines ~189–196) writes usage records. The default `runtimeMode` is `opencode` (see `parseRuntimeMode` in `packages/core/src/spaces.ts` — anything not `"orchestrator"` becomes `"opencode"`, and the seed sets `'opencode'`). So for default Spaces, spend is always $0 and the hard limit never trips.

**Fix A:** In `runOpencodeSegment`, after a successful run, record usage. opencode does not report token counts back, so estimate:
- Add a conservative flat estimate or estimate from character counts: `promptTokens ≈ Math.ceil(prompt.length / 4)`, `completionTokens ≈ Math.ceil(result.output.length / 4)`.
- Call `recordUsage(args.db, { organizationId, spaceId, runId, modelId: config.modelId, promptTokens, completionTokens })`.
- Also write the same numbers into `updateRunStatus(..., "done", { tokenUsage: {...} })` so the run detail page shows them.

**Problem B:** `MODEL_COST_RATES` (usage.ts lines ~10–13) only lists `openai/gpt-4o-mini` and `openai/gpt-4o`. The stack is Fireworks-only, so every real run misses the table, logs a warning, and uses `DEFAULT_COST_RATES`. The doc comment also stale-references "AI Gateway model ids".

**Fix B:** Add entries for the Fireworks models actually used (at minimum `accounts/fireworks/models/kimi-k2-instruct`) with current Fireworks pricing, update the comment to say "Fireworks model ids", and keep the default-rate fallback + warning as-is.

**Verify:** run one opencode-mode task, then check `usage_records` has a row and `/admin/spaces/[spaceId]/usage` shows non-zero spend. Set a tiny budget (e.g. 1) with `hard_limit=true` and confirm the next run is blocked with the budget message.

---

### P0-8. Per-Space model selection is ignored in the default (opencode) mode

**Files:**
- `packages/sandbox/src/e2b-provider.ts`, line ~40: `const model = config.model ?? "accounts/fireworks/models/kimi-k2-instruct";`
- `packages/runtime/src/providers.ts` — `createSandboxProvider({ ..., model: config.opencodeModel, ... })`
- `packages/runtime/src/agent/opencode-segment.ts` — loads `config` (which has `modelId`) but never passes it to the sandbox

**Problem:** In opencode mode the model comes from the global `OPENCODE_MODEL` env var, not from `space_configs.model_id`. Changing a Space's model in the admin UI does nothing for default-mode Spaces. Per-Space model switching is the project's headline differentiator (PLAN.md "Model Strategy"), so this is a product-level bug.

**Fix:**
1. Add an optional `model?: string` field to `CodingAgentRequest` in `packages/sandbox/src/types.ts`.
2. In `e2b-provider.ts` `runCodingAgent`, use `request.model ?? config.model ?? DEFAULT` when building the `opencode run --model ...` command.
3. In `opencode-segment.ts`, pass `model: config.modelId` in the `runCodingAgent` call (the space config is already loaded there).
4. Keep `OPENCODE_MODEL` env as the fallback for Spaces whose `model_id` is not a valid Fireworks/opencode model string.

**Verify:** set two Spaces to different `model_id` values, run a task in each, and confirm (from the opencode output/logs) that each sandbox invoked the correct `--model`.

---

### P0-9. `appendRunEvent` is racy and O(n²) per run

**File:** `packages/core/src/runs.ts`, lines ~50–69

**Problem:**

```ts
const existing = await db
  .select({ seq: runEvents.seq })
  .from(runEvents)
  .where(eq(runEvents.runId, runId))
  .orderBy(asc(runEvents.seq));
const nextSeq = existing.length > 0 ? Number(existing[existing.length - 1]!.seq) + 1 : 1;
```

- It fetches **every** prior event row just to compute the next sequence number, and it is called once per streamed text delta (`onChunk` in loop.ts) — long runs make thousands of increasingly expensive queries.
- Two concurrent emitters (text delta callback + a tool event) can read the same max and collide on the `unique (run_id, seq)` constraint, throwing and failing the run.

**Fix:** Compute the next seq atomically in SQL in a single statement:

```ts
import { sql } from "drizzle-orm";

await db.execute(sql`
  insert into run_events (run_id, seq, event_type, payload)
  values (
    ${runId},
    coalesce((select max(seq) from run_events where run_id = ${runId}), 0) + 1,
    ${event.type},
    ${JSON.stringify(event)}::jsonb
  )
`);
```

Plus add a retry (2–3 attempts) on unique-violation, since `max+1` under concurrency can still occasionally collide. Also add an index on `(run_id, seq desc)` if not already present (check `0000_initial.sql`; the unique constraint typically covers it).

Optional improvement: batch/throttle `text.delta` persistence (e.g. flush concatenated deltas every ~1s) instead of one row per chunk — mirrors what `SlackStreamAdapter` already does for Slack edits.

**Verify:** run a long streaming task and confirm no unique-violation errors in logs and reasonable `run_events` row counts.

---

## Priority P1 — Security / correctness gaps. Fix before real teams use it.

### P1-1. RLS is decorative — production code never sets the RLS GUCs

**Files:**
- `packages/db/src/rls.ts` — `withRlsScope` / `setRlsScope` exist but are used ONLY in `packages/db/src/rls.test.ts`
- `packages/db/src/client.ts` — `createDb` builds a plain pooled connection
- All of `packages/core/src/*` — every query runs without any scope

**Problem:** Migrations enable row-level security with policies keyed on `current_setting('tags.organization_id')` etc. (see `0000_initial.sql` lines ~191–230, `0002_phase_extensions.sql` lines ~61–80). But no production code path ever sets those GUCs. Consequence: the app only functions if `DATABASE_URL` connects as a role that bypasses RLS (table owner / superuser). Tenant isolation is therefore enforced by application discipline only — exactly what PLAN.md's Security section says must not happen.

**Fix (incremental, do not attempt a big-bang rewrite):**
1. Decide the enforcement point: the cleanest is to make `createDb` accept an optional scope and wrap queries in a transaction that runs `set_config(...)` first (drizzle: use `db.transaction` and raw `sql` for `set_config`).
2. Start with the highest-risk read paths: memory search (`packages/core/src/memory.ts` `searchMemories`) and thread messages (`packages/core/src/threads.ts` `listThreadMessages`) — these feed model context, so a scoping bug leaks other Spaces' content into prompts.
3. The runtime already threads `organizationId` and `spaceId` through every call site (see `AgentLoopArgs`), so the scope values are available everywhere they are needed.
4. Deploy with `DATABASE_URL` pointed at the `tags_app` role (created in `0001_app_role.sql`, `NOBYPASSRLS`) and `DATABASE_MIGRATE_URL` at the owner role. Anything that breaks under `tags_app` is a query that was relying on the bypass — fix those queries rather than reverting the role.

**Verify:** with `DATABASE_URL` = `tags_app` role, the full Slack → run → reply loop works, and `packages/db/src/rls.test.ts` still passes.

---

### P1-2. Run traces and artifacts are publicly readable

**Files:**
- `apps/web/src/middleware.ts` — the protected matcher covers `/admin`, `/api/spaces`, `/api/approvals`, `/api/audit`, `/api/export`, `/api/memory`, `/api/schedules`, `/api/usage` — but NOT `/runs`, `/artifacts`, `/api/runs`, `/api/artifacts`
- `apps/web/src/app/api/runs/[runId]/events/route.ts` — no auth check
- `apps/web/src/app/api/artifacts/[artifactId]/route.ts` — no auth check
- `apps/web/src/app/runs/[runId]/page.tsx`, `apps/web/src/app/artifacts/[artifactId]/page.tsx` — no auth check

**Problem:** Anyone with a URL can read the full run event trace (tool inputs/outputs, model text) and artifact bodies. IDs are UUIDv7 (time-ordered), which is more enumerable than random UUIDs. These pages are deliberately link-shared from Slack, but that is a decision that should be made explicitly — and the JSON APIs at least should not be open.

**Fix (choose one, document the choice in README):**
- **Option A (recommended):** require a signed-in Clerk user for `/runs(.*)`, `/artifacts(.*)`, `/api/runs(.*)`, `/api/artifacts(.*)` by adding them to `isProtectedRoute` in `middleware.ts`. Slack users clicking links must sign in once. Keep `/api/slack(.*)` and `/api/inngest(.*)` public (they have their own signatures).
- **Option B:** keep them public but capability-gated: add a random unguessable token column to `runs`/`artifacts`, include it in the links posted to Slack (`?t=<token>`), and check it in the route/page. No sign-in needed, links remain shareable.

**Verify:** opening a run URL in an incognito window either redirects to sign-in (A) or 404s without the token (B).

---

### P1-3. Potential infinite self-trigger loop on thread replies

**File:** `apps/web/src/app/api/slack/events/route.ts`, lines ~55–63

**Problem:**

```ts
const isThreadReply =
  event.type === "message" &&
  event.thread_ts &&
  (text.toLowerCase().includes("@tags") || text.toLowerCase().startsWith("tags "));
```

The bot's own working message starts with `"Tags is working…"` → lowercased starts with `"tags "` → if the Slack app is ever subscribed to `message.channels`, the bot's own reply triggers a new run, which posts another message, forever. There is no `bot_id` / own-user check. (Today only `app_mention` is subscribed per the README, so this branch is dead code — but it's a landmine.)

**Fix:** Add a guard before the trigger classification:

```ts
type SlackEventPayload = { ...; event?: { ...; bot_id?: string } };
if (event.bot_id) return new Response("ok");
```

Optionally also compare `event.user` against the bot's own user id (from `auth.test`, cached) for belt-and-braces.

**Verify:** subscribe a dev workspace to `message.channels`, mention the bot, and confirm exactly one run fires.

---

### P1-4. No per-thread concurrency guard (two runs fight over one thread)

**Files:**
- `packages/runtime/src/inngest/functions.ts`, `ingestStep` (lines ~170–175) — sets `threads.activeRunId` unconditionally
- PLAN.md "Concurrency control" specifies: one active run per thread, advisory lock, follow-up messages appended

**Problem:** Nothing checks `activeRunId` before starting; two mentions in the same thread produce two concurrent runs that both edit their own Slack messages and interleave context writes. `releaseThreadStep` then clears whichever finished last.

**Fix (minimum viable):** In `ingestStep`, after `findOrCreateThread`, do a guarded claim:

```ts
const claimed = await db
  .update(threads)
  .set({ activeRunId: run.id, status: "running", updatedAt: new Date() })
  .where(and(eq(threads.id, thread.id), isNull(threads.activeRunId)))
  .returning();
if (!claimed[0]) {
  // A run is already active: post a brief "still working on the previous request" reply and stop.
}
```

Note ordering: create the `runs` row first (it already dedups by idempotency key), then claim. On the not-claimed path, mark the new run `cancelled` and return a sentinel the Inngest function can use to exit early. Also fix `releaseThreadStep` to only clear `activeRunId` when it equals this run's id (`where(and(eq(threads.id, threadId), eq(threads.activeRunId, runId)))`).

**Verify:** send two mentions in the same thread within seconds; the second gets a "still working" reply and no second run executes.

---

### P1-5. Failed runs mark the thread `done`

**File:** `packages/runtime/src/inngest/functions.ts`, `releaseThreadStep` (lines ~338–345)

**Problem:** `release-thread` always sets `status: "done"`, even when the agent segment threw and the run failed. Thread status in the DB then lies.

**Fix:** Pass the outcome into the step (the Inngest function knows whether `agent-segment` threw — wrap the body in try/catch, or check the segment result) and set `status: "failed"` when appropriate. Simplest: add a `status` parameter to `releaseThreadStep(threadId, status: "done" | "failed")` and call it from a `finally`-style path with the right value.

---

## Priority P2 — Deploy checklist (Railway)

### P2-1. No migration step on deploy

**File:** `railway.json`

`buildCommand` builds only the web app; `startCommand` only starts it. Nothing runs migrations. Add a pre-deploy command (Railway supports `preDeployCommand` in the deploy section) or run manually every release:

```json
"deploy": {
  "preDeployCommand": "pnpm db:migrate",
  ...
}
```

Requires `DATABASE_MIGRATE_URL` (owner role) to be set in Railway variables. Fix P0-2 first or this will fail on the `GRANT ... DATABASE tags` line.

### P2-2. Inngest production keys

`INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` are optional in `apps/web/src/env.ts` but are **required** for production Inngest Cloud (event sending + request signing). Set both in Railway, then sync the app at `https://<railway-domain>/api/inngest` from the Inngest dashboard. Without them, `inngest.send` in `apps/web/src/lib/slack-run.ts` fails and no runs ever start. Consider making both required when `NODE_ENV === "production"` in the env schema so misconfiguration fails loudly.

### P2-3. Required env vars at boot

`getEnv()` throws per-request, not at startup, so a missing var shows up as 500s on webhooks rather than a failed deploy. Required set: `DATABASE_URL`, `FIREWORKS_API_KEY`, `SLACK_SIGNING_SECRET`, `SLACK_BOT_TOKEN`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`. Optional but needed for features: `E2B_API_KEY` (+ `E2B_OPENCODE_TEMPLATE`, `OPENCODE_MODEL`), `COMPOSIO_API_KEY`, `R2_*`, `ADMIN_USER_IDS`/`ADMIN_EMAILS`, `INNGEST_*`. Consider calling `getEnv()` once in `next.config.ts`'s server startup (or an instrumentation hook) to fail fast.

### P2-4. `NEXT_PUBLIC_APP_URL` must be the public Railway URL

It defaults to `http://localhost:3000` (`apps/web/src/env.ts` line ~10). If unset in production, every run link posted to Slack points at localhost. Set it to `https://<your-domain>`. Note `evaluate-schedules.ts` reads it from `process.env` directly, so it must be present in the runtime env (it is, being NEXT_PUBLIC it is also inlined at build time for client code — set it before building).

### P2-5. Slack app config for production

Point Event Subscriptions to `https://<domain>/api/slack/events` and Interactivity to `https://<domain>/api/slack/interactions`. Subscribe to `app_mention` (and `message.channels` only after fixing P1-3). Bot scopes needed: `app_mentions:read`, `channels:history`, `chat:write`.

### P2-6. Seed for production bootstrap

After P0-1 is fixed, either run `pnpm db:seed` with `SEED_SLACK_TEAM_ID` / `SEED_SLACK_CHANNEL_ID` set to the real workspace/channel, or create the org/workspace/space through `POST /api/spaces` (needs a Clerk admin; see `ADMIN_USER_IDS` bootstrap in `.env.example`).

---

## Priority P3 — Vision gaps vs Claude Tag / PLAN.md (feature work, not bugs)

These are missing capabilities relative to `anthropic-claude-tag.md`, the Karpathy/Theo transcript, and PLAN.md's own claims. Each is scoped small enough to implement independently.

### P3-1. Thread summaries are never generated

`packages/runtime/src/context/builder.ts` reads `thread.summary` (lines ~67–70) but **nothing writes it** (`packages/core/src/threads.ts` has no summary writer; grep confirms). README claims Phase 4 done.

**Fix:** After `run.finished` in both segment paths, if the thread has more than ~20 messages, run a cheap summarization call (Fireworks, low reasoning) over the stored messages and write the result to `threads.summary` as `{ text, updatedAt }` via a new `updateThreadSummary(db, threadId, summary)` in `packages/core/src/threads.ts`. Then long threads keep working past the `MAX_HISTORY_CHARS` (24k chars) packing cutoff with real context instead of "[Earlier thread messages omitted…]".

### P3-2. The agent cannot ask clarifying questions

`question.requested` exists in `packages/core/src/events.ts`, is rendered by `packages/slack/src/blocks/render.ts` (line ~187) and `packages/ui` — but no producer exists. **Fix:** add an `ask_user` TagsTool that goes through the same pause/resume machinery as approvals (create a `question`-type request row, emit `question.requested`, throw the pause error; resume injects the human's answer as the tool result). The Inngest wait already keys on `requestId`, so most plumbing is reusable.

### P3-3. The agent cannot schedule its own tasks

Schedules are admin-CRUD only (`apps/web/.../schedules/page.tsx`, `packages/core/src/schedules.ts`). The Theo-video flow ("every day at 11am do X") requires a `create_schedule` tool. **Fix:** add a side-effecting, approval-gated `create_schedule` TagsTool that inserts into `schedules` (cron, timezone, prompt) for the current Space, and register it in `packages/runtime/src/tools/registry.ts`.

### P3-4. Memory doesn't accumulate automatically

Memory is only written by the explicit `remember that …` regex (`parseRememberCommand`) and the `save_memory` tool when the model chooses to call it. "Claude learns over time" needs at minimum: after each completed run, an extraction pass that proposes memories (facts/decisions/preferences) from the thread, stored with `createdBy: "agent"` and lower confidence, browsable/deletable in the existing memory UI. Respect `memory_policies.allow_agent_proposed`.

### P3-5. No org-level budget

Budgets are per-Space (`budget_policies` referenced from `spaces`). Claude Tag has org + per-channel limits. **Fix:** add an org-level check in `checkSpaceBudget` (sum `usage_records` by `organization_id` for the month against an org budget policy) alongside the Space check.

### P3-6. No per-Space repo configuration for coding Spaces

Default opencode mode never clones a repo (`runOpencodeSegment` calls `runCodingAgent` without `repoUrl`); only the orchestrator's `run_coding_agent` tool accepts a model-supplied `repoUrl`. **Fix:** add `repo_url` (nullable text) to `space_configs` (new migration + `ActiveSpaceConfig` + admin UI field), and pass it through in `opencode-segment.ts`. GitHub product actions should use the Space's Composio GitHub connection.

### P3-7. Observability is missing

`SENTRY_DSN` exists in the env schema but no Sentry package is installed or initialized anywhere; PLAN.md commits to Sentry + trace spans. **Fix:** add `@sentry/nextjs`, wire `instrumentation.ts`, tag captures with `organization_id`/`space_id`/`run_id` and never message content. Until then, remove `SENTRY_DSN` from `env.ts` to avoid implying it works.

### P3-8. Test and CI coverage

Only `packages/db/src/rls.test.ts` exists, and there is no CI config in the repo. Minimum useful additions: unit tests for `packThreadHistory`, `verifySlackSignature`, `toolIdempotencyKey`/approval-gate behavior, `estimateCostMicroUsd`; a GitHub Actions workflow running `pnpm -r typecheck && pnpm test && pnpm --filter @tags/web build`.

---

## Dependency updates (safe order)

Checked 2026-07-02 via `pnpm -r outdated`. Typecheck and build pass on current versions, so none of these block deploy.

**Patch/minor (safe, do first, one commit):**

| Package | Current | Latest |
| --- | --- | --- |
| ai | 7.0.2 | 7.0.11 |
| @ai-sdk/mcp | 2.0.0 | 2.0.5 |
| @ai-sdk/fireworks | 3.0.2 | 3.0.4 |
| @clerk/nextjs | 7.5.9 | 7.5.12 |
| @slack/web-api | 7.17.0 | 7.18.0 |
| @composio/core | 0.13.0 | 0.13.1 |
| @aws-sdk/client-s3 | 3.1075.0 | 3.1078.0 |

Run `pnpm -r update` for these, then typecheck + build.

**Major (each needs its own migration pass, in this order):**
1. `drizzle-orm` 0.44 → 0.45 (small API surface here; check changelog for `sum`/`count` typing changes).
2. `zod` 3 → 4 — used in `apps/web/src/env.ts`, `packages/runtime/src/secrets.ts`, and all tool `inputSchema`s. AI SDK 7 accepts zod 4 schemas. Main breaking changes: error `issues` shape and `z.string().url()` moving to `z.url()`.
3. `next` 15.5 → 16.2 + `eslint-config-next` — check async request API and middleware matcher changes; `@clerk/nextjs` 7.5 supports Next 16.
4. Dev-only: `vitest` 3 → 4, `eslint` 9 → 10, `typescript` 5.9 → 6.0, `@types/node` 22 → 26 (align with the Node major actually deployed; Railway Railpack default should be pinned via `engines` or `.node-version`).
5. `packageManager` pnpm 9.15 → 10.x (update `packageManager` field; regenerates lockfile format).

**Provider-pattern notes (no action strictly required):**
- Composio is integrated via `@ai-sdk/mcp` instead of `@composio/vercel` because the Vercel provider peer-depends on `ai@^5||^6` — documented in `packages/runtime/src/tools/composio.ts` and correct for `ai@7`.
- Inngest: the whole `streamText` loop runs inside one `step.run`, so an Inngest retry re-bills the entire model call. Consider `step.ai.wrap` around the model call for observability + cheaper retries once P0 items are done.
- Slack: signature verification, 5-minute replay window, timing-safe compare, per-channel token bucket, and `Retry-After` handling on `chat.update` all match Slack's current guidance. `postThreadMessage` does not honor `Retry-After` on 429 the way `updateMessage` does — copy the same catch/retry there for symmetry.

---

## Suggested fix order

1. P0-1, P0-2 (unblock fresh installs and prod migrations) — tiny, independent.
2. P0-9 (event append race — everything streams through it).
3. P0-4, P0-5, P0-3 (approval-model correctness — do together, they touch the same files).
4. P0-6 (schedules), P0-7 + P0-8 (budget + model in opencode mode).
5. P1-2, P1-3, P1-4, P1-5 (route auth, loop guard, concurrency, thread status).
6. P2 checklist alongside the first deploy.
7. P1-1 (RLS enforcement) — biggest change, do when stable.
8. P3 feature gaps and dependency majors afterwards.
