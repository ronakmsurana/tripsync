import { beforeEach, describe, expect, it } from "vitest";
import { ZodError, z } from "zod";
import { ApiError, toApiError } from "@/lib/api/errors";
import { _clearAllRateLimits, rateLimit } from "@/lib/security/rateLimit";
import { toOrTsQuery } from "@/lib/services/searchIndexService";
import { buildSearchContent } from "@/lib/services/searchIndexService";
import { toVectorLiteral } from "@/lib/services/embeddingService";

describe("error translation", () => {
  it("maps database trigger rules to friendly statuses without leaking SQL", () => {
    const e = toApiError(new Error('ERROR: TS_OUTSIDE_TRIP_WINDOW: itinerary_slots is outside the trip dates (2026-12-20 to 2026-12-24)'));
    expect(e.status).toBe(422);
    expect(e.message).toMatch(/outside the trip/i);
    expect(e.message).not.toMatch(/itinerary_slots/);
    expect(toApiError(new Error("TS_LAST_ORGANIZER: x")).status).toBe(409);
    expect(toApiError(new Error("TS_SPLIT_SUM: splits total 1 but the expense amount is 2")).status).toBe(422);
  });
  it("maps zod errors to field messages and hides unknown internals", () => {
    let zerr: ZodError | undefined;
    try { z.object({ a: z.string() }).parse({}); } catch (e) { zerr = e as ZodError; }
    const e = toApiError(zerr);
    expect(e.status).toBe(400);
    expect(JSON.stringify(e.details)).toContain('"field":"a"');
    const internal = toApiError(new Error("password authentication failed for user tripsync at 10.0.0.5"));
    expect(internal.status).toBe(500);
    expect(internal.message).not.toMatch(/password|10\.0\.0\.5/);
    expect(toApiError(new ApiError(418, "X", "tea")).status).toBe(418);
  });
  it("recognises unique / foreign key violations", () => {
    expect(toApiError(new Error('duplicate key value violates unique constraint "users_email_key"')).status).toBe(409);
    expect(toApiError(new Error('violates foreign key constraint "x"')).status).toBe(409);
    expect(toApiError(new Error('violates check constraint "ck_trips_date_order"')).status).toBe(422);
  });
});

describe("rate limiter", () => {
  beforeEach(() => _clearAllRateLimits());
  it("allows up to the maximum then blocks with 429", () => {
    for (let i = 0; i < 3; i++) rateLimit("k", 3, 1000);
    expect(() => rateLimit("k", 3, 1000)).toThrowError(/Too many/);
    expect(() => rateLimit("other", 3, 1000)).not.toThrow();
  });
});

describe("search helpers", () => {
  it("builds a safe prefix-OR tsquery", () => {
    expect(toOrTsQuery("temple sunrise")).toBe("temple:* | sunrise:*");
    expect(toOrTsQuery("a ' ); DROP TABLE users; --")).toBe("drop:* | table:* | users:*");
    expect(toOrTsQuery("!!! ?")).toBeNull();
  });
  it("combines the searchable text of an activity", () => {
    expect(buildSearchContent({ title: "Hike", description: "Steep", tags: ["a", "b"], slotType: "adventure", locationName: "Hill" })).toBe("Hike. Steep. a, b. adventure. Hill");
  });
  it("formats a pgvector literal", () => {
    expect(toVectorLiteral([0.5, -1, 0])).toBe("[0.5,-1,0]");
  });
});
