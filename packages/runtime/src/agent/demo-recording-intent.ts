function normalizeTriggerText(text: string): string {
  return text
    .toLowerCase()
    .replace(/<@[^>]+>/g, " ")
    .replace(/@tags/g, " ")
    .replace(/[^\p{L}\p{N}_?]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True when the Slack @tags message asks for a video / screencast / visual proof
 * of the change. Scoped to the triggering message only.
 */
export function wantsDemoRecording(text: string): boolean {
  const normalized = normalizeTriggerText(text);
  if (!normalized) return false;

  return [
    /\b(video|screencast|screen\s*recording)\b/,
    /\b(record|recording)\b.*\b(demo|video|screen|yourself|proof)\b/,
    /\b(demo|video)\b.*\b(record|recording|screencast)\b/,
    /\b(demo\s+video|video\s+demo)\b/,
    /\b(send|share|post|attach|upload)\b.*\b(a\s+)?(video|recording|screencast)\b/,
    /\b(visual\s+proof|video\s+proof|as\s+proof|proof\s+that)\b/,
    /\bshow\s+me\s+(it\s+)?working\b/,
    /\brecord\s+yourself\b/,
  ].some((pattern) => pattern.test(normalized));
}
