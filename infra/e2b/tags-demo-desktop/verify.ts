import "dotenv/config";
import { Sandbox } from "@e2b/desktop";

const TEMPLATE = process.env.E2B_DEMO_TEMPLATE ?? "tags-demo-desktop";

async function main() {
  if (!process.env.E2B_API_KEY) {
    throw new Error("E2B_API_KEY is required");
  }

  const sandbox = await Sandbox.create(TEMPLATE, {
    apiKey: process.env.E2B_API_KEY,
    timeoutMs: 120_000,
  });

  try {
    const checks = [
      "which ffmpeg && ffmpeg -version | head -1",
      "which git && git --version",
      "which curl && curl --version | head -1",
      "which xterm",
      "which node && node --version",
      "test -d /opt/tags-playwright/node_modules/playwright && echo playwright-ok",
      "test -d /ms-playwright && echo browsers-ok",
      `node -e "import('/opt/tags-playwright/node_modules/playwright/index.js').then(() => console.log('playwright-import-ok'))"`,
      "echo $DISPLAY",
    ];

    for (const command of checks) {
      const result = await sandbox.commands.run(command, { timeoutMs: 60_000 });
      const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
      console.log(`[${result.exitCode === 0 ? "ok" : "fail"}] ${command}`);
      console.log(output || "(no output)");
      if (result.exitCode !== 0) {
        throw new Error(`Check failed: ${command}`);
      }
    }

    console.log("tags-demo-desktop verification passed");
  } finally {
    await sandbox.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
