/**
 * Sanity-check proof recording infra (intent, R2, E2B desktop template).
 * Run from repo root: pnpm exec tsx scripts/proof-recording-sanity.ts
 */
import "dotenv/config";
import { wantsDemoRecording } from "../packages/runtime/src/agent/demo-recording-intent.ts";
import { createDesktopSandbox, recordProofInSandbox } from "@tags/sandbox";
import {
  createR2Client,
  getR2ConfigFromProcessEnv,
  publicArtifactUrl,
  uploadArtifactBytes,
} from "@tags/storage";

type Check = { name: string; ok: boolean; detail?: string };

const checks: Check[] = [];

function add(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  const mark = ok ? "ok" : "FAIL";
  console.log(`[${mark}] ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  add(
    "intent: video proof",
    wantsDemoRecording("@tags fix the button and send video proof"),
  );
  add(
    "intent: ignores proof of concept",
    !wantsDemoRecording("@tags write a proof of concept"),
  );

  const template = process.env.E2B_OPENCODE_TEMPLATE ?? "tags-opencode-desktop";
  add("env: E2B_OPENCODE_TEMPLATE", Boolean(template), template);

  const r2Config = getR2ConfigFromProcessEnv();
  if (!r2Config?.publicBaseUrl) {
    add("env: R2_PUBLIC_BASE_URL", false, "missing");
  } else {
    const looksLikeS3Api = /r2\.cloudflarestorage\.com/i.test(r2Config.publicBaseUrl);
    add(
      "env: R2_PUBLIC_BASE_URL",
      !looksLikeS3Api,
      looksLikeS3Api
        ? "looks like the S3 API endpoint — use r2.dev or a custom domain"
        : r2Config.publicBaseUrl,
    );

    try {
      const client = createR2Client(r2Config);
      const key = `sanity/proof-recording-${Date.now()}.txt`;
      await uploadArtifactBytes(
        client,
        r2Config,
        key,
        Buffer.from("tags proof recording sanity"),
        "text/plain",
      );
      const url = publicArtifactUrl(r2Config, key);
      add("r2: upload", Boolean(url), url ?? undefined);
    } catch (error) {
      add(
        "r2: upload",
        false,
        error instanceof Error ? error.message : "upload failed",
      );
    }
  }

  if (!process.env.E2B_API_KEY) {
    add("e2b: recordProofInSandbox", false, "E2B_API_KEY missing — skipped");
  } else {
    const desktop = await createDesktopSandbox({
      template,
      apiKey: process.env.E2B_API_KEY,
      timeoutMs: 180_000,
      width: 1280,
      height: 800,
    });

    try {
      await desktop.commands.run(
        "python3 -m http.server 8765 >/tmp/tags-sanity-http.log 2>&1 & echo $! > /tmp/tags-sanity-http.pid",
      );
      await desktop.commands.run(
        "timeout 15 bash -lc 'until curl -fsS --max-time 1 http://127.0.0.1:8765/ >/dev/null; do sleep 0.2; done'",
        { timeoutMs: 20_000 },
      );

      const result = await recordProofInSandbox({
        sandbox: desktop,
        baseUrl: "http://127.0.0.1:8765",
        journeys: [
          {
            name: "home",
            steps: [
              { type: "navigate", url: "http://127.0.0.1:8765/" },
              { type: "waitMs", ms: 500 },
            ],
          },
        ],
        maxSeconds: 30,
        width: 1280,
        height: 800,
        fps: 15,
        filenameHint: "sanity",
      });

      add(
        "e2b: recordProofInSandbox",
        result.video.byteLength > 0,
        `${result.filename} ${result.video.byteLength} bytes`,
      );
    } catch (error) {
      add(
        "e2b: recordProofInSandbox",
        false,
        error instanceof Error ? error.message : "recordProofInSandbox failed",
      );
    } finally {
      await desktop.kill().catch(() => {});
    }
  }

  const failed = checks.filter((c) => !c.ok);
  if (failed.length > 0) {
    console.error(`\n${failed.length} check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll proof-recording sanity checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
