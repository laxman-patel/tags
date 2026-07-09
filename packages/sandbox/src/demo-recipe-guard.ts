import type { DemoRecipe, DemoStep } from "./types";

export type DemoRecipeGuardResult =
  | { ok: true }
  | { ok: false; reason: string };

function normalizeTriggerText(text: string): string {
  return text
    .toLowerCase()
    .replace(/<@[^>]+>/g, " ")
    .replace(/@tags/g, " ")
    .replace(/[^\p{L}\p{N}_./-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Trigger asks to see a browser/UI interaction (click, link, landing page, etc.).
 * Terminal PASS scripts are never acceptable for these.
 */
export function triggerRequiresWebDemo(triggerText: string): boolean {
  const n = normalizeTriggerText(triggerText);
  if (!n) return false;

  return [
    /\b(click|clicking|clicked|tap|tapping)\b/,
    /\b(link|links|href|anchor|button|cta|nav)\b/,
    /\b(landing\s*page|home\s*page|homepage|frontend|front[- ]end)\b/,
    /\b(browser|web\s*page|webpage|web\s*ui|ui)\b/,
    /\b(page\.tsx|app\/page|apps\/web)\b/,
    /\b(open|opens|opening)\b.*\b(tab|docs|page|url|link)\b/,
    /\b(land|lands|landing)\b.*\b(on|at)\b/,
    /\b(see|show|watch)\b.*\b(page|docs|url|link|button|ui)\b/,
    /\b(docs?\s*page|documentation|docsUrl)\b/,
    /\b(mcp)\b.*\b(link|links|docs|page)\b/,
    /\b(link|links)\b.*\b(mcp|docs)\b/,
    /\b(new\s+tab|target\s*=?\s*blank)\b/,
    /\b(screenshot|screencast)\b.*\b(page|ui|link|button|browser)\b/,
  ].some((pattern) => pattern.test(n));
}

/**
 * Trigger specifically asks to click something and/or land on a destination URL.
 */
export function triggerRequiresClickThrough(triggerText: string): boolean {
  const n = normalizeTriggerText(triggerText);
  if (!n) return false;

  return [
    /\b(click|clicking|clicked|tap|tapping)\b/,
    /\b(land|lands|landing)\b.*\b(on|at)\b/,
    /\b(open|opens|opening)\b.*\b(tab|docs|page|url|link)\b/,
    /\b(go|goes|going)\s+to\b.*\b(docs|page|url|mcp)\b/,
    /\b(href|target)\b/,
  ].some((pattern) => pattern.test(n));
}

/** Commands that inspect source / print PASS instead of exercising the product. */
export function isTerminalDemoCheat(command: string): boolean {
  const cmd = command.trim();
  if (!cmd) return true;

  const cheatPatterns = [
    /\bverify[-_]fix\b/i,
    /\.tags\/verify/i,
    /\becho\b[\s\S]*\bPASS\b/i,
    /\bconsole\.log\b[\s\S]*\bPASS\b/i,
    /\bprintf\b[\s\S]*\bPASS\b/i,
    /\bprint\s*\([\s\S]*PASS/i,
    // Source-grep "proof" instead of running the app
    /\b(rg|grep|ag|ack)\b[\s\S]*\b(href|surfaces\/mcp|page\.tsx|cli\/login)\b/i,
    /\bnode\s+[^\n]*\.tags\//i,
    /\b(cat|head|sed|awk)\b[\s\S]*\b(page\.tsx|layout\.tsx|\.html)\b/i,
    // Diff / git show as the entire "demo"
    /^\s*(git\s+(diff|show|log)|diff)\b/i,
  ];
  if (cheatPatterns.some((pattern) => pattern.test(cmd))) return true;

  // Single-line node -e that only prints / asserts strings
  if (/^\s*node\s+(-e|--eval)\b/i.test(cmd) && /\bPASS\b|console\.log/i.test(cmd)) {
    return true;
  }

  return false;
}

function stepTypes(steps: DemoStep[]): Set<DemoStep["type"]> {
  return new Set(steps.map((step) => step.type));
}

function hasInteractiveStep(steps: DemoStep[]): boolean {
  return steps.some(
    (step) =>
      step.type === "click" ||
      step.type === "fill" ||
      step.type === "press",
  );
}

function hasUrlProof(steps: DemoStep[]): boolean {
  return steps.some(
    (step) => step.type === "waitForUrl" || step.type === "assertUrl",
  );
}

function hasVisibleProof(steps: DemoStep[]): boolean {
  return steps.some(
    (step) =>
      step.type === "waitForText" ||
      step.type === "assertText" ||
      step.type === "waitForSelector" ||
      step.type === "waitForUrl" ||
      step.type === "assertUrl",
  );
}

function onlyNavigateAndWait(steps: DemoStep[]): boolean {
  return steps.every(
    (step) =>
      step.type === "navigate" ||
      step.type === "waitMs",
  );
}

/**
 * Hard gate before E2B recording. Rejects terminal cheats and web recipes that
 * cannot prove the user-requested interaction (e.g. Maria's MCP link click).
 */
export function validateDemoRecipeForRecording(args: {
  demo: DemoRecipe;
  triggerText: string;
}): DemoRecipeGuardResult {
  const { demo, triggerText } = args;
  const needsWeb = triggerRequiresWebDemo(triggerText);
  const needsClickThrough = triggerRequiresClickThrough(triggerText);

  switch (demo.kind) {
    case "none":
      return {
        ok: false,
        reason: demo.reason.trim()
          ? `Agent could not record a demo: ${demo.reason}`
          : "Agent reported that no demo could be recorded.",
      };
    case "terminal": {
      if (needsWeb) {
        return {
          ok: false,
          reason:
            "This request needs a browser demo (UI/link/page proof). " +
            'The agent wrote demo.kind "terminal" instead. Re-run with demo.kind "web": ' +
            "start the app, navigate, click the real control, then waitForUrl/assertUrl " +
            "(and waitForText) so the recording shows the destination — not a terminal PASS script.",
        };
      }
      if (isTerminalDemoCheat(demo.command)) {
        return {
          ok: false,
          reason:
            `Terminal demo is a source-check/PASS script (\`${demo.command.slice(0, 100)}\`), ` +
            "not visual proof of the product. Use demo.kind \"web\" for UI changes, or a " +
            "terminal command that actually runs the product (e.g. npm test / CLI).",
        };
      }
      return { ok: true };
    }
    case "web": {
      if (!demo.startCommand.trim()) {
        return { ok: false, reason: "Web demo startCommand is empty." };
      }
      if (!demo.readyUrl.trim()) {
        return { ok: false, reason: "Web demo readyUrl is empty." };
      }
      if (demo.steps.length === 0) {
        return { ok: false, reason: "Web demo steps are empty." };
      }
      if (onlyNavigateAndWait(demo.steps)) {
        return {
          ok: false,
          reason:
            "Web demo only navigates (and waits) — that is not proof of the change. " +
            "Add click/fill and waitForUrl/assertUrl or waitForText that exercises the fix.",
        };
      }

      if (needsClickThrough) {
        if (!hasInteractiveStep(demo.steps)) {
          return {
            ok: false,
            reason:
              "This request asks to click/open a control. The web demo has no click/fill/press step. " +
              "Add a real selector click (e.g. a[href*=\"/surfaces/mcp\"]).",
          };
        }
        if (!hasUrlProof(demo.steps) && !hasVisibleProof(demo.steps)) {
          return {
            ok: false,
            reason:
              "This request asks to show the destination after a click. " +
              "Add waitForUrl/assertUrl (preferred for link fixes) or waitForText/assertText on the destination page.",
          };
        }
        // Link/landing proofs should assert URL when the user mentioned landing/docs/url.
        const n = normalizeTriggerText(triggerText);
        const wantsUrl =
          /\b(url|href|docs|mcp|land|lands|landing|tab|page)\b/.test(n);
        if (wantsUrl && !hasUrlProof(demo.steps)) {
          return {
            ok: false,
            reason:
              "This request is about where a link lands. " +
              "Add waitForUrl and/or assertUrl for the destination path (e.g. \"/surfaces/mcp\").",
          };
        }
      } else if (needsWeb) {
        // UI-visible change: must interact or assert something on screen.
        if (!hasInteractiveStep(demo.steps) && !hasVisibleProof(demo.steps)) {
          return {
            ok: false,
            reason:
              "UI demo must include an interaction (click/fill) or a visible assertion " +
              "(waitForText/assertText/waitForUrl/assertUrl), not just navigate.",
          };
        }
      } else {
        // Generic video proof with a web recipe: still require some proof beyond navigate.
        if (!hasInteractiveStep(demo.steps) && !hasVisibleProof(demo.steps)) {
          return {
            ok: false,
            reason:
              "Web demo must prove the change with click/fill or waitForText/assertText/waitForUrl/assertUrl.",
          };
        }
      }

      // Soft structural check: click-through demos should click before URL assert when both exist.
      const types = stepTypes(demo.steps);
      if (types.has("click") && types.has("assertUrl")) {
        const clickIdx = demo.steps.findIndex((s) => s.type === "click");
        const urlIdx = demo.steps.findIndex(
          (s) => s.type === "assertUrl" || s.type === "waitForUrl",
        );
        if (clickIdx >= 0 && urlIdx >= 0 && urlIdx < clickIdx) {
          return {
            ok: false,
            reason:
              "waitForUrl/assertUrl appears before click — put the URL assertion after clicking the link.",
          };
        }
      }

      return { ok: true };
    }
    default: {
      const _exhaustive: never = demo;
      return {
        ok: false,
        reason: `Unsupported demo kind: ${JSON.stringify(_exhaustive)}`,
      };
    }
  }
}
