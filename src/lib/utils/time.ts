// ============================================
// Time helpers — wall-clock policy
// ============================================
// Itinerary times are WALL-CLOCK times at the trip's location. They are
// stored in PostgreSQL as `timestamp` (no zone) and exchanged with the browser
// as "YYYY-MM-DDTHH:mm". No timezone conversion is ever applied, so
// "06:00 check-in" is 06:00 for everybody, regardless of the viewer's zone.
// Internally a Date is only used as a carrier: its UTC fields hold the
// wall-clock values.
// ============================================

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

export function isValidDateOnly(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function isValidLocalDateTime(s: string): boolean {
  const m = DATETIME_RE.exec(s);
  if (!m) return false;
  const [y, mo, d, h, mi, se] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? "0"].map(Number);
  if (h > 23 || mi > 59 || se > 59) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d, h, mi, se));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** "2026-12-21" -> Date at 00:00 UTC (carrier for a DATE column). */
export function parseDateOnly(s: string): Date {
  if (!isValidDateOnly(s)) throw new Error(`Invalid date: ${s}`);
  return new Date(`${s}T00:00:00.000Z`);
}

/** "2026-12-21T06:30" -> carrier Date holding that wall-clock time. */
export function parseLocalDateTime(s: string): Date {
  if (!isValidLocalDateTime(s)) throw new Error(`Invalid date-time: ${s}`);
  const withSeconds = s.length === 16 ? `${s}:00` : s;
  return new Date(`${withSeconds}.000Z`);
}

export function formatDateOnly(d: Date | string): string {
  return (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10);
}

export function formatLocalDateTime(d: Date | string): string {
  return (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 16);
}

export const MINUTE_MS = 60_000;

/** Inclusive start / exclusive end window of a trip as wall-clock Dates. */
export function tripWindow(startDate: Date, endDate: Date): { start: Date; end: Date } {
  return { start: new Date(startDate.getTime()), end: new Date(endDate.getTime() + 24 * 60 * MINUTE_MS) };
}
