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

Set `NEXT_PUBLIC_APP_URL` to your public Railway URL **before** building (e.g. `https://tags-production.up.railway.app`). Slack OAuth redirects, run links posted to Slack, schedule evaluation, Inngest, and MCP depend on it.

Required at production boot: `DATABASE_URL`, `FIREWORKS_API_KEY`, `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`, `TAGS_ENCRYPTION_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `NEXT_PUBLIC_APP_URL`.

`SLACK_BOT_TOKEN` is a legacy/dev-only fallback. Production Slack access is installed per account through OAuth and stored encrypted with `TAGS_ENCRYPTION_KEY`.

Migrations run automatically via `preDeployCommand` when `DATABASE_MIGRATE_URL` (owner role) is set.

### CI/CD

Railway is connected to the GitHub repo `laxman-patel/tags` and auto-deploys the `tags-web` service from the `main` branch. Pushes to `main` trigger Railway builds directly; GitHub Actions only runs verification.

Keep app secrets in Railway variables: Neon (`DATABASE_URL`, `DATABASE_MIGRATE_URL`), Inngest (`INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`), Cloudflare R2 (`R2_*`), Slack, Clerk, Fireworks, and other runtime keys. Railway builds with `railway.json`, runs `pnpm db:migrate` before release, and starts `@tags/control-plane`.

### Slack app configuration

In your Slack app settings (production domain `https://<your-domain>`):

| Setting | URL |
| --- | --- |
| Event Subscriptions | `https://<your-domain>/api/slack/events` |
| Interactivity | `https://<your-domain>/api/slack/interactions` |

**Bot token scopes:** `app_mentions:read`, `channels:history`, `chat:write`, `reactions:write` (👀/✅ acknowledgment reactions), `files:read` (read documents attached in threads), `files:write` (upload proof videos). After adding scopes, reinstall the app to the workspace.

Streaming replies use Slack's native `chat.startStream`/`chat.appendStream`/`chat.stopStream` APIs (animated "Tags is thinking…" indicator, markdown rendering, task timeline). These need `chat:write` only; if streaming is unavailable the bot falls back to posting and editing a regular message.

Proof videos: when an `@tags` message asks for a video, screencast, or visual proof, the agent starts the local app in the Space sandbox and calls the `record_proof` tool. That records the desktop (ffmpeg + Playwright), uploads the MP4 to R2 as a video artifact, and posts it to the Slack thread. Requires `E2B_API_KEY`, public R2 artifact URLs (`R2_PUBLIC_BASE_URL` — use an `r2.dev` or custom domain, not the S3 API endpoint), Slack bot `files:write`, and the unified `tags-opencode-desktop` E2B template (`infra/e2b/tags-opencode-desktop`).

Build the template once: `cd infra/e2b/tags-opencode-desktop && E2B_API_KEY=... npm install && npm run build`. Set `E2B_OPENCODE_TEMPLATE=tags-opencode-desktop` on the runtime. Sanity-check: `pnpm proof-recording:sanity`.

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
