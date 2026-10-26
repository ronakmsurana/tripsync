// ============================================
// Conflicts API
// GET /api/conflicts?tripId=X — All trip conflicts
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { withAuth, getTripMemberRole } from "@/lib/auth/middleware";
import { getTripConflicts } from "@/lib/services/conflictEngine";
import { TokenPayload } from "@/lib/auth/jwt";

export const GET = withAuth(
  async (request: NextRequest, _context: { params: Promise<Record<string, string>> }, user: TokenPayload) => {
    try {
      const tripId = parseInt(
        request.nextUrl.searchParams.get("tripId") || "0"
      );

      if (!tripId) {
        return NextResponse.json(
          { error: "tripId query parameter is required" },
          { status: 400 }
        );
      }

      // Verify membership
      const role = await getTripMemberRole(tripId, user.userId);
      if (!role) {
        return NextResponse.json(
          { error: "Not a member of this trip" },
          { status: 403 }
        );
      }

      const conflicts = await getTripConflicts(tripId);

      const hardConflicts = conflicts.filter(
        (c) => c.severity === "hard"
      );
      const softConflicts = conflicts.filter(
        (c) => c.severity === "soft"
      );

      return NextResponse.json({
        success: true,
        data: {
          conflicts,
          summary: {
            total: conflicts.length,
            hard: hardConflicts.length,
            soft: softConflicts.length,
          },
        },
      });
    } catch (error) {
      console.error("Get conflicts error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }
);
