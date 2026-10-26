// ============================================
// Trip Members API
// GET  /api/trips/[tripId]/members — List members
// POST /api/trips/[tripId]/members — Add member
// ============================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/postgres";
import { withTripRole } from "@/lib/auth/middleware";
import { addMemberSchema } from "@/lib/utils/validation";
import { TokenPayload } from "@/lib/auth/jwt";

// GET — List all members of a trip
export const GET = withTripRole(
  ["organizer", "member", "viewer"],
  async (
    _request: NextRequest,
    context: { params: Promise<Record<string, string>> },
    _user: TokenPayload,
    _role: string
  ) => {
    try {
      const params = await context.params;
      const tripId = parseInt(params.tripId);

      const members = await prisma.tripMember.findMany({
        where: { tripId },
        include: {
          user: {
            select: { userId: true, name: true, email: true, phone: true },
          },
        },
        orderBy: { joinedAt: "asc" },
      });

      return NextResponse.json({ success: true, data: members });
    } catch (error) {
      console.error("List members error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }
);

// POST — Add a member to the trip (organizer only)
export const POST = withTripRole(
  ["organizer"],
  async (
    request: NextRequest,
    context: { params: Promise<Record<string, string>> },
    _user: TokenPayload,
    _role: string
  ) => {
    try {
      const params = await context.params;
      const tripId = parseInt(params.tripId);
      const body = await request.json();
      const parsed = addMemberSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: "Validation failed", details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      // Find the user by email
      const targetUser = await prisma.user.findUnique({
        where: { email: parsed.data.email },
      });

      if (!targetUser) {
        return NextResponse.json(
          { error: "No user found with that email. They need to register first." },
          { status: 404 }
        );
      }

      // Check if already a member
      const existing = await prisma.tripMember.findUnique({
        where: {
          tripId_userId: { tripId, userId: targetUser.userId },
        },
      });

      if (existing) {
        return NextResponse.json(
          { error: "User is already a member of this trip" },
          { status: 409 }
        );
      }

      const member = await prisma.tripMember.create({
        data: {
          tripId,
          userId: targetUser.userId,
          memberRole: parsed.data.memberRole,
        },
        include: {
          user: {
            select: { userId: true, name: true, email: true },
          },
        },
      });

      return NextResponse.json(
        {
          success: true,
          data: member,
          message: `${targetUser.name} added as ${parsed.data.memberRole}`,
        },
        { status: 201 }
      );
    } catch (error) {
      console.error("Add member error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }
);
