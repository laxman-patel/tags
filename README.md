# Tags

Open-source Claude Tag for teams — channel-native org harness built on **opencode**, with **Fireworks** inference for now.

**Must-not-miss features:** generative UI (Block Kit from `run_events`), streaming Slack replies, human-in-the-loop approvals, full thread context.

## Prerequisites

- Node.js 22+
- pnpm 9+
- Docker (for local Postgres)
- Slack app with Events API + Interactivity
- Fireworks API key

## Phases implemented

| Phase | Status |
| --- | --- |
| 0 | Walking skeleton (Slack + Inngest + approval) |
| 1 | Space admin API + config versioning |
| 2 | Slack thread sync, rate limits, run links |
| 3 | Artifacts, approval inbox, UI package |
| 4 | Memory tools, context packing, memory browser |
| 5 | Approval authorization + audit events |
| 6 | Run timeline / tool trace depth |
| 7 | Usage records + spend dashboard |
| 8 | Schedules + Inngest cron tick |
| 9 | Audit UI, export, redaction helpers |

## Quick start

```bash
docker compose up -d postgres
cp .env.example .env
# Edit .env with your secrets

pnpm install
pnpm db:migrate
pnpm db:seed

pnpm dev
```

Point Slack Event Subscriptions and Interactivity to:

- `https://<tunnel>/api/slack/events`
- `https://<tunnel>/api/slack/interactions`

Subscribe to `app_mention`. Map your test channel via seed env vars or update the seeded space row.

## Production deploy (Railway)

### Environment

Set `NEXT_PUBLIC_APP_URL` to your public Railway URL **before** building (e.g. `https://tags-production.up.railway.app`). Run links posted to Slack and schedule evaluation depend on it.

Required at boot: `DATABASE_URL`, `FIREWORKS_API_KEY`, `SLACK_SIGNING_SECRET`, `SLACK_BOT_TOKEN`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `NEXT_PUBLIC_APP_URL`.

Migrations run automatically via `preDeployCommand` when `DATABASE_MIGRATE_URL` (owner role) is set.

### Slack app configuration

In your Slack app settings (production domain `https://<your-domain>`):

| Setting | URL |
| --- | --- |
| Event Subscriptions | `https://<your-domain>/api/slack/events` |
| Interactivity | `https://<your-domain>/api/slack/interactions` |

**Bot token scopes:** `app_mentions:read`, `channels:history`, `chat:write`, `reactions:write` (👀/✅ acknowledgment reactions), `files:read` (read documents attached in threads), `files:write` (upload demo recordings). After adding scopes, reinstall the app to the workspace.

Streaming replies use Slack's native `chat.startStream`/`chat.appendStream`/`chat.stopStream` APIs (animated "Tags is thinking…" indicator, markdown rendering, task timeline). These need `chat:write` only; if streaming is unavailable the bot falls back to posting and editing a regular message.

Demo recordings for coding PR runs are disabled by default. To enable them, set `DEMO_RECORDING_ENABLED=true`, configure `E2B_API_KEY`, configure public R2 artifact URLs, grant the Slack bot `files:write`, and enable/connect the Space's GitHub toolkit through Composio. GitHub metadata checks and PR comments are written through that Composio GitHub connection.

**Event subscriptions:** `app_mention`, `message.channels` (required for thread-reply triggers and passive channel learning — bot messages are ignored). Set `SLACK_BOT_USER_ID` for accurate mention detection in thread replies.

Sync Inngest at `https://<your-domain>/api/inngest` from the Inngest dashboard after deploy.

### Bootstrap data

After migrations, seed or create your first Space:

```bash
# Option A — seed script (set real Slack team/channel IDs)
SEED_SLACK_TEAM_ID=T… SEED_SLACK_CHANNEL_ID=C… pnpm db:seed
```

```bash
# Option B — admin API (requires Clerk admin via ADMIN_USER_IDS or org:admin)
POST /api/spaces
```

Run and artifact pages require Clerk sign-in (`/runs`, `/artifacts`).

## Verify Phase 0

1. `@tags summarize this thread` — streams progress in Slack
2. `@tags create a linear issue for this bug` — pauses on Approve/Reject
3. Kill `pnpm dev` mid-run, restart — Inngest run resumes; approval still works
4. Open `/runs/<run-id>` for the event timeline

## Monorepo

| Package | Role |
| --- | --- |
| `packages/db` | Drizzle schema, migrations, RLS |
| `packages/core` | Spaces, threads, runs domain logic |
| `packages/runtime` | opencode harness integration, tools, Inngest durable runs |
| `packages/slack` | Signature verify, Block Kit, stream adapter |
| `packages/ui` | Generative UI — React cards from `TagsEvent` / `UICard` |

See [PLAN.md](./PLAN.md) for the full product plan.
