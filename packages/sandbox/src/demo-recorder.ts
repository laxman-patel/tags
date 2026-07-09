import type {
  DemoRecipe,
  DemoRecordingRequest,
  DemoRecordingResult,
  DemoStep,
} from "./types";

const RECORDING_PATH = "/tmp/tags-demo.mp4";
const WORKDIR = "/home/user/demo-repo";

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

export function sanitizeDemoRecipe(demo: DemoRecipe): DemoRecipe {
  if (demo.kind === "none") return demo;
  if (demo.kind === "terminal") {
    return { ...demo, command: sanitizeDemoShellCommand(demo.command) };
  }
  return {
    ...demo,
    ...(demo.installCommand
      ? { installCommand: sanitizeDemoShellCommand(demo.installCommand) }
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

function playwrightScript(steps: DemoStep[]): string {
  const serialized = JSON.stringify(steps);
  return `
import { chromium } from "${PLAYWRIGHT_MODULE}";

const steps = ${serialized};
const browser = await chromium.launch({
  headless: false,
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--window-size=1280,800"],
});
let page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
for (const step of steps) {
  if (step.type === "navigate") await page.goto(step.url, { waitUntil: "networkidle" });
  else if (step.type === "click") {
    const popupPromise = page.waitForEvent("popup", { timeout: 5000 }).catch(() => null);
    await page.click(step.selector);
    const popup = await popupPromise;
    if (popup) {
      await popup.waitForLoadState("domcontentloaded").catch(() => {});
      await page.close().catch(() => {});
      page = popup;
    }
  }
  else if (step.type === "fill") await page.fill(step.selector, step.value);
  else if (step.type === "press") await page.keyboard.press(step.key);
  else if (step.type === "waitForSelector") await page.waitForSelector(step.selector, { timeout: step.timeoutMs || 10000 });
  else if (step.type === "waitForText") await page.getByText(step.text).waitFor({ timeout: step.timeoutMs || 10000 });
  else if (step.type === "waitMs") await page.waitForTimeout(step.ms);
  else if (step.type === "assertText") await page.getByText(step.text).waitFor({ timeout: 10000 });
}
await page.waitForTimeout(1500);
await browser.close();
`;
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
    timeoutMs: Math.max(args.maxSeconds + 120, 180) * 1000,
    resolution: [args.width, args.height],
  })) as DesktopSandbox;
}

async function setupRepo(sandbox: DesktopSandbox, args: DemoRecordingRequest): Promise<string> {
  await runChecked(sandbox, `rm -rf ${shellQuote(WORKDIR)}`);
  const branch = args.branch ? ` --branch ${shellQuote(args.branch)}` : "";
  await runChecked(
    sandbox,
    `git clone --depth 1${branch} ${shellQuote(args.repoUrl)} ${shellQuote(WORKDIR)}`,
    { timeoutMs: 120_000 },
  );

  const subdir = args.demo.kind !== "none" ? args.demo.repoSubdir : undefined;
  return subdir ? `${WORKDIR}/${subdir.replace(/^\/+/, "")}` : WORKDIR;
}

async function inferInstallCommand(sandbox: DesktopSandbox, cwd: string): Promise<string | null> {
  const checks = [
    { file: "pnpm-lock.yaml", command: "corepack enable && pnpm install --frozen-lockfile" },
    { file: "bun.lockb", command: "npm install" },
    { file: "bun.lock", command: "npm install" },
    { file: "package-lock.json", command: "npm ci" },
    { file: "yarn.lock", command: "corepack enable && yarn install --frozen-lockfile" },
    { file: "package.json", command: "npm install" },
  ];
  for (const check of checks) {
    const result = await sandbox.commands.run(`test -f ${shellQuote(check.file)} && echo yes || true`, {
      cwd,
    });
    if ((result.stdout ?? "").includes("yes")) return check.command;
  }
  return null;
}

async function startRecording(sandbox: DesktopSandbox, args: DemoRecordingRequest): Promise<void> {
  await runChecked(sandbox, `rm -f ${shellQuote(RECORDING_PATH)}`);
  const command = [
    "ffmpeg",
    "-y",
    "-video_size",
    `${args.width}x${args.height}`,
    "-framerate",
    String(args.fps),
    "-f",
    "x11grab",
    "-i",
    ":0.0",
    "-t",
    String(args.maxSeconds),
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
    "if test -f /tmp/tags-ffmpeg.pid; then kill -INT $(cat /tmp/tags-ffmpeg.pid) 2>/dev/null || true; fi; sleep 2",
  );
}

async function readRecording(sandbox: DesktopSandbox): Promise<Buffer> {
  const result = await runChecked(
    sandbox,
    `test -s ${shellQuote(RECORDING_PATH)} && base64 -w0 ${shellQuote(RECORDING_PATH)}`,
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
  const installCommand = demo.installCommand ?? (await inferInstallCommand(sandbox, cwd));
  if (installCommand) {
    logs.push(
      combineOutput(await runChecked(sandbox, installCommand, { cwd, timeoutMs: 180_000 })),
    );
  }
  await sandbox.commands.run(
    `${demo.startCommand} >/tmp/tags-demo-app.log 2>&1 & echo $! > /tmp/tags-demo-app.pid`,
    { cwd },
  );
  const timeoutMs = demo.readyTimeoutMs ?? 60_000;
  try {
    const ready = await runChecked(
      sandbox,
      `timeout ${Math.ceil(timeoutMs / 1000)} bash -lc 'until curl -fsS ${shellQuote(demo.readyUrl)} >/dev/null; do sleep 1; done'`,
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
  await runChecked(sandbox, `cat > /tmp/tags-demo-playwright.mjs <<'EOF'\n${script}\nEOF`);
  return combineOutput(
    await runChecked(sandbox, "node /tmp/tags-demo-playwright.mjs", {
      cwd,
      timeoutMs: 120_000,
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
    `xterm -geometry 140x40 -e bash -lc ${shellQuote(`${demo.command}; sleep 2`)}`,
    { cwd, timeoutMs: 120_000, envs: { DISPLAY: ":0" } },
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

    // Start ffmpeg only after clone/install/app-ready so maxSeconds covers the demo.
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
