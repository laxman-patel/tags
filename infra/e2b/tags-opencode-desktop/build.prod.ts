import "dotenv/config";
import { Template, defaultBuildLogger } from "e2b";
import { template } from "./template.js";

async function main() {
  if (!process.env.E2B_API_KEY) {
    throw new Error("E2B_API_KEY is required to build the tags-opencode-desktop template");
  }

  await Template.build(template, "tags-opencode-desktop", {
    cpuCount: 4,
    memoryMB: 8192,
    onBuildLogs: defaultBuildLogger(),
  });

  console.log("Built template: tags-opencode-desktop");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
