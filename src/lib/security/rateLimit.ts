// ============================================
// Minimal in-memory rate limiter (fixed window)
// ============================================
// Good enough for a single Node process (demo / coursework). Behind several
// instances use a shared store such as Redis instead.
// ============================================
import { NextRequest } from "next/server";
import { ApiError } from "@/lib/api/errors";

const buckets = new Map<string, { count: number; resetAt: number }>();

export function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

export function rateLimit(key: string, max: number, windowMs: number): void {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
  } else {
    b.count += 1;
    if (b.count > max) {
      throw new ApiError(429, "RATE_LIMITED", "Too many attempts. Please wait a few minutes and try again.");
    }
  }
  if (buckets.size > 5000) for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
}

export function resetRateLimit(key: string): void {
  buckets.delete(key);
}

export function _clearAllRateLimits(): void {
  buckets.clear();
}
