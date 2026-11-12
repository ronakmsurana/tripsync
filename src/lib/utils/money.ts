// ============================================
// Money helpers — exact decimal arithmetic
// ============================================
// Amounts travel as decimal STRINGS ("1234.50") between the API and
// PostgreSQL NUMERIC(12,2). Arithmetic that happens in application code
// (equal splits) is done on integer minor units (paise/cents), never on
// floating point numbers.
// ============================================

export const MAX_MINOR_UNITS = 999_999_999_999; // 9,999,999,999.99 fits NUMERIC(12,2)

const MONEY_RE = /^\d{1,10}(\.\d{1,2})?$/;

/** Parses "12", "12.5", 12.5 -> minor units (1250). Throws on anything ambiguous. */
export function toMinor(value: string | number): number {
  const s = typeof value === "number" ? numberToPlain(value) : value.trim();
  if (!MONEY_RE.test(s)) throw new Error("Amount must be a non-negative number with at most 2 decimals");
  const [whole, frac = ""] = s.split(".");
  const minor = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(minor) || minor > MAX_MINOR_UNITS) throw new Error("Amount is too large");
  return minor;
}

function numberToPlain(n: number): string {
  if (!Number.isFinite(n) || n < 0) throw new Error("Amount must be a non-negative number with at most 2 decimals");
  // toFixed(2) would silently round 1.005 — reject values with more than 2 decimals instead.
  const s = String(n);
  if (/e/i.test(s)) throw new Error("Amount must be a non-negative number with at most 2 decimals");
  return s;
}

/** 1250 -> "12.50" */
export function fromMinor(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function normalizeMoney(value: string | number): string {
  return fromMinor(toMinor(value));
}

/**
 * Splits `totalMinor` across `userIds` as evenly as possible. The remainder
 * (a few paise) is handed out one unit at a time to the first users so the
 * shares ALWAYS add up to the exact total.
 */
export function splitEvenly(totalMinor: number, userIds: number[]): { userId: number; shareMinor: number }[] {
  if (userIds.length === 0) throw new Error("Cannot split between zero people");
  const base = Math.floor(totalMinor / userIds.length);
  let remainder = totalMinor - base * userIds.length;
  return userIds.map((userId) => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return { userId, shareMinor: base + extra };
  });
}

/** Display-only formatting (never used for calculation). */
export function formatMoney(value: string | number, currency = "INR"): string {
  const n = typeof value === "number" ? value : Number(value);
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

/** Converts a NUMERIC value coming from the database (Prisma Decimal | string | number) to "1234.50" exactly. */
export function decimalToString(v: unknown): string {
  if (v === null || v === undefined) return "0.00";
  if (typeof v === "object" && typeof (v as { toFixed?: unknown }).toFixed === "function") {
    return (v as { toFixed(n: number): string }).toFixed(2);
  }
  const s = String(v).trim();
  const neg = s.startsWith("-");
  const body = neg ? s.slice(1) : s;
  const [w, f = ""] = body.split(".");
  return `${neg ? "-" : ""}${w || "0"}.${f.padEnd(2, "0").slice(0, 2)}`;
}

/** Percentage with one decimal, computed on integer minor units. */
export function percent(partMinor: number, wholeMinor: number): number | null {
  return wholeMinor > 0 ? Math.round((partMinor / wholeMinor) * 1000) / 10 : null;
}

/** "1234.50" / "-12.30" -> minor units (signed). */
export function signedToMinor(s: string): number {
  const neg = s.startsWith("-");
  const m = toMinor(neg ? s.slice(1) : s);
  return neg ? -m : m;
}
