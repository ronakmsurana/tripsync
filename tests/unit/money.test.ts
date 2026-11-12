import { describe, expect, it } from "vitest";
import { decimalToString, fromMinor, normalizeMoney, percent, signedToMinor, splitEvenly, toMinor } from "@/lib/utils/money";

describe("money", () => {
  it("parses strings and numbers to exact minor units", () => {
    expect(toMinor("12")).toBe(1200);
    expect(toMinor("12.5")).toBe(1250);
    expect(toMinor(12.34)).toBe(1234);
    expect(toMinor("0.07")).toBe(7);
    expect(toMinor(0.3)).toBe(30);
    expect(() => toMinor(0.1 + 0.2)).toThrow(); // 0.30000000000000004: float noise is rejected, never silently rounded
  });
  it("rejects more than 2 decimals, negatives, junk and absurd sizes", () => {
    for (const bad of ["1.005", 1.005, -1, "-1", "abc", "", "1e3", NaN, Infinity, "99999999999"]) {
      expect(() => toMinor(bad as never), String(bad)).toThrow();
    }
  });
  it("formats and normalizes", () => {
    expect(fromMinor(5)).toBe("0.05");
    expect(fromMinor(-1250)).toBe("-12.50");
    expect(normalizeMoney("7")).toBe("7.00");
  });
  it("splits so the shares ALWAYS add up to the exact total", () => {
    for (const [total, n] of [[10000, 3], [1, 3], [10001, 7], [0, 2], [99999999, 13]] as const) {
      const shares = splitEvenly(total, Array.from({ length: n }, (_, i) => i + 1));
      expect(shares.reduce((s, x) => s + x.shareMinor, 0)).toBe(total);
      const values = shares.map((s) => s.shareMinor);
      expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
    }
    expect(() => splitEvenly(100, [])).toThrow();
  });
  it("converts database decimals without float drift", () => {
    expect(decimalToString("1700")).toBe("1700.00");
    expect(decimalToString("12.3")).toBe("12.30");
    expect(decimalToString("-0.5")).toBe("-0.50");
    expect(decimalToString(null)).toBe("0.00");
    expect(decimalToString({ toFixed: (n: number) => (5).toFixed(n) })).toBe("5.00");
    expect(signedToMinor("-12.30")).toBe(-1230);
  });
  it("computes percentages on minor units", () => {
    expect(percent(5351_00, 11500_00)).toBe(46.5);
    expect(percent(1, 0)).toBeNull();
  });
});
