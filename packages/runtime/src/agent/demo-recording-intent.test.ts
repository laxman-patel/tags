import { describe, expect, it } from "vitest";
import { wantsDemoRecording } from "./demo-recording-intent";

describe("wantsDemoRecording", () => {
  it("detects explicit video / proof requests", () => {
    expect(wantsDemoRecording("@tags fix the login bug and send a video proof")).toBe(true);
    expect(wantsDemoRecording("<@U123> record a demo of the change")).toBe(true);
    expect(wantsDemoRecording("@tags screencast of the fix please")).toBe(true);
    expect(wantsDemoRecording("@tags show me it working")).toBe(true);
    expect(wantsDemoRecording("@tags attach a video demo after the PR")).toBe(true);
    expect(wantsDemoRecording("@tags visual proof that the button works")).toBe(true);
    expect(wantsDemoRecording("@tags record yourself using the new flow")).toBe(true);
  });

  it("does not treat ordinary coding requests as recording intent", () => {
    expect(wantsDemoRecording("@tags fix the login bug")).toBe(false);
    expect(wantsDemoRecording("@tags demo the API in text")).toBe(false);
    expect(wantsDemoRecording("@tags open a PR for the refactor")).toBe(false);
    expect(wantsDemoRecording("@tags what tools do you have access to?")).toBe(false);
    expect(wantsDemoRecording("@tags write a proof of concept for caching")).toBe(false);
  });
});
