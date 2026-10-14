export const TIME_ZONE = "Europe/Oslo";

/** Calendar date in Norway, "YYYY-MM-DD". */
export function osloDate(d: Date): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TIME_ZONE }).format(d);
}

/** Offset of Europe/Oslo at a given instant, e.g. "+02:00". */
export function osloOffset(at: Date): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, timeZoneName: "longOffset" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = /GMT([+-]\d{2}:\d{2})/u.exec(part ?? "");
  return m ? m[1] : "+01:00";
}

/**
 * Parses a timestamp. Strings without an offset (NVE's "2026-10-15T07:00:00") are
 * Norwegian local time.
 */
export function parseOsloTime(s: string | null | undefined): Date | null {
  if (!s) return null;
  const trimmed = s.trim();
  if (/(Z|[+-]\d{2}:?\d{2})$/u.test(trimmed)) {
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const local = trimmed.length === 10 ? `${trimmed}T00:00:00` : trimmed;
  // Resolve the offset at (roughly) that instant to get DST right.
  const guess = new Date(`${local}Z`);
  if (Number.isNaN(guess.getTime())) return null;
  const d = new Date(`${local}${osloOffset(guess)}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Yesterday back to `days` days ago (today is covered by the live fetch). */
export function backfillDays(now: Date, days: number): string[] {
  const out: string[] = [];
  for (let i = 1; i <= days; i++) out.push(osloDate(new Date(now.getTime() - i * 24 * 3600_000)));
  return out;
}

/** "YYYY-MM-DD" → that Norwegian day as [start, end) instants. */
export function osloDayRange(day: string): [Date, Date] {
  const start = parseOsloTime(day)!;
  const next = new Date(start.getTime() + 36 * 3600_000); // safely inside the next day, also across DST
  return [start, parseOsloTime(osloDate(next))!];
}
