import { describe, expect, it } from "vitest";
import { formatDateOnly, formatLocalDateTime, isValidDateOnly, isValidLocalDateTime, parseDateOnly, parseLocalDateTime } from "@/lib/utils/time";

describe("wall-clock time helpers", () => {
  it("validates real calendar dates", () => {
    expect(isValidDateOnly("2026-02-28")).toBe(true);
    expect(isValidDateOnly("2026-02-30")).toBe(false);
    expect(isValidDateOnly("26-1-1")).toBe(false);
    expect(isValidLocalDateTime("2026-12-21T05:30")).toBe(true);
    expect(isValidLocalDateTime("2026-12-21T25:00")).toBe(false);
    expect(isValidLocalDateTime("2026-12-21 05:30")).toBe(false);
  });
  it("round-trips without any timezone shift", () => {
    expect(formatLocalDateTime(parseLocalDateTime("2026-12-21T05:30"))).toBe("2026-12-21T05:30");
    expect(formatLocalDateTime(parseLocalDateTime("2026-12-21T05:30:45"))).toBe("2026-12-21T05:30");
    expect(formatDateOnly(parseDateOnly("2026-12-20"))).toBe("2026-12-20");
  });
  it("throws on invalid input", () => {
    expect(() => parseDateOnly("nope")).toThrow();
    expect(() => parseLocalDateTime("2026-13-01T00:00")).toThrow();
  });
});
