// ============================================
// Route wrapper: auth + authorization + errors in ONE place
// ============================================
// Every private route goes through `route()`. It
//   1. rejects cross-site state-changing requests (Origin check),
//   2. resolves the user from the session cookie (never from request data),
//   3. optionally requires the global admin role,
//   4. optionally requires membership/role on the trip in the URL,
//   5. converts any thrown error into the JSON error envelope.
// ============================================
import { NextRequest, NextResponse } from "next/server";
import { ZodType } from "zod";
import prisma from "@/lib/db/postgres";
import { getSessionUser, SessionUser } from "@/lib/auth/session";
import { ApiError, badRequest, errorResponse, forbidden, notFound, unauthorized } from "./errors";

export type TripRole = "organizer" | "member" | "viewer";
export const ANY_ROLE: TripRole[] = ["organizer", "member", "viewer"];
export const CAN_EDIT: TripRole[] = ["organizer", "member"];
export const ORGANIZER: TripRole[] = ["organizer"];

export interface Ctx {
  req: NextRequest;
  user: SessionUser;
  params: Record<string, string>;
  tripId: number;
  role: TripRole | null;
  /** Parses the JSON body with a zod schema (throws a 400 with field errors). */
  body<T>(schema: ZodType<T>): Promise<T>;
  /** Numeric route param (400 if not a positive integer). */
  int(name: string): number;
}

interface Options {
  /** default true */
  auth?: boolean;
  admin?: boolean;
  /** Require an active membership with one of these roles on `[tripId]`. */
  trip?: TripRole[];
}

function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser clients / same-site navigations
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

export async function memberRole(tripId: number, userId: number): Promise<TripRole | null> {
  const m = await prisma.tripMember.findUnique({
    where: { tripId_userId: { tripId, userId } },
    select: { memberRole: true, status: true },
  });
  return m && m.status === "active" ? (m.memberRole as TripRole) : null;
}

export function route(
  options: Options,
  handler: (ctx: Ctx) => Promise<NextResponse>
): (req: NextRequest, context: { params: Promise<Record<string, string>> }) => Promise<NextResponse> {
  return async (req, context) => {
    try {
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && !sameOrigin(req)) {
        throw forbidden("Cross-site request blocked");
      }
      const params = (await context.params) ?? {};

      const user = await getSessionUser(req);
      if (options.auth !== false && !user) throw unauthorized();
      if (options.admin && user?.role !== "admin") throw forbidden("Administrator access required");

      let tripId = 0;
      let role: TripRole | null = null;
      if (options.trip) {
        tripId = Number(params.tripId);
        if (!Number.isInteger(tripId) || tripId <= 0) throw badRequest("Invalid trip id");
        role = await memberRole(tripId, user!.userId);
        // Same answer for "does not exist" and "not yours": no information leak about other users' trips.
        if (!role) throw notFound("Trip not found");
        if (!options.trip.includes(role)) {
          throw forbidden(
            role === "viewer" ? "Viewers have read-only access to this trip." : "Only a trip organizer can do that."
          );
        }
      }

      const ctx: Ctx = {
        req,
        user: user as SessionUser,
        params,
        tripId,
        role,
        async body<T>(schema: ZodType<T>) {
          let json: unknown;
          try {
            json = await req.json();
          } catch {
            throw badRequest("Request body must be valid JSON");
          }
          return schema.parse(json);
        },
        int(name: string) {
          const n = Number(params[name]);
          if (!Number.isInteger(n) || n <= 0) throw badRequest(`Invalid ${name}`);
          return n;
        },
      };
      return await handler(ctx);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export { ApiError };
