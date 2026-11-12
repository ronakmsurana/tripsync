// ============================================
// API errors + translation of DB / validation failures
// ============================================
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { ConfigError } from "@/lib/env";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const badRequest = (m: string, d?: unknown) => new ApiError(400, "BAD_REQUEST", m, d);
export const unauthorized = (m = "Authentication required") => new ApiError(401, "UNAUTHORIZED", m);
export const forbidden = (m = "You do not have permission to do that") => new ApiError(403, "FORBIDDEN", m);
export const notFound = (m = "Not found") => new ApiError(404, "NOT_FOUND", m);
export const conflict = (m: string, d?: unknown, code = "CONFLICT") => new ApiError(409, code, m, d);
export const unprocessable = (m: string, d?: unknown, code = "UNPROCESSABLE") => new ApiError(422, code, m, d);

/** Friendly messages for rules raised by the database triggers (prefix TS_<RULE>:). */
const TRIGGER_MESSAGES: Record<string, { status: number; message: string }> = {
  LAST_ORGANIZER: { status: 409, message: "A trip must keep at least one organizer." },
  OUTSIDE_TRIP_WINDOW: { status: 422, message: "That date/time falls outside the trip's start and end dates." },
  TRIP_SHRINK: { status: 409, message: "The new trip dates would leave scheduled items outside the trip. Move or remove them first." },
  DESTINATION_TRIP_MISMATCH: { status: 422, message: "That destination does not belong to this trip." },
  NOT_A_MEMBER: { status: 422, message: "Everyone on an expense must be an active member of the trip." },
  SPLIT_SUM: { status: 422, message: "The split shares must add up exactly to the expense amount." },
};

function dbMessage(error: unknown): string {
  const e = error as { message?: string; meta?: { message?: string }; cause?: { message?: string } };
  return [e?.message, e?.meta?.message, e?.cause?.message].filter(Boolean).join(" | ");
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (error instanceof ZodError) {
    return new ApiError(
      400,
      "VALIDATION_FAILED",
      "Some fields are invalid",
      error.issues.map((i) => ({ field: i.path.join("."), message: i.message }))
    );
  }

  const msg = dbMessage(error);
  const rule = /TS_([A-Z_]+):/.exec(msg);
  if (rule && TRIGGER_MESSAGES[rule[1]]) {
    const t = TRIGGER_MESSAGES[rule[1]];
    return new ApiError(t.status, `DB_${rule[1]}`, t.message);
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return conflict("That value already exists (duplicate).", undefined, "DUPLICATE");
    if (error.code === "P2003")
      return conflict("This record is still referenced by other records (or references something that does not exist).", undefined, "REFERENCED");
    if (error.code === "P2025") return notFound("Record not found");
  }
  if (/duplicate key value|unique constraint/i.test(msg)) return conflict("That value already exists (duplicate).", undefined, "DUPLICATE");
  if (/foreign key constraint/i.test(msg))
    return conflict("This record is still referenced by other records (or references something that does not exist).", undefined, "REFERENCED");
  if (/violates check constraint/i.test(msg)) return unprocessable("The database rejected that value (constraint violated).", undefined, "CONSTRAINT");

  if (error instanceof ConfigError) {
    console.error(error.message);
    return new ApiError(500, "SERVER_MISCONFIGURED", "The server is not configured correctly.");
  }
  if (/MongoServerSelectionError|MongoNetworkError|ECONNREFUSED/i.test(`${(error as Error)?.name} ${msg}`)) {
    console.error("MongoDB unavailable:", msg);
    return new ApiError(503, "DOCUMENT_STORE_UNAVAILABLE", "The activity store (MongoDB) is temporarily unavailable. Please try again.");
  }

  console.error("Unhandled error:", error);
  return new ApiError(500, "INTERNAL", "Something went wrong on our side.");
}

export function errorResponse(error: unknown): NextResponse {
  const e = toApiError(error);
  return NextResponse.json(
    { success: false, error: { code: e.code, message: e.message, details: e.details } },
    { status: e.status }
  );
}
