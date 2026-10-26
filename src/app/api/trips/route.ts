// ============================================
// Trips API
// GET  /api/trips — List user's trips
// POST /api/trips — Create a new trip
// ============================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/postgres";
import { withAuth } from "@/lib/auth/middleware";
import { createTripSchema } from "@/lib/utils/validation";
import { TokenPayload } from "@/lib/auth/jwt";

// GET — List all trips the user is a member of
export const GET = withAuth(
  async (_request: NextRequest, _context: { params: Promise<Record<string, string>> }, user: TokenPayload) => {
    try {
      const memberships = await prisma.tripMember.findMany({
        where: { userId: user.userId, status: "active" },
        include: {
          trip: {
            include: {
              _count: {
                select: { members: true },
              },
              creator: {
                select: { name: true },
              },
            },
          },
        },
        orderBy: { trip: { startDate: "desc" } },
      });

      const trips = memberships.map((m) => ({
        tripId: m.trip.tripId,
        tripName: m.trip.tripName,
        description: m.trip.description,
        startDate: m.trip.startDate,
        endDate: m.trip.endDate,
        currency: m.trip.currency,
        status: m.trip.status,
        memberRole: m.memberRole,
        memberCount: m.trip._count.members,
        creatorName: m.trip.creator.name,
      }));

      return NextResponse.json({ success: true, data: trips });
    } catch (error) {
      console.error("List trips error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }
);

// POST — Create a new trip (user becomes the organizer)
export const POST = withAuth(
  async (request: NextRequest, _context: { params: Promise<Record<string, string>> }, user: TokenPayload) => {
    try {
      const body = await request.json();
      const parsed = createTripSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: "Validation failed", details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      const { tripName, description, startDate, endDate, currency } =
        parsed.data;

      // Use a transaction to create trip + add creator as organizer
      const trip = await prisma.$transaction(async (tx) => {
        const newTrip = await tx.trip.create({
          data: {
            tripName,
            description,
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            currency,
            createdBy: user.userId,
          },
        });

        // Add creator as organizer
        await tx.tripMember.create({
          data: {
            tripId: newTrip.tripId,
            userId: user.userId,
            memberRole: "organizer",
          },
        });

        return newTrip;
      });

      return NextResponse.json(
        {
          success: true,
          data: trip,
          message: "Trip created successfully",
        },
        { status: 201 }
      );
    } catch (error) {
      console.error("Create trip error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }
);
