import { Template } from "e2b";

const NODE_VERSION = "20.18.3";

/**
 * Unified coding + proof sandbox: X11 desktop, opencode CLI, ffmpeg, and
 * Playwright/Chromium. All Space coding runs use this template so the agent
 * can start a local server and call `record_proof` in the same box.
 */
export const template = Template()
  .fromTemplate("desktop")
  .runCmd(
    "sudo DEBIAN_FRONTEND=noninteractive apt-get update && " +
      "sudo DEBIAN_FRONTEND=noninteractive apt-get install -y " +
      "ffmpeg git curl ca-certificates coreutils xz-utils",
  )
  .runCmd(
    `curl -fsSL https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz | ` +
      "sudo tar -xJ -C /usr/local --strip-components=1",
  )
  .runCmd("sudo corepack enable")
  .runCmd(
    "curl -fsSL https://opencode.ai/install | bash -s -- --no-modify-path && " +
      "sudo install -m 755 \"$HOME/.opencode/bin/opencode\" /usr/local/bin/opencode && " +
      "opencode --version",
  )
  .runCmd(
    "sudo mkdir -p /opt/tags-playwright /ms-playwright && " +
      "cd /opt/tags-playwright && " +
      "sudo /usr/local/bin/npm init -y && " +
      "sudo /usr/local/bin/npm install playwright@1.49.1 && " +
      "sudo env PLAYWRIGHT_BROWSERS_PATH=/ms-playwright PATH=/usr/local/bin:$PATH " +
      "npx playwright install chromium --with-deps",
  )
  .setEnvs({
    NODE_PATH: "/opt/tags-playwright/node_modules",
    PLAYWRIGHT_BROWSERS_PATH: "/ms-playwright",
    PATH: "/usr/local/bin:/usr/bin:/bin",
    DISPLAY: ":0",
  });
