// Display formatting only — never used for calculations.
// Dates/times are wall-clock strings ("YYYY-MM-DD" / "YYYY-MM-DDTHH:mm") and are rendered in UTC
// so no viewer-timezone shift can ever change what the schedule says.

const parse = (s: string) => new Date(s.length === 10 ? `${s}T00:00:00Z` : `${s.slice(0, 16)}:00Z`);

/** Converts ISO "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm" to "DD/MM/YYYY" */
export function fmtDateDDMMYYYY(s: string): string {
  if (!s || s.length < 10) return s || "";
  const y = s.slice(0, 4);
  const m = s.slice(5, 7);
  const d = s.slice(8, 10);
  return `${d}/${m}/${y}`;
}

/** Converts "DD/MM/YYYY" or "DD-MM-YYYY" to ISO "YYYY-MM-DD", or null if invalid */
export function parseDDMMYYYY(s: string): string | null {
  if (!s) return null;
  const match = /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/.exec(s.trim());
  if (!match) return null;
  const d = Number(match[1]);
  const mo = Number(match[2]);
  const y = Number(match[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function fmtDate(s: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...opts }).format(parse(s.slice(0, 10)));
}
export function fmtTime(s: string) {
  if (!s) return "";
  const timeStr = s.length >= 16 ? s.slice(11, 16) : s.slice(0, 5);
  const parts = timeStr.split(":");
  if (parts.length < 2) return s;
  let h = parseInt(parts[0], 10);
  const m = parts[1].slice(0, 2).padStart(2, "0");
  if (isNaN(h)) return s;
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}
export function fmtDateTime(s: string) {
  return `${fmtDate(s)}, ${fmtTime(s)}`;
}
export function fmtDateTimeDDMMYYYY(s: string) {
  return `${fmtDateDDMMYYYY(s)} ${fmtTime(s)}`;
}
export function dayKey(s: string) {
  return s.slice(0, 10);
}

const SYMBOL: Record<string, string> = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };
export function money(value: string | number, currency = "INR", signed = false) {
  const n = Number(value);
  const sym = SYMBOL[currency] ?? `${currency} `;
  const body = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Math.abs(n));
  return `${n < 0 ? "-" : signed && n > 0 ? "+" : ""}${sym}${body}`;
}

/** Whole days between two YYYY-MM-DD strings, inclusive. */
export function daysInclusive(a: string, b: string) {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000) + 1;
}

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
