import { Template } from "e2b";

const NODE_VERSION = "20.18.3";

/**
 * Desktop sandbox for Tags demo recording: X11 from the stock `desktop` template,
 * plus ffmpeg, Node 20, Playwright/Chromium, and xterm for web/terminal screencasts.
 */
export const template = Template()
  .fromTemplate("desktop")
  .runCmd(
    "sudo DEBIAN_FRONTEND=noninteractive apt-get update && " +
      "sudo DEBIAN_FRONTEND=noninteractive apt-get install -y " +
      "ffmpeg git curl xterm ca-certificates coreutils xz-utils",
  )
  .runCmd(
    `curl -fsSL https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz | ` +
      "sudo tar -xJ -C /usr/local --strip-components=1",
  )
  .runCmd("sudo corepack enable")
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
