/** BRIEF.md §2/§14.2: display all times in Asia/Kolkata, e.g. "Tue 24 Nov 2026, 13:15:42 IST". */
export function formatIst(value: string | Date | null): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";

  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
  return `${formatted} IST`;
}

/** Minutes since `value`, or null if there's no value to measure. */
export function minutesSince(value: string | Date | null, now: Date = new Date()): number | null {
  if (!value) return null;
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  return (now.getTime() - date.getTime()) / 60_000;
}
