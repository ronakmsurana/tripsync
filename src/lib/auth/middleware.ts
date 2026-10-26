// ============================================
// Auth Middleware for API Route Handlers
// ============================================
// Extracts and verifies JWT from Authorization
// header or cookies. Also provides role-checking.
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { verifyToken, TokenPayload } from "./jwt";
import prisma from "@/lib/db/postgres";

export interface AuthenticatedRequest extends NextRequest {
  user?: TokenPayload;
}

/**
 * Extract the JWT token from request headers or cookies.
 */
function extractToken(request: NextRequest): string | null {
  // Check Authorization header first
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  // Fall back to cookie
  const tokenCookie = request.cookies.get("token");
  return tokenCookie?.value || null;
}

/**
 * Authenticate the request and return the user payload.
 * Returns null if authentication fails.
 */
export async function authenticate(
  request: NextRequest
): Promise<TokenPayload | null> {
  const token = extractToken(request);
  if (!token) return null;
  return verifyToken(token);
}

/**
 * Higher-order function that wraps an API handler with authentication.
 * Returns 401 if not authenticated.
 */
export function withAuth(
  handler: (
    request: NextRequest,
    context: { params: Promise<Record<string, string>> },
    user: TokenPayload
  ) => Promise<NextResponse>
) {
  return async (
    request: NextRequest,
    context: { params: Promise<Record<string, string>> }
  ): Promise<NextResponse> => {
    const user = await authenticate(request);
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }
    return handler(request, context, user);
  };
}

/**
 * Check if a user has a specific role in a trip.
 * Returns the member role or null if not a member.
 */
export async function getTripMemberRole(
  tripId: number,
  userId: number
): Promise<string | null> {
  const member = await prisma.tripMember.findUnique({
    where: {
      tripId_userId: { tripId, userId },
    },
    select: { memberRole: true, status: true },
  });

  if (!member || member.status !== "active") return null;
  return member.memberRole;
}

/**
 * Check if user is an organizer of the trip.
 */
export async function isOrganizer(
  tripId: number,
  userId: number
): Promise<boolean> {
  const role = await getTripMemberRole(tripId, userId);
  return role === "organizer";
}

/**
 * Higher-order function that wraps a handler with auth + trip role check.
 * Expects tripId as a route parameter.
 */
export function withTripRole(
  requiredRoles: string[],
  handler: (
    request: NextRequest,
    context: { params: Promise<Record<string, string>> },
    user: TokenPayload,
    role: string
  ) => Promise<NextResponse>
) {
  return withAuth(async (request, context, user) => {
    const params = await context.params;
    const tripId = parseInt(params.tripId);
    if (isNaN(tripId)) {
      return NextResponse.json(
        { error: "Invalid trip ID" },
        { status: 400 }
      );
    }

    const role = await getTripMemberRole(tripId, user.userId);
    if (!role) {
      return NextResponse.json(
        { error: "You are not a member of this trip" },
        { status: 403 }
      );
    }

    if (!requiredRoles.includes(role)) {
      return NextResponse.json(
        { error: `Requires one of: ${requiredRoles.join(", ")}` },
        { status: 403 }
      );
    }

    return handler(request, context, user, role);
  });
}
