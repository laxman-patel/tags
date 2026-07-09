# tags-opencode-desktop (E2B template)

Unified Space sandbox for Tags coding runs and in-run proof recording
(`record_proof`). Extends E2B's public `desktop` template with:

- ffmpeg (x11grab screen capture)
- Node.js + npm + corepack
- opencode CLI
- Playwright + Chromium (`/opt/tags-playwright`, browsers in `/ms-playwright`)
- git, curl

## Build

```bash
cd infra/e2b/tags-opencode-desktop
E2B_API_KEY=e2b_... npm install
npm run build
```

## Verify

```bash
E2B_API_KEY=e2b_... npm run verify
```

## Runtime

Set `E2B_OPENCODE_TEMPLATE=tags-opencode-desktop` on the Tags runtime (Railway).
After switching templates, existing Space sandbox sessions reconnect-fail and
are recreated automatically.
