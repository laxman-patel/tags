#!/usr/bin/env tsx
/**
 * Sanity check for Tags demo recording infrastructure.
 * Run from repo root: pnpm exec tsx scripts/demo-recording-sanity.ts
 */
import "dotenv/config";
import { wantsDemoRecording } from "../packages/runtime/src/agent/demo-recording-intent.ts";
import { getR2ConfigFromProcessEnv, createR2Client, uploadArtifactBytes, publicArtifactUrl } from "@tags/storage";
import { recordDemo } from "@tags/sandbox";

type Check = { name: string; ok: boolean; detail: string };

const checks: Check[] = [];

function add(name: string, ok: boolean, detail: string) {
  checks.push({ name, ok, detail });
  const mark = ok ? "PASS" : "FAIL";
  console.log(`[${mark}] ${name}: ${detail}`);
}

async function main() {
  console.log("=== Demo recording sanity check ===\n");

  add(
    "intent: video proof",
    wantsDemoRecording("@tags fix login and send a video proof"),
    "detects explicit video request",
  );
  add(
    "intent: ordinary task",
    !wantsDemoRecording("@tags fix the login bug"),
    "ignores ordinary coding requests",
  );

  const e2bKey = process.env.E2B_API_KEY;
  add("env: E2B_API_KEY", Boolean(e2bKey), e2bKey ? "set" : "missing");

  const template = process.env.E2B_DEMO_TEMPLATE ?? "tags-demo-desktop";
  add("env: E2B_DEMO_TEMPLATE", template === "tags-demo-desktop", template);

  const r2 = getR2ConfigFromProcessEnv();
  add("env: R2 credentials", Boolean(r2), r2 ? `bucket=${r2.bucketName}` : "missing R2_* vars");
  add(
    "env: R2_PUBLIC_BASE_URL",
    Boolean(r2?.publicBaseUrl?.includes("r2.dev") || r2?.publicBaseUrl?.startsWith("https://")),
    r2?.publicBaseUrl ?? "missing",
  );

  if (r2?.publicBaseUrl && r2.publicBaseUrl.includes("cloudflarestorage.com")) {
    add(
      "env: R2 public URL shape",
      false,
      "R2_PUBLIC_BASE_URL must be a public r2.dev or custom domain, not the S3 API endpoint",
    );
  } else if (r2?.publicBaseUrl) {
    add("env: R2 public URL shape", true, "looks like a public base URL");
  }

  if (r2 && e2bKey) {
    const client = createR2Client(r2);
    const key = `sanity/demo-recording-${Date.now()}.txt`;
    const body = Buffer.from("tags demo recording sanity");
    try {
      await uploadArtifactBytes(client, r2, key, body, "text/plain");
      const url = publicArtifactUrl(r2, key);
      if (!url) throw new Error("publicArtifactUrl returned undefined");
      const response = await fetch(url);
      const text = await response.text();
      add(
        "r2: public fetch",
        response.ok && text === "tags demo recording sanity",
        `${response.status} ${url}`,
      );
    } catch (error) {
      add(
        "r2: public fetch",
        false,
        error instanceof Error ? error.message : "upload/fetch failed",
      );
    }

    try {
      const result = await recordDemo({
        apiKey: e2bKey,
        template,
        repoUrl: "https://github.com/octocat/Hello-World.git",
        demo: {
          kind: "terminal",
          command: "echo 'Tags demo recording sanity check' && ls -la | head -5",
        },
        maxSeconds: 20,
        width: 1280,
        height: 800,
        fps: 10,
      });
      add(
        "e2b: terminal recordDemo",
        result.video.byteLength > 1000,
        `mp4 bytes=${result.video.byteLength}, durationMs=${result.durationMs}`,
      );
    } catch (error) {
      add(
        "e2b: terminal recordDemo",
        false,
        error instanceof Error ? error.message : "recordDemo failed",
      );
    }
  }

  console.log("\n=== Summary ===");
  const failed = checks.filter((c) => !c.ok);
  console.log(`${checks.length - failed.length}/${checks.length} passed`);
  if (failed.length > 0) {
    console.log("Failed:");
    for (const check of failed) {
      console.log(`- ${check.name}: ${check.detail}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
