const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function formatCronClock(hour: string, minute: string): string | null {
  if (!/^\d+$/.test(hour) || !/^\d+$/.test(minute)) return null;
  const h = Number(hour);
  const m = Number(minute);
  if (h > 23 || m > 59) return null;
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour12}:00 ${period}` : `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

function describeWeekdays(field: string): string | null {
  if (field === "*") return "Every day";
  if (field === "1-5") return "Weekdays";
  if (field === "0,6" || field === "6,0") return "Weekends";
  if (/^\d$/.test(field)) {
    const label = WEEKDAY_LABELS[Number(field)];
    return label ? `${label}s` : null;
  }
  if (/^\d(,\d)+$/.test(field)) {
    const labels = field
      .split(",")
      .map((part) => WEEKDAY_LABELS[Number(part)])
      .filter(Boolean);
    if (labels.length === 0) return null;
    if (labels.length === 1) return `${labels[0]}s`;
    if (labels.length === 2) return `${labels[0]} & ${labels[1]}`;
    return `${labels.slice(0, -1).join(", ")}, & ${labels.at(-1)}`;
  }
  return null;
}

/** Short city/region label for common IANA timezones. */
export function formatScheduleTimezone(timezone: string): string {
  const trimmed = timezone.trim();
  if (!trimmed) return "UTC";
  if (trimmed === "UTC" || trimmed === "Etc/UTC") return "UTC";
  const city = trimmed.includes("/") ? trimmed.slice(trimmed.lastIndexOf("/") + 1) : trimmed;
  return city.replaceAll("_", " ");
}

/**
 * Turn a 5-field cron into a short human phrase.
 * Falls back to the raw expression when the pattern is uncommon.
 */
export function describeScheduleCadence(cron: string): string {
  const trimmed = cron.trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length !== 5) return trimmed || "Custom schedule";

  const minute = parts[0]!;
  const hour = parts[1]!;
  const dayOfMonth = parts[2]!;
  const month = parts[3]!;
  const dayOfWeek = parts[4]!;

  if (month !== "*") return trimmed;

  if (minute.startsWith("*/") && hour === "*" && dayOfMonth === "*" && dayOfWeek === "*") {
    const every = Number(minute.slice(2));
    if (Number.isFinite(every) && every > 0) {
      return every === 1 ? "Every minute" : `Every ${every} minutes`;
    }
  }

  if (minute === "0" && hour.startsWith("*/") && dayOfMonth === "*" && dayOfWeek === "*") {
    const every = Number(hour.slice(2));
    if (Number.isFinite(every) && every > 0) {
      return every === 1 ? "Every hour" : `Every ${every} hours`;
    }
  }

  if (minute === "0" && hour === "*" && dayOfMonth === "*" && dayOfWeek === "*") {
    return "Every hour";
  }

  const clock = formatCronClock(hour, minute);
  if (!clock) return trimmed;

  if (dayOfMonth === "*" && dayOfWeek === "*") {
    return `Every day at ${clock}`;
  }

  if (dayOfMonth === "*" && dayOfWeek !== "*") {
    const days = describeWeekdays(dayOfWeek);
    if (days) return `${days} at ${clock}`;
  }

  if (dayOfMonth !== "*" && dayOfWeek === "*" && /^\d+$/.test(dayOfMonth)) {
    const day = Number(dayOfMonth);
    if (day >= 1 && day <= 31) {
      const suffix =
        day % 10 === 1 && day !== 11
          ? "st"
          : day % 10 === 2 && day !== 12
            ? "nd"
            : day % 10 === 3 && day !== 13
              ? "rd"
              : "th";
      return `Monthly on the ${day}${suffix} at ${clock}`;
    }
  }

  return trimmed;
}

/** One-line title from a schedule prompt. */
export function scheduleTitleFromPrompt(prompt: string, maxLength = 72): string {
  const cleaned = prompt.replace(/\s+/g, " ").trim();
  if (!cleaned) return "Untitled schedule";
  const sentence = cleaned.split(/(?<=[.!?])\s+/)[0] ?? cleaned;
  if (sentence.length <= maxLength) return sentence.replace(/[.!?]$/, "");
  const clipped = sentence.slice(0, maxLength - 1).trimEnd();
  const lastSpace = clipped.lastIndexOf(" ");
  const base = lastSpace > 40 ? clipped.slice(0, lastSpace) : clipped;
  return `${base}…`;
}
