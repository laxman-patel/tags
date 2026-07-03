# Snappy Slack UX — Implementation Spec

Goal: make `@tags` feel instant and alive in Slack, like Claude Tag. Today nothing
visible happens until the Inngest `ingest` step finishes (several seconds of dead
air), the working message is a static string, and run completion gives no signal on
the user's own message.

Four changes, in order. Each phase is independently shippable and must pass
`pnpm typecheck` before moving on. Do NOT refactor anything not listed here.

Current behavior recap (verified against the code):

- `apps/web/src/app/api/slack/events/route.ts` receives the mention, verifies the
  signature, calls `startRunFromSlack` (which only sends an Inngest event), returns.
- The Inngest function `tagsRunFunction` in `packages/runtime/src/inngest/functions.ts`
  runs `ingestStep`, which does DB work and then posts the "Tags is working…"
  placeholder via `postThreadMessage`.
- `SlackStreamAdapter` (`packages/slack/src/stream-adapter.ts`) edits that placeholder
  as the run streams.
- Nothing ever reacts to the user's message, and nothing marks success/failure on it.

---

## Phase 1 — Reaction helpers in the Slack package

**File: `packages/slack/src/client.ts`**

Add two exported functions, following the exact same pattern as the existing
`postThreadMessage` (rate limiter first, retry on `retryAfter`):

```typescript
/** Emoji names are Slack reaction names WITHOUT colons, e.g. "eyes", "white_check_mark", "x". */
export async function addReaction(
  client: WebClient,
  channelId: string,
  messageTs: string,
  emoji: string,
): Promise<void> {
  await globalSlackRateLimiter.acquire(channelId);
  try {
    await client.reactions.add({ channel: channelId, timestamp: messageTs, name: emoji });
  } catch (error) {
    if (isIgnorableReactionError(error, "already_reacted")) return;
    const retryAfter = extractRetryAfter(error);
    if (retryAfter) {
      await sleep(retryAfter * 1000);
      return addReaction(client, channelId, messageTs, emoji);
    }
    throw error;
  }
}

export async function removeReaction(
  client: WebClient,
  channelId: string,
  messageTs: string,
  emoji: string,
): Promise<void> {
  await globalSlackRateLimiter.acquire(channelId);
  try {
    await client.reactions.remove({ channel: channelId, timestamp: messageTs, name: emoji });
  } catch (error) {
    if (isIgnorableReactionError(error, "no_reaction")) return;
    const retryAfter = extractRetryAfter(error);
    if (retryAfter) {
      await sleep(retryAfter * 1000);
      return removeReaction(client, channelId, messageTs, emoji);
    }
    throw error;
  }
}

function isIgnorableReactionError(error: unknown, code: string): boolean {
  if (typeof error !== "object" || error === null) return false;
  const data = (error as { data?: { error?: string } }).data;
  return data?.error === code;
}
```

Notes:

- `extractRetryAfter` and `sleep` already exist at the bottom of this file — reuse them,
  do not duplicate.
- Slack returns `already_reacted` / `no_reaction` as non-fatal errors; they MUST be
  swallowed (Inngest retries will re-run these calls).

**File: `packages/slack/src/index.ts`**

Extend the first export line:

```typescript
export { addReaction, createSlackClient, fetchThreadReplies, postThreadMessage, removeReaction, updateMessage } from "./client";
```

---

## Phase 2 — Instant 👀 + placeholder posted from the webhook

The webhook must respond to Slack within 3 seconds, so keep this path lean: one
reaction call (best-effort) + one message post + one Inngest send.

### 2a. Carry the placeholder ts through the run input

**File: `packages/runtime/src/inngest/functions.ts`**

Add one optional field to `TagsRunInput`:

```typescript
export type TagsRunInput = {
  // ... existing fields unchanged ...
  /** ts of the "Tags is working…" placeholder if the webhook already posted it. */
  placeholderMessageTs?: string;
};
```

### 2b. Post reaction + placeholder in the webhook handler

**File: `apps/web/src/app/api/slack/events/route.ts`**

At the top of the file add imports (imports go at the top, never inline):

```typescript
import { addReaction, createSlackClient, postThreadMessage } from "@tags/slack";
```

Then replace the final block of `POST` (the `await startRunFromSlack(...)` call) with:

```typescript
  const slack = createSlackClient(env.SLACK_BOT_TOKEN);

  // Instant acknowledgment on the user's message; never let it fail the webhook.
  const ack = addReaction(slack, channelId, event.ts, "eyes").catch(() => {});

  let placeholderMessageTs: string | undefined;
  try {
    const placeholder = await postThreadMessage(
      slack,
      channelId,
      threadTs,
      "Tags is working…",
    );
    placeholderMessageTs = placeholder.messageTs;
  } catch {
    // Non-fatal: ingestStep will post the placeholder itself as a fallback.
  }

  await startRunFromSlack(env, {
    teamId,
    channelId,
    threadTs,
    rootTs,
    text: text || "Hello Tags",
    messageTs: event.ts,
    actorSlackUserId: event.user ?? "unknown",
    eventId,
    trigger: isMention ? "mention" : "reply",
    placeholderMessageTs,
  });

  await ack;

  return new Response("ok");
```

**File: `apps/web/src/lib/slack-run.ts`**

- Add `placeholderMessageTs?: string;` to the `SlackTrigger` type.
- In `startRunFromSlack`, pass it through to the event data object:
  `placeholderMessageTs: trigger.placeholderMessageTs,` (the `TagsRunInput` type from
  Phase 2a already allows it).

### 2c. Reuse the placeholder in `ingestStep`

**File: `packages/runtime/src/inngest/functions.ts`**, function `ingestStep`.

Current code near the end:

```typescript
  const slackRef = await postThreadMessage(
    slack,
    input.channelId,
    threadTs,
    "Tags is working…",
  );
```

Replace with:

```typescript
  const slackRef = input.placeholderMessageTs
    ? { channelId: input.channelId, messageTs: input.placeholderMessageTs }
    : await postThreadMessage(slack, input.channelId, threadTs, "Tags is working…");
```

Scheduled runs (`input.isScheduled`) never set `placeholderMessageTs`, so they keep the
old behavior automatically.

### 2d. Busy-thread path must update the placeholder, not post a second message

Still in `ingestStep`, the `if (!claimed[0])` block currently does:

```typescript
    await postThreadMessage(
      slack,
      input.channelId,
      threadTs,
      "Still working on the previous request in this thread.",
    );
```

Replace with (import `updateMessage` is already imported in this file):

```typescript
    if (input.placeholderMessageTs) {
      await updateMessage(
        slack,
        input.channelId,
        input.placeholderMessageTs,
        "Still working on the previous request in this thread.",
      );
    } else {
      await postThreadMessage(
        slack,
        input.channelId,
        threadTs,
        "Still working on the previous request in this thread.",
      );
    }
```

Also in this skipped path, remove the eyes reaction (the run isn't happening):

```typescript
    if (!input.isScheduled) {
      await removeReaction(slack, input.channelId, input.triggerMessageTs, "eyes").catch(() => {});
    }
```

Add `removeReaction` to the existing `@tags/slack` import list at the top of
`functions.ts`.

---

## Phase 3 — ✅ / ❌ completion reaction swap

**File: `packages/runtime/src/inngest/functions.ts`**

The main function `tagsRunFunction` already tracks `threadStatus: "done" | "failed"`
and has a `finally` block that runs `release-thread`. Add a second step inside the
same `finally`, AFTER the `release-thread` step:

```typescript
    } finally {
      await step.run("release-thread", () =>
        releaseThreadStep(setup.threadId, setup.runId, threadStatus),
      );
      if (!input.isScheduled) {
        await step.run("finalize-reaction", () =>
          finalizeReactionStep(input.channelId, input.triggerMessageTs, threadStatus),
        );
      }
    }
```

And add this helper function near `releaseThreadStep` at the bottom of the file:

```typescript
async function finalizeReactionStep(
  channelId: string,
  triggerMessageTs: string,
  status: "done" | "failed",
) {
  const secrets = loadRuntimeSecrets();
  const slack = createSlackClient(secrets.slackBotToken);
  await removeReaction(slack, channelId, triggerMessageTs, "eyes").catch(() => {});
  await addReaction(
    slack,
    channelId,
    triggerMessageTs,
    status === "done" ? "white_check_mark" : "x",
  ).catch(() => {});
}
```

Add `addReaction` to the `@tags/slack` import list.

Skipped runs (`setup.skipped`) return early before the `try/finally`, so they are not
affected — Phase 2d already handles their reaction cleanup.

---

## Phase 4 — Live status headline in the working message

Today the working message shows the streamed text buffer, or the static
`_Tags is working…_` when the buffer is empty. Status events ("Reading thread
context", "Starting opencode agent in sandbox") are appended as one-shot context
blocks and scroll away. Instead, keep the latest status as a persistent headline.

**File: `packages/slack/src/stream-adapter.ts`**

1. Add a private field:

```typescript
  private statusLabel: string | null = null;
```

2. In `pushEvent`, intercept status events BEFORE the generic block handling. Replace
   the body of `pushEvent` with:

```typescript
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
```

3. In `flush`, replace the `blocks` construction:

```typescript
    const headline = this.statusLabel
      ? [{ type: "context", elements: [{ type: "mrkdwn", text: `⏳ ${this.statusLabel}` }] }]
      : [];

    const blocks = [
      ...headline,
      ...buildWorkingMessage(text || "_Tags is working…_"),
      ...this.pendingBlocks,
    ];
```

4. In `finalize`, clear the status so the final message has no stale headline:

```typescript
  async finalize(finalText: string): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.statusLabel = null;
    this.buffer = finalText;
    await this.flush(true);
  }
```

Do NOT change `renderSlackBlocks` in `packages/slack/src/blocks/render.ts` — status
events are still appended to the run event log in the DB and rendered on the web
timeline; only the Slack live-message treatment changes.

---

## Manual prerequisite (tell the user, cannot be automated)

The Slack app needs the **`reactions:write`** bot scope. Without it, `reactions.add`
fails with `missing_scope`. The user must add the scope at
api.slack.com → the Tags app → OAuth & Permissions → Bot Token Scopes, then
**reinstall the app to the workspace**. The code above swallows reaction errors, so
deploying before the scope is added degrades gracefully (no reactions, everything
else works).

---

## Verification

1. `pnpm typecheck` — must pass for every phase.
2. `pnpm test` — note: `packages/db/src/rls.test.ts` fails without a local Postgres on
   port 5433; that failure is pre-existing and NOT caused by this work. All other test
   files must pass.
3. Deploy: `railway up --service tags-web --environment production --ci` from the repo
   root. The CLI's log streaming sometimes times out with a `reqwest` error — the
   build still runs. Poll with:
   `railway status --json | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['environments']['edges'][0]['node']['serviceInstances']['edges'][0]['node']['latestDeployment']['status'])"`
   until `SUCCESS`.
4. End-to-end: mention `@tags` in the connected channel and confirm, in order:
   - 👀 appears on your message within ~1 second,
   - "Tags is working…" appears in the thread immediately (not seconds later),
   - the working message shows a `⏳ <status>` headline that changes as the run
     progresses,
   - on completion 👀 is replaced by ✅ (or ❌ on failure) and the thread reply is the
     final answer with the "_Run complete._" footer.
   If no Slack workspace access, replay a signed `app_mention` event: post a real root
   message with `chat.postMessage` (bot token), then POST to
   `https://tags-web-production.up.railway.app/api/slack/events` with a
   `event_callback` payload using that real `ts`, signed with `SLACK_SIGNING_SECRET`
   (HMAC-SHA256 of `v0:<timestamp>:<rawBody>`, header `x-slack-signature: v0=<hex>`,
   plus `x-slack-request-timestamp`). Secrets are available via
   `railway variables --service tags-web --environment production --kv`. Then poll
   `conversations.replies` and `reactions.get` to assert the states above.

## Out of scope (do not attempt)

- Custom E2B template for faster sandbox cold starts (infra work, tracked separately).
- Any change to the orchestrator-mode agent loop beyond what Phase 3 touches.
- Changing the thread-per-task model — replying inside each thread is by design.
