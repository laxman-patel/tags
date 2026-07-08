# tags-demo-desktop (E2B template)

Desktop sandbox used by Tags demo recording (`packages/sandbox/src/demo-recorder.ts`).

Extends E2B's public `desktop` template with:

- ffmpeg (x11grab screen capture)
- Node.js + npm + corepack
- Playwright + Chromium (`/opt/tags-playwright`, browsers in `/ms-playwright`)
- xterm (terminal demos)
- git, curl

## Build

```bash
cd infra/e2b/tags-demo-desktop
E2B_API_KEY=e2b_... npm install
npm run build
```

## Verify

```bash
E2B_API_KEY=e2b_... npm run verify
```

## Runtime

Set `E2B_DEMO_TEMPLATE=tags-demo-desktop` on the Tags runtime (Railway).
