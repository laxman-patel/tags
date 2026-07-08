import "dotenv/config";
import { Template, defaultBuildLogger } from "e2b";
import { template } from "./template.js";

async function main() {
  if (!process.env.E2B_API_KEY) {
    throw new Error("E2B_API_KEY is required to build the tags-demo-desktop template");
  }

  await Template.build(template, "tags-demo-desktop", {
    cpuCount: 4,
    memoryMB: 8192,
    onBuildLogs: defaultBuildLogger(),
  });

  console.log("Built template: tags-demo-desktop");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
