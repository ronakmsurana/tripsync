import { describe, expect, it } from "vitest";
import { accommodationSchema, createActivitySchema, createTripSchema, expenseSchema, loginSchema, registerSchema, searchSchema, transportSchema } from "@/lib/utils/validation";

describe("auth schemas", () => {
  it("normalizes email and enforces password rules", () => {
    const ok = registerSchema.parse({ name: "  Asha ", email: "  ASHA@Example.COM ", password: "abcdefg1" });
    expect(ok.email).toBe("asha@example.com");
    expect(ok.name).toBe("Asha");
    expect(registerSchema.safeParse({ name: "A", email: "a@b.co", password: "short1" }).success).toBe(false);
    expect(registerSchema.safeParse({ name: "A", email: "a@b.co", password: "onlyletters" }).success).toBe(false);
    expect(registerSchema.safeParse({ name: "A", email: "a@b.co", password: "x1".repeat(40) }).success).toBe(false); // > 72 bytes
    expect(registerSchema.safeParse({ name: "A", email: "not-an-email", password: "abcdefg1" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });
});

describe("trip schema", () => {
  it("rejects end before start and bad currency", () => {
    const base = { tripName: "T", startDate: "2026-12-20", endDate: "2026-12-24" };
    expect(createTripSchema.safeParse(base).success).toBe(true);
    expect(createTripSchema.safeParse({ ...base, endDate: "2026-12-19" }).success).toBe(false);
    expect(createTripSchema.safeParse({ ...base, currency: "RUPEE" }).success).toBe(false);
    expect(createTripSchema.parse({ ...base, currency: "usd" }).currency).toBe("USD");
  });
});

describe("expense schema", () => {
  const e = { amount: 100, expenseDate: "2026-12-21" };
  it("normalizes money to a 2-decimal string", () => {
    expect(expenseSchema.parse({ ...e, amount: 12.5 }).amount).toBe("12.50");
    expect(expenseSchema.parse({ ...e, amount: "7" }).amount).toBe("7.00");
  });
  it("rejects zero, negative, sub-paise amounts and ambiguous splits", () => {
    for (const amount of [0, -5, 1.005, "abc"]) expect(expenseSchema.safeParse({ ...e, amount }).success).toBe(false);
    expect(expenseSchema.safeParse({ ...e, splitWith: [1], splits: [{ userId: 1, shareAmount: 100 }] }).success).toBe(false);
  });
});

describe("booking schemas", () => {
  it("transport: arrival after departure, different endpoints", () => {
    const t = { provider: "KSRTC", departureDestinationId: 1, arrivalDestinationId: 2, departureTime: "2026-12-20T22:00", arrivalTime: "2026-12-21T05:30" };
    expect(transportSchema.safeParse(t).success).toBe(true);
    expect(transportSchema.safeParse({ ...t, arrivalTime: "2026-12-20T21:00" }).success).toBe(false);
    expect(transportSchema.safeParse({ ...t, arrivalDestinationId: 1 }).success).toBe(false);
    expect(transportSchema.safeParse({ ...t, transportType: "teleport" }).success).toBe(false);
  });
  it("accommodation: check-out after check-in", () => {
    const a = { destinationId: 1, name: "Hotel", checkIn: "2026-12-21T06:00", checkOut: "2026-12-23T11:00" };
    expect(accommodationSchema.safeParse(a).success).toBe(true);
    expect(accommodationSchema.safeParse({ ...a, checkOut: "2026-12-21T06:00" }).success).toBe(false);
  });
});

describe("activity + search schemas", () => {
  const a = { title: "Visit", startTime: "2026-12-21T10:00", endTime: "2026-12-21T11:00" };
  it("normalizes tags and defaults", () => {
    const r = createActivitySchema.parse({ ...a, tags: ["  Temple ", "UNESCO"] });
    expect(r.tags).toEqual(["temple", "unesco"]);
    expect(r.slotType).toBe("sightseeing");
    expect(r.force).toBe(false);

    const custom = createActivitySchema.parse({ ...a, slotType: "Scuba Diving" });
    expect(custom.slotType).toBe("Scuba Diving");
  });
  it("rejects bad ranges, coordinates and oversize custom fields", () => {
    expect(createActivitySchema.safeParse({ ...a, endTime: a.startTime }).success).toBe(false);
    expect(createActivitySchema.safeParse({ ...a, location: { coordinates: { lat: 120, lng: 0 } } }).success).toBe(false);
    expect(createActivitySchema.safeParse({ ...a, customFields: { x: "y".repeat(11_000) } }).success).toBe(false);
  });
  it("search limits", () => {
    expect(searchSchema.safeParse({ query: "x", tripId: 1, limit: 50 }).success).toBe(false);
    expect(searchSchema.parse({ query: "x", tripId: 1 }).mode).toBe("auto");
  });
});
