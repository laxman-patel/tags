import { describe, expect, it } from "vitest";
import { sanitizeDemoRecipe, sanitizeDemoShellCommand } from "./demo-recorder";

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

describe("sanitizeDemoRecipe", () => {
  it("sanitizes web install and start commands", () => {
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
      installCommand: "npm install",
      startCommand: "npx next dev --port 3000",
    });
  });
});
