import { describe, expect, it } from "vitest";
import { formatMarkdownForSlack } from "./markdown";

describe("formatMarkdownForSlack", () => {
  it("converts common Markdown emphasis to Slack mrkdwn", () => {
    expect(formatMarkdownForSlack("**GitHub CI failure** — same `verify` job")).toBe(
      "*GitHub CI failure* — same `verify` job",
    );
  });

  it("converts Markdown links to Slack links", () => {
    expect(formatMarkdownForSlack("Review [activity](https://myaccount.google.com).")).toBe(
      "Review <https://myaccount.google.com|activity>.",
    );
  });

  it("leaves inline code and fenced code blocks untouched", () => {
    const text = [
      "`**not bold**`",
      "```",
      "**not bold**",
      "```",
      "**bold**",
    ].join("\n");

    expect(formatMarkdownForSlack(text)).toBe([
      "`**not bold**`",
      "```",
      "**not bold**",
      "```",
      "*bold*",
    ].join("\n"));
  });
});
