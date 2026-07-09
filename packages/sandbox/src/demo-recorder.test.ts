import { describe, expect, it } from "vitest";
import {
  playwrightScript,
  sanitizeDemoRecipe,
  sanitizeDemoShellCommand,
  withFastInstallFlags,
} from "./demo-recorder";

describe("sanitizeDemoShellCommand", () => {
  it("rewrites coding-sandbox paths and bun to npm/npx", () => {
    expect(
      sanitizeDemoShellCommand("cd /home/user/repo && bun install"),
    ).toBe("npm install");
    expect(
      sanitizeDemoShellCommand(
        "cd /home/user/repo/apps/web && bunx next dev --port 3000",
      ),
    ).toBe("npx next dev --port 3000");
  });

  it("leaves npm/pnpm commands alone aside from path rewrites", () => {
    expect(sanitizeDemoShellCommand("pnpm install --frozen-lockfile")).toBe(
      "pnpm install --frozen-lockfile",
    );
    expect(
      sanitizeDemoShellCommand("cd /home/user/demo-repo/apps/web && npm run dev"),
    ).toBe("npm run dev");
  });
});

describe("withFastInstallFlags", () => {
  it("adds quiet/offline flags to npm and pnpm installs", () => {
    expect(withFastInstallFlags("npm ci")).toBe(
      "npm ci --no-audit --no-fund --prefer-offline",
    );
    expect(withFastInstallFlags("npm install")).toBe(
      "npm install --no-audit --no-fund --prefer-offline",
    );
    expect(withFastInstallFlags("pnpm install --frozen-lockfile")).toBe(
      "pnpm install --frozen-lockfile --prefer-offline",
    );
  });

  it("is idempotent when flags already present", () => {
    const cmd = "npm ci --no-audit --no-fund --prefer-offline";
    expect(withFastInstallFlags(cmd)).toBe(cmd);
  });
});

describe("sanitizeDemoRecipe", () => {
  it("sanitizes web install and start commands and adds fast install flags", () => {
    const demo = sanitizeDemoRecipe({
      kind: "web",
      repoSubdir: "apps/web",
      installCommand: "cd /home/user/repo && bun install",
      startCommand: "cd /home/user/repo/apps/web && bunx next dev --port 3000",
      readyUrl: "http://127.0.0.1:3000",
      steps: [{ type: "navigate", url: "http://127.0.0.1:3000" }],
    });
    expect(demo).toMatchObject({
      kind: "web",
      installCommand: "npm install --no-audit --no-fund --prefer-offline",
      startCommand: "npx next dev --port 3000",
    });
  });
});

describe("playwrightScript", () => {
  it("uses domcontentloaded and non-blocking popup capture", () => {
    const script = playwrightScript([
      { type: "navigate", url: "http://127.0.0.1:3000" },
      { type: "click", selector: "button" },
    ]);
    expect(script).toContain('waitUntil: "domcontentloaded"');
    expect(script).not.toContain("networkidle");
    expect(script).toContain('page.once("popup"');
    expect(script).not.toContain('waitForEvent("popup"');
    expect(script).toContain("waitForTimeout(150)");
    expect(script).toContain("Math.min(step.ms, 3000)");
    expect(script).toContain("--disable-gpu");
  });
});
