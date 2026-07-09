import type {
  DemoRecipe,
  DemoRecordingRequest,
  DemoRecordingResult,
  DemoStep,
} from "./types";

const RECORDING_PATH = "/tmp/tags-demo.mp4";
const WORKDIR = "/home/user/demo-repo";

/** Budget for clone + install + ready + capture + pull, beyond maxSeconds. */
const SANDBOX_OVERHEAD_MS = 10 * 60 * 1000;
const CLONE_TIMEOUT_MS = 90_000;
const INSTALL_TIMEOUT_MS = 180_000;
const DEMO_STEP_TIMEOUT_MS = 90_000;
const READY_POLL_INTERVAL_S = "0.15";

type CommandResult = { stdout?: string; stderr?: string; exitCode?: number; error?: string };
type DesktopSandbox = {
  sandboxId: string;
  commands: {
    run: (
      command: string,
      options?: {
        cwd?: string;
        timeoutMs?: number;
        envs?: Record<string, string>;
        background?: boolean;
      },
    ) => Promise<CommandResult>;
  };
  files?: {
    read: (path: string, opts: { format: "bytes" }) => Promise<Uint8Array>;
    write: (path: string, data: string) => Promise<unknown>;
  };
  setTimeout?: (timeoutMs: number) => Promise<void>;
  kill: () => Promise<void>;
};

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function combineOutput(result: CommandResult): string {
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
}

function safeFilenamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

/**
 * Demo recipes are authored inside the coding sandbox (`/home/user/repo`, often
 * with bun). The recorder clones to `/home/user/demo-repo` and only has Node /
 * npm / corepack. Rewrite absolute paths and bun → npm/npx so recipes work.
 */
export function sanitizeDemoShellCommand(command: string): string {
  let next = command.trim();
  if (!next) return next;

  next = next
    .replace(/\/home\/user\/repo(?:\/apps\/web)?/g, ".")
    .replace(/\/home\/user\/demo-repo(?:\/apps\/web)?/g, ".");

  // Drop no-op `cd . &&` / `cd ./foo &&` prefixes that remain after rewrites.
  next = next.replace(/^(?:cd\s+\.(?:\/[^\s;&|]+)?\s*&&\s*)+/g, "");

  next = next
    .replace(/\bbunx\b/g, "npx")
    .replace(/\bbun\s+run\b/g, "npm run")
    .replace(/\bbun\s+install\b/g, "npm install")
    .replace(/\bbun\s+i\b/g, "npm install")
    .replace(/\bbun\b/g, "npm");

  return next.trim();
}

/** Append quiet/fast flags to package-manager install commands. */
export function withFastInstallFlags(command: string): string {
  const trimmed = command.trim();
  if (!trimmed) return trimmed;

  const has = (flag: string) => trimmed.includes(flag);

  if (/\bnpm\s+(ci|install)\b/.test(trimmed)) {
    const extras: string[] = [];
    if (!has("--no-audit")) extras.push("--no-audit");
    if (!has("--no-fund")) extras.push("--no-fund");
    if (!has("--prefer-offline")) extras.push("--prefer-offline");
    return extras.length ? `${trimmed} ${extras.join(" ")}` : trimmed;
  }

  if (/\bpnpm\s+install\b/.test(trimmed)) {
    return has("--prefer-offline") ? trimmed : `${trimmed} --prefer-offline`;
  }

  if (/\byarn\s+install\b/.test(trimmed)) {
    return has("--prefer-offline") ? trimmed : `${trimmed} --prefer-offline`;
  }

  return trimmed;
}

export function sanitizeDemoRecipe(demo: DemoRecipe): DemoRecipe {
  if (demo.kind === "none") return demo;
  if (demo.kind === "terminal") {
    return { ...demo, command: sanitizeDemoShellCommand(demo.command) };
  }
  return {
    ...demo,
    ...(demo.installCommand
      ? {
          installCommand: withFastInstallFlags(
            sanitizeDemoShellCommand(demo.installCommand),
          ),
        }
      : {}),
    startCommand: sanitizeDemoShellCommand(demo.startCommand),
  };
}

function commandFailureMessage(command: string, error: unknown): string {
  const result = error as CommandResult & { message?: string; name?: string };
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
  sandbox: DesktopSandbox,
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

function validateDemo(demo: DemoRecipe): void {
  if (demo.kind === "none") {
    throw new Error(`No recordable demo: ${demo.reason}`);
  }
  if (demo.kind === "terminal") {
    if (!demo.command.trim()) throw new Error("Terminal demo command is empty");
    return;
  }
  if (!demo.startCommand.trim()) throw new Error("Web demo startCommand is empty");
  if (!demo.readyUrl.trim()) throw new Error("Web demo readyUrl is empty");
  if (demo.steps.length === 0) throw new Error("Web demo steps are empty");
}

const PLAYWRIGHT_MODULE = "/opt/tags-playwright/node_modules/playwright";

/**
 * Build the in-sandbox Playwright driver.
 * Popups (target=_blank) are caught via a short post-click settle — never a
 * multi-second waitForEvent timeout that stalls every ordinary click.
 */
export function playwrightScript(steps: DemoStep[]): string {
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
  }
}
await page.waitForTimeout(300);
await browser.close();
`;
}

function sandboxLifetimeMs(maxSeconds: number): number {
  return Math.max(maxSeconds * 1000 + SANDBOX_OVERHEAD_MS, 12 * 60 * 1000);
}

async function bumpSandboxTimeout(
  sandbox: DesktopSandbox,
  remainingMs: number,
): Promise<void> {
  if (typeof sandbox.setTimeout !== "function") return;
  await sandbox.setTimeout(Math.max(remainingMs, 60_000)).catch(() => {});
}

async function createDesktopSandbox(args: DemoRecordingRequest): Promise<DesktopSandbox> {
  const desktopModule = await import("@e2b/desktop");
  const SandboxCtor = (desktopModule as { Sandbox?: unknown; Desktop?: unknown }).Sandbox
    ?? (desktopModule as { Sandbox?: unknown; Desktop?: unknown }).Desktop;
  if (!SandboxCtor || typeof SandboxCtor !== "function") {
    throw new Error("Installed @e2b/desktop package does not expose Sandbox");
  }
  const create = (SandboxCtor as { create?: unknown }).create;
  if (typeof create !== "function") {
    throw new Error("Installed @e2b/desktop Sandbox does not expose create()");
  }
  return (await create.call(SandboxCtor, args.template, {
    apiKey: args.apiKey,
    timeoutMs: sandboxLifetimeMs(args.maxSeconds),
    resolution: [args.width, args.height],
  })) as DesktopSandbox;
}

async function setupRepo(sandbox: DesktopSandbox, args: DemoRecordingRequest): Promise<string> {
  await runChecked(sandbox, `rm -rf ${shellQuote(WORKDIR)}`);
  const branch = args.branch ? ` --branch ${shellQuote(args.branch)}` : "";
  // Shallow clone first; optionally pin to the exact PR head after.
  await runChecked(
    sandbox,
    `git clone --depth 1 --single-branch --no-tags${branch} ${shellQuote(args.repoUrl)} ${shellQuote(WORKDIR)}`,
    { timeoutMs: CLONE_TIMEOUT_MS },
  );

  if (args.commitSha?.trim()) {
    const sha = args.commitSha.trim();
    // Depth-1 may not contain the SHA if the tip moved; deepen once then checkout.
    await runChecked(
      sandbox,
      [
        `cd ${shellQuote(WORKDIR)} &&`,
        `(git cat-file -e ${shellQuote(sha)}^{commit} 2>/dev/null || git fetch --depth 50 origin ${shellQuote(sha)}) &&`,
        `git checkout --force ${shellQuote(sha)}`,
      ].join(" "),
      { timeoutMs: 60_000 },
    );
  }

  const subdir = args.demo.kind !== "none" ? args.demo.repoSubdir : undefined;
  return subdir ? `${WORKDIR}/${subdir.replace(/^\/+/, "")}` : WORKDIR;
}

async function inferInstallCommand(sandbox: DesktopSandbox, cwd: string): Promise<string | null> {
  // One round-trip instead of sequential test -f calls.
  const result = await sandbox.commands.run(
    [
      "if test -f pnpm-lock.yaml; then echo pnpm",
      "elif test -f bun.lockb || test -f bun.lock; then echo npm",
      "elif test -f package-lock.json; then echo npmci",
      "elif test -f yarn.lock; then echo yarn",
      "elif test -f package.json; then echo npm",
      "else echo none; fi",
    ].join("; "),
    { cwd },
  );
  const kind = (result.stdout ?? "").trim();
  switch (kind) {
    case "pnpm":
      return withFastInstallFlags(
        "corepack enable && pnpm install --frozen-lockfile",
      );
    case "npmci":
      return withFastInstallFlags("npm ci");
    case "yarn":
      return withFastInstallFlags(
        "corepack enable && yarn install --frozen-lockfile",
      );
    case "npm":
      return withFastInstallFlags("npm install");
    case "none":
      return null;
    default:
      return null;
  }
}

async function startRecording(sandbox: DesktopSandbox, args: DemoRecordingRequest): Promise<void> {
  await runChecked(sandbox, `rm -f ${shellQuote(RECORDING_PATH)}`);
  // Cap capture slightly above maxSeconds as a safety net; stopRecording is the
  // primary end signal so demos aren't truncated mid-step by a tight -t.
  const captureCap = Math.max(args.maxSeconds + 30, Math.ceil(DEMO_STEP_TIMEOUT_MS / 1000) + 15);
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
  // Background ffmpeg — don't treat the shell wrapper as a long-running checked command.
  await sandbox.commands.run(`${command} >/tmp/tags-ffmpeg.log 2>&1 & echo $! > /tmp/tags-ffmpeg.pid`);
}

async function stopRecording(sandbox: DesktopSandbox): Promise<void> {
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

async function cleanupDemoProcesses(sandbox: DesktopSandbox): Promise<void> {
  await sandbox.commands.run(
    [
      "if test -f /tmp/tags-demo-app.pid; then",
      "  kill $(cat /tmp/tags-demo-app.pid) 2>/dev/null || true;",
      "  sleep 0.2;",
      "  kill -KILL $(cat /tmp/tags-demo-app.pid) 2>/dev/null || true;",
      "fi;",
      "pkill -f 'node /tmp/tags-demo-playwright' 2>/dev/null || true;",
      "pkill -f chromium 2>/dev/null || true;",
    ].join(" "),
  ).catch(() => {});
}

async function readRecording(sandbox: DesktopSandbox): Promise<Buffer> {
  const exists = await sandbox.commands.run(
    `test -s ${shellQuote(RECORDING_PATH)} && echo yes || echo no`,
  );
  if (!(exists.stdout ?? "").includes("yes")) {
    const ffmpegLog = await sandbox.commands.run("tail -n 40 /tmp/tags-ffmpeg.log || true");
    const detail = combineOutput(ffmpegLog);
    throw new Error(
      detail
        ? `Demo recording file was not created\n--- ffmpeg log ---\n${detail.slice(0, 800)}`
        : "Demo recording file was not created",
    );
  }

  if (sandbox.files?.read) {
    const bytes = await sandbox.files.read(RECORDING_PATH, { format: "bytes" });
    if (!bytes.byteLength) throw new Error("Demo recording file was empty");
    return Buffer.from(bytes);
  }

  // Fallback when files API is unavailable (tests / older SDKs).
  const result = await runChecked(
    sandbox,
    `base64 -w0 ${shellQuote(RECORDING_PATH)}`,
    { timeoutMs: 60_000 },
  );
  const encoded = (result.stdout ?? "").trim();
  if (!encoded) throw new Error("Demo recording file was not created");
  return Buffer.from(encoded, "base64");
}

async function prepareWebDemo(
  sandbox: DesktopSandbox,
  cwd: string,
  demo: Extract<DemoRecipe, { kind: "web" }>,
): Promise<string[]> {
  const logs: string[] = [];
  const skipInstall = demo.skipInstall === true;
  const installCommand = skipInstall
    ? null
    : demo.installCommand ?? (await inferInstallCommand(sandbox, cwd));
  if (installCommand) {
    await bumpSandboxTimeout(sandbox, INSTALL_TIMEOUT_MS + DEMO_STEP_TIMEOUT_MS + 120_000);
    logs.push(
      combineOutput(
        await runChecked(sandbox, installCommand, {
          cwd,
          timeoutMs: INSTALL_TIMEOUT_MS,
        }),
      ),
    );
  }
  await sandbox.commands.run(
    `${demo.startCommand} >/tmp/tags-demo-app.log 2>&1 & echo $! > /tmp/tags-demo-app.pid`,
    { cwd },
  );
  const timeoutMs = demo.readyTimeoutMs ?? 45_000;
  try {
    const ready = await runChecked(
      sandbox,
      `timeout ${Math.ceil(timeoutMs / 1000)} bash -lc 'until curl -fsS --max-time 1 ${shellQuote(demo.readyUrl)} >/dev/null; do sleep ${READY_POLL_INTERVAL_S}; done'`,
      { timeoutMs: timeoutMs + 5_000 },
    );
    logs.push(combineOutput(ready));
  } catch (error) {
    const appLog = await sandbox.commands.run("tail -n 80 /tmp/tags-demo-app.log || true", { cwd });
    const appOut = combineOutput(appLog);
    const base = error instanceof Error ? error.message : String(error);
    throw new Error(
      appOut
        ? `${base}\n--- app log ---\n${appOut.slice(0, 1200)}`
        : base,
    );
  }
  return logs;
}

async function runWebDemoSteps(
  sandbox: DesktopSandbox,
  cwd: string,
  demo: Extract<DemoRecipe, { kind: "web" }>,
): Promise<string> {
  const script = playwrightScript(demo.steps);
  if (sandbox.files?.write) {
    await sandbox.files.write("/tmp/tags-demo-playwright.mjs", script);
  } else {
    await runChecked(sandbox, `cat > /tmp/tags-demo-playwright.mjs <<'EOF'\n${script}\nEOF`);
  }
  return combineOutput(
    await runChecked(sandbox, "node /tmp/tags-demo-playwright.mjs", {
      cwd,
      timeoutMs: DEMO_STEP_TIMEOUT_MS,
      envs: {
        DISPLAY: ":0",
        NODE_PATH: "/opt/tags-playwright/node_modules",
        PLAYWRIGHT_BROWSERS_PATH: "/ms-playwright",
      },
    }),
  );
}

async function runTerminalDemo(
  sandbox: DesktopSandbox,
  cwd: string,
  demo: Extract<DemoRecipe, { kind: "terminal" }>,
): Promise<string> {
  const result = await runChecked(
    sandbox,
    `xterm -geometry 140x40 -e bash -lc ${shellQuote(`${demo.command}; sleep 0.6`)}`,
    { cwd, timeoutMs: DEMO_STEP_TIMEOUT_MS, envs: { DISPLAY: ":0" } },
  );
  return combineOutput(result);
}

export async function recordDemo(args: DemoRecordingRequest): Promise<DemoRecordingResult> {
  const demo = sanitizeDemoRecipe(args.demo);
  validateDemo(demo);
  if (demo.kind === "none") {
    throw new Error(`No recordable demo: ${demo.reason}`);
  }
  const started = Date.now();
  const sandbox = await createDesktopSandbox({ ...args, demo });
  let logs = "";
  try {
    const cwd = await setupRepo(sandbox, { ...args, demo });
    const prepLogs: string[] = [];

    if (demo.kind === "web") {
      prepLogs.push(...(await prepareWebDemo(sandbox, cwd, demo)));
    }

    // Keep enough lifetime for capture + video pull after prep.
    await bumpSandboxTimeout(
      sandbox,
      args.maxSeconds * 1000 + DEMO_STEP_TIMEOUT_MS + 90_000,
    );

    // Start ffmpeg only after clone/install/app-ready so capture covers the demo.
    await startRecording(sandbox, args);
    try {
      switch (demo.kind) {
        case "web": {
          const stepLogs = await runWebDemoSteps(sandbox, cwd, demo);
          logs = [...prepLogs, stepLogs].filter(Boolean).join("\n");
          break;
        }
        case "terminal": {
          logs = await runTerminalDemo(sandbox, cwd, demo);
          break;
        }
        default: {
          const _exhaustive: never = demo;
          throw new Error(`Unsupported demo kind: ${JSON.stringify(_exhaustive)}`);
        }
      }
    } finally {
      await stopRecording(sandbox);
      await cleanupDemoProcesses(sandbox);
    }
    const video = await readRecording(sandbox);
    const filename = `tags-demo-${safeFilenamePart(args.branch ?? sandbox.sandboxId)}.mp4`;
    return {
      video,
      filename,
      contentType: "video/mp4",
      durationMs: Date.now() - started,
      logs,
    };
  } finally {
    await sandbox.kill().catch(() => {});
  }
}
