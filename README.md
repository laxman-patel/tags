<div align="center">

<a href="https://github.com/laxman-patel/tags">
  <img src="https://raw.githubusercontent.com/laxman-patel/tags/main/tags-icon-transparent.svg" alt="Tags" width="84" />
</a>

<h1>Tags</h1>

<p><strong>The open-source AI teammate for Slack.</strong></p>

<p>
  Mention <code>@tags</code> in any channel. It reads the whole thread, does the work,<br />
  and asks before doing anything it shouldn't.
</p>

<p>
  <a href="#quick-start"><strong>Quick start</strong></a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="https://github.com/laxman-patel/tags/issues">Issues</a>
</p>

<p>
  <a href="https://github.com/laxman-patel/tags/stargazers"><img src="https://img.shields.io/github/stars/laxman-patel/tags?style=flat&logo=github&label=stars&color=226AD6" alt="GitHub stars" /></a>
  <img src="https://img.shields.io/badge/self--hostable-yes-226AD6" alt="Self-hostable" />
  <img src="https://img.shields.io/badge/Node.js-22%2B-339933?logo=nodedotjs&logoColor=white" alt="Node.js 22 or newer" />
</p>

</div>

<br />

<p align="center">
  <a href="https://raw.githubusercontent.com/laxman-patel/tags/main/tags-web-ui-new/public/tags-vid-demo-web.mp4">
    <img src="https://raw.githubusercontent.com/laxman-patel/tags/main/tags-web-ui-new/public/slack-landing-2560.webp" alt="Tags working inside a Slack thread" width="100%" />
  </a>
</p>

<p align="center">
  <a href="https://raw.githubusercontent.com/laxman-patel/tags/main/tags-web-ui-new/public/tags-vid-demo-web.mp4"><strong>▶ Watch the 4:38 product demo</strong></a>
  <br />
  <sub>See a Slack thread become completed, reviewable work.</sub>
</p>

## An agent your whole team can share

Most AI assistants live in another tab and lose the context where work began. Tags lives in the Slack thread. Each channel becomes a **Space** with its own instructions, tools, connections, memory, approval policy, and budget.

- [x] Reads the full thread and carries the right context into every run
- [x] Streams live progress instead of disappearing behind a spinner
- [x] Pauses external writes and sensitive actions for human approval
- [x] Replies with interactive Slack UI, artifacts, and visual proof
- [x] Connects to GitHub, Linear, Notion, and more through Composio
- [x] Remembers decisions and schedules recurring work per Space
- [x] Persists every run, tool call, approval, artifact, and token cost

## How it works

```mermaid
flowchart LR
    A["Slack thread<br/><b>@tags</b>"] --> B["Space context<br/>instructions · memory · tools"]
    B --> C["Durable agent run<br/>opencode · Inngest"]
    C --> D["Read-only tools"]
    C -. "write or sensitive action" .-> E{"Approve in Slack"}
    E -- approved --> F["External tools"]
    D --> G["Streaming result<br/>cards · artifacts · proof"]
    F --> G
    C --> H["Run log · usage · audit"]
```

Slack stays the interface. Postgres is the source of truth, Inngest runs durable jobs, opencode drives the agent, and E2B provides isolated workspaces for code execution and proof recording.

## Quick start

You need **Node.js 22+**, **pnpm 10.6.5** (via Corepack), **Docker**, and a **Fireworks API key**. A Slack app and a public tunnel are only required for the end-to-end Slack flow.

```bash
git clone https://github.com/laxman-patel/tags.git
cd tags

corepack enable
pnpm install

docker compose up -d postgres
cp .env.example .env
```

Set the local database and inference values in `.env`:

```dotenv
DATABASE_URL=postgresql://tags_app:tags_app@localhost:5433/tags
DATABASE_MIGRATE_URL=postgresql://tags:tags@localhost:5433/tags
NEXT_PUBLIC_APP_URL=http://localhost:3000
FIREWORKS_API_KEY=...
```

Then migrate, seed, and start Tags:

```bash
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). See [`.env.example`](./.env.example) for Slack, Clerk, Inngest, Composio, E2B, R2, and observability settings.

<details>
<summary><strong>Connect a Slack workspace</strong></summary>

1. Add your Slack and Clerk credentials to `.env`, then generate `TAGS_ENCRYPTION_KEY` with `openssl rand -base64 32`.
2. Expose port `3000` with a public HTTPS tunnel and set `NEXT_PUBLIC_APP_URL` to that URL.
3. Configure your Slack app:

   | Setting | URL |
   | --- | --- |
   | OAuth redirect | `https://<your-domain>/api/slack/oauth/callback` |
   | Event Subscriptions | `https://<your-domain>/api/slack/events` |
   | Interactivity | `https://<your-domain>/api/slack/interactions` |

4. Subscribe to the `app_mention` bot event, install the app through Tags, and create a Space for the channel you want to use.
5. Run an Inngest dev server locally, or provide `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` for a hosted environment.

</details>

## Repository

| Path | Purpose |
| --- | --- |
| [`tags-web-ui-new`](./tags-web-ui-new) | React product UI and Node control plane |
| [`packages/runtime`](./packages/runtime) | Agent loop, tools, context, and durable jobs |
| [`packages/slack`](./packages/slack) | OAuth, signature verification, streaming, and Block Kit |
| [`packages/core`](./packages/core) | Spaces, runs, approvals, memory, schedules, and usage |
| [`packages/db`](./packages/db) | Drizzle schema, migrations, and row-level security |
| [`packages/sandbox`](./packages/sandbox) | E2B execution and proof recording |

## Develop and deploy

With local Postgres running and migrations applied, run the project checks before opening a pull request:

```bash
pnpm -r typecheck
pnpm test
pnpm --filter @tags/control-plane build
```

The repository includes a [Railway configuration](./railway.json) for building the control plane, running database migrations, and starting the production server. Production requires the database, Fireworks, Slack, Clerk, Inngest, and app URL variables documented in [`.env.example`](./.env.example).

Tags is under active development. Bug reports, feature ideas, and pull requests are welcome in [GitHub Issues](https://github.com/laxman-patel/tags/issues).

<div align="center">
  <sub>Built for teams that live in Slack.</sub>
</div>
