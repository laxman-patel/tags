import type {
  ProofJourney,
  ProofJourneyResult,
  ProofRecordingRequest,
  ProofRecordingResult,
  ProofSandbox,
  ProofStep,
} from "./types";

const RECORDING_PATH = "/tmp/tags-proof.mp4";
const PLAYWRIGHT_MODULE = "/opt/tags-playwright/node_modules/playwright";
const JOURNEY_TIMEOUT_MS = 90_000;
const READY_POLL_INTERVAL_S = "0.15";

type CommandResult = { stdout?: string; stderr?: string; exitCode?: number; error?: string };

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function combineOutput(result: CommandResult): string {
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
}

function safeFilenamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

function commandFailureMessage(command: string, error: unknown): string {
  const result = error as CommandResult & { message?: string };
  const exit =
    typeof result.exitCode === "number" ? `exit ${result.exitCode}` : "command failed";
  const output = combineOutput(result);
  const message = typeof result.message === "string" ? result.message : "";
  const detail = [output, message].filter(Boolean).join("\n").trim();
  const shortCmd = command.length > 120 ? `${command.slice(0, 117)}…` : command;
  if (!detail) return `${exit}: ${shortCmd}`;
  const clipped = detail.length > 800 ? `${detail.slice(0, 797)}…` : detail;
  return `${exit} while running \`${shortCmd}\`:\n${clipped}`;
}

async function runChecked(
  sandbox: ProofSandbox,
  command: string,
  options?: {
    cwd?: string;
    timeoutMs?: number;
    envs?: Record<string, string>;
    background?: boolean;
  },
): Promise<CommandResult> {
  try {
    const result = await sandbox.commands.run(command, options);
    if (typeof result.exitCode === "number" && result.exitCode !== 0) {
      throw Object.assign(new Error(`exit status ${result.exitCode}`), result);
    }
    return result;
  } catch (error) {
    throw new Error(commandFailureMessage(command, error));
  }
}

/**
 * Build the in-sandbox Playwright driver for one journey.
 * Popups (target=_blank) are caught via a short post-click settle.
 */
export function playwrightScript(steps: ProofStep[]): string {
  const serialized = JSON.stringify(steps);
  return `
import { chromium } from "${PLAYWRIGHT_MODULE}";

const steps = ${serialized};
const browser = await chromium.launch({
  headless: false,
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-default-apps",
    "--disable-sync",
    "--no-first-run",
    "--window-size=1280,800",
  ],
});
let page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(10000);
page.setDefaultNavigationTimeout(20000);
for (const step of steps) {
  if (step.type === "navigate") {
    await page.goto(step.url, { waitUntil: "domcontentloaded", timeout: 20000 });
  } else if (step.type === "click") {
    let popup = null;
    const onPopup = (p) => { popup = p; };
    page.once("popup", onPopup);
    try {
      await page.click(step.selector);
      await page.waitForTimeout(150);
    } finally {
      page.off("popup", onPopup);
    }
    if (popup) {
      await popup.waitForLoadState("domcontentloaded").catch(() => {});
      await page.close().catch(() => {});
      page = popup;
    }
  } else if (step.type === "fill") {
    await page.fill(step.selector, step.value);
  } else if (step.type === "press") {
    await page.keyboard.press(step.key);
  } else if (step.type === "waitForSelector") {
    await page.waitForSelector(step.selector, { timeout: step.timeoutMs || 10000 });
  } else if (step.type === "waitForText") {
    await page.getByText(step.text).waitFor({ timeout: step.timeoutMs || 10000 });
  } else if (step.type === "waitMs") {
    await page.waitForTimeout(Math.min(step.ms, 3000));
  } else if (step.type === "assertText") {
    await page.getByText(step.text).waitFor({ timeout: 10000 });
  } else if (step.type === "waitForUrl") {
    const timeout = step.timeoutMs || 10000;
    const pattern = step.url.startsWith("^") || step.url.includes(".*")
      ? new RegExp(step.url)
      : step.url;
    await page.waitForURL(pattern, { timeout });
  } else if (step.type === "assertUrl") {
    const current = page.url();
    const ok = step.url.startsWith("^") || step.url.includes(".*")
      ? new RegExp(step.url).test(current)
      : current.includes(step.url);
    if (!ok) throw new Error("Expected URL to match " + JSON.stringify(step.url) + " but got " + JSON.stringify(current));
  }
}
await page.waitForTimeout(300);
await browser.close();
`;
}

async function ensureBaseUrlReady(sandbox: ProofSandbox, baseUrl: string): Promise<void> {
  const timeoutSec = 20;
  try {
    await runChecked(
      sandbox,
      `timeout ${timeoutSec} bash -lc 'until curl -fsS --max-time 1 ${shellQuote(baseUrl)} >/dev/null; do sleep ${READY_POLL_INTERVAL_S}; done'`,
      { timeoutMs: (timeoutSec + 5) * 1000 },
    );
  } catch (error) {
    const base = error instanceof Error ? error.message : String(error);
    throw new Error(
      `baseUrl ${baseUrl} is not reachable inside the sandbox. Start the local server first, then call record_proof.\n${base}`,
    );
  }
}

async function startRecording(
  sandbox: ProofSandbox,
  args: Pick<ProofRecordingRequest, "maxSeconds" | "width" | "height" | "fps">,
): Promise<void> {
  await runChecked(sandbox, `rm -f ${shellQuote(RECORDING_PATH)}`);
  const captureCap = Math.max(args.maxSeconds + 30, Math.ceil(JOURNEY_TIMEOUT_MS / 1000) + 15);
  const command = [
    "ffmpeg",
    "-y",
    "-loglevel",
    "error",
    "-thread_queue_size",
    "512",
    "-video_size",
    `${args.width}x${args.height}`,
    "-framerate",
    String(args.fps),
    "-f",
    "x11grab",
    "-i",
    ":0.0",
    "-t",
    String(captureCap),
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-tune",
    "zerolatency",
    "-crf",
    "28",
    "-threads",
    "0",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    shellQuote(RECORDING_PATH),
  ].join(" ");
  await sandbox.commands.run(`${command} >/tmp/tags-ffmpeg.log 2>&1 & echo $! > /tmp/tags-ffmpeg.pid`);
}

async function stopRecording(sandbox: ProofSandbox): Promise<void> {
  await sandbox.commands.run(
    [
      "if test -f /tmp/tags-ffmpeg.pid; then",
      "  kill -INT $(cat /tmp/tags-ffmpeg.pid) 2>/dev/null || true;",
      "  for i in 1 2 3 4 5 6 7 8; do",
      "    kill -0 $(cat /tmp/tags-ffmpeg.pid) 2>/dev/null || break;",
      "    sleep 0.15;",
      "  done;",
      "  kill -KILL $(cat /tmp/tags-ffmpeg.pid) 2>/dev/null || true;",
      "fi",
    ].join(" "),
  );
}

async function cleanupProofProcesses(sandbox: ProofSandbox): Promise<void> {
  await sandbox.commands
    .run(
      [
        "pkill -f 'node /tmp/tags-proof-playwright' 2>/dev/null || true;",
        "pkill -f chromium 2>/dev/null || true;",
      ].join(" "),
    )
    .catch(() => {});
}

async function readRecording(sandbox: ProofSandbox): Promise<Buffer> {
  const exists = await sandbox.commands.run(
    `test -s ${shellQuote(RECORDING_PATH)} && echo yes || echo no`,
  );
  if (!(exists.stdout ?? "").includes("yes")) {
    const ffmpegLog = await sandbox.commands.run("tail -n 40 /tmp/tags-ffmpeg.log || true");
    const detail = combineOutput(ffmpegLog);
    throw new Error(
      detail
        ? `Proof recording file was not created\n--- ffmpeg log ---\n${detail.slice(0, 800)}`
        : "Proof recording file was not created",
    );
  }

  if (sandbox.files?.read) {
    const bytes = await sandbox.files.read(RECORDING_PATH, { format: "bytes" });
    if (!bytes.byteLength) throw new Error("Proof recording file was empty");
    return Buffer.from(bytes);
  }

  const result = await runChecked(sandbox, `base64 -w0 ${shellQuote(RECORDING_PATH)}`, {
    timeoutMs: 60_000,
  });
  const encoded = (result.stdout ?? "").trim();
  if (!encoded) throw new Error("Proof recording file was not created");
  return Buffer.from(encoded, "base64");
}

async function runJourney(
  sandbox: ProofSandbox,
  journey: ProofJourney,
  index: number,
): Promise<{ ok: boolean; logs: string; error?: string }> {
  const scriptPath = `/tmp/tags-proof-playwright-${index}.mjs`;
  const script = playwrightScript(journey.steps);
  if (sandbox.files?.write) {
    await sandbox.files.write(scriptPath, script);
  } else {
    await runChecked(sandbox, `cat > ${shellQuote(scriptPath)} <<'EOF'\n${script}\nEOF`);
  }

  try {
    const result = await runChecked(sandbox, `node ${shellQuote(scriptPath)}`, {
      timeoutMs: JOURNEY_TIMEOUT_MS,
      envs: {
        DISPLAY: ":0",
        NODE_PATH: "/opt/tags-playwright/node_modules",
        PLAYWRIGHT_BROWSERS_PATH: "/ms-playwright",
      },
    });
    return { ok: true, logs: combineOutput(result) };
  } catch (error) {
    return {
      ok: false,
      logs: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function validateJourneys(journeys: ProofJourney[]): void {
  if (journeys.length === 0) {
    throw new Error("record_proof requires at least one journey");
  }
  for (const journey of journeys) {
    if (!journey.name.trim()) throw new Error("Each journey needs a name");
    if (!journey.steps.length) {
      throw new Error(`Journey "${journey.name}" has no steps`);
    }
  }
}

/**
 * Record proof journeys in an already-running desktop sandbox.
 * Assumes the agent has already started the local server at `baseUrl`.
 * Does not clone, install, or kill the sandbox.
 */
export async function recordProofInSandbox(
  args: ProofRecordingRequest,
): Promise<ProofRecordingResult> {
  validateJourneys(args.journeys);
  const started = Date.now();
  const sandbox = args.sandbox;
  const logs: string[] = [];
  const journeyResults: ProofJourneyResult[] = [];

  await ensureBaseUrlReady(sandbox, args.baseUrl);

  if (typeof sandbox.setTimeout === "function") {
    await sandbox
      .setTimeout(Math.max(args.maxSeconds * 1000 + JOURNEY_TIMEOUT_MS + 90_000, 60_000))
      .catch(() => {});
  }

  await startRecording(sandbox, args);
  try {
    for (let i = 0; i < args.journeys.length; i++) {
      const journey = args.journeys[i]!;
      const result = await runJourney(sandbox, journey, i);
      if (result.logs) logs.push(result.logs);
      journeyResults.push({
        name: journey.name,
        ok: result.ok,
        ...(result.error ? { error: result.error } : {}),
      });
      if (!result.ok) {
        // Keep recording so the failure is visible in the video, then stop.
        break;
      }
    }
  } finally {
    await stopRecording(sandbox);
    await cleanupProofProcesses(sandbox);
  }

  const failed = journeyResults.find((j) => !j.ok);
  if (failed) {
    throw new Error(
      `Proof journey "${failed.name}" failed: ${failed.error ?? "unknown error"}`,
    );
  }

  const video = await readRecording(sandbox);
  const filename = `tags-proof-${safeFilenamePart(args.filenameHint ?? sandbox.sandboxId)}.mp4`;
  return {
    video,
    filename,
    contentType: "video/mp4",
    durationMs: Date.now() - started,
    journeys: journeyResults,
    logs: logs.filter(Boolean).join("\n"),
  };
}

/** Connect to an existing desktop sandbox without killing it afterward. */
export async function connectDesktopSandbox(args: {
  sandboxId: string;
  apiKey?: string;
  timeoutMs?: number;
}): Promise<ProofSandbox> {
  const { Sandbox } = await import("@e2b/desktop");
  return (await Sandbox.connect(args.sandboxId, {
    apiKey: args.apiKey,
    timeoutMs: args.timeoutMs ?? 5 * 60_000,
  })) as ProofSandbox;
}

/** Create a new desktop sandbox (used by sanity scripts / ops). Caller must kill it. */
export async function createDesktopSandbox(args: {
  template: string;
  apiKey?: string;
  timeoutMs?: number;
  width?: number;
  height?: number;
}): Promise<ProofSandbox & { kill: () => Promise<unknown> }> {
  const { Sandbox } = await import("@e2b/desktop");
  return (await Sandbox.create(args.template, {
    apiKey: args.apiKey,
    timeoutMs: args.timeoutMs ?? 5 * 60_000,
    resolution: [args.width ?? 1280, args.height ?? 800],
  })) as unknown as ProofSandbox & { kill: () => Promise<unknown> };
}
