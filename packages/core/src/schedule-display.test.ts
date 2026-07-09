import { describe, expect, it } from "vitest";
import {
  describeScheduleCadence,
  formatScheduleTimezone,
  scheduleTitleFromPrompt,
} from "./schedule-display";

describe("describeScheduleCadence", () => {
  it("describes weekday morning digests", () => {
    expect(describeScheduleCadence("30 9 * * 1-5")).toBe("Weekdays at 9:30 AM");
  });

  it("describes daily and hourly patterns", () => {
    expect(describeScheduleCadence("0 9 * * *")).toBe("Every day at 9:00 AM");
    expect(describeScheduleCadence("0 * * * *")).toBe("Every hour");
    expect(describeScheduleCadence("*/15 * * * *")).toBe("Every 15 minutes");
  });

  it("falls back to the raw cron for uncommon patterns", () => {
    expect(describeScheduleCadence("0 9 1,15 * *")).toBe("0 9 1,15 * *");
  });
});

describe("formatScheduleTimezone", () => {
  it("shortens IANA zones to a city label", () => {
    expect(formatScheduleTimezone("America/New_York")).toBe("New York");
    expect(formatScheduleTimezone("UTC")).toBe("UTC");
  });
});

describe("scheduleTitleFromPrompt", () => {
  it("uses the first sentence and truncates long prompts", () => {
    expect(scheduleTitleFromPrompt("Post a concise morning standup digest in this channel. Cover three sections.")).toBe(
      "Post a concise morning standup digest in this channel",
    );
    expect(
      scheduleTitleFromPrompt(
        "Post a concise morning standup digest in this channel covering open PRs blocked work and yesterday shipping notes for the whole team",
        48,
      ),
    ).toMatch(/…$/);
  });
});
