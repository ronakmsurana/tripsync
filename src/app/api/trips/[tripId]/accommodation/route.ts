// ============================================
// Accommodation API
// GET  /api/trips/[tripId]/accommodation — List
// POST /api/trips/[tripId]/accommodation — Create
// ============================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/postgres";
import { withTripRole } from "@/lib/auth/middleware";
import { createAccommodationSchema } from "@/lib/utils/validation";
import { TokenPayload } from "@/lib/auth/jwt";

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

      const accommodations = await prisma.accommodation.findMany({
        where: { tripId },
        include: {
          destination: { select: { name: true, location: true } },
        },
        orderBy: { checkIn: "asc" },
      });

      return NextResponse.json({ success: true, data: accommodations });
    } catch (error) {
      console.error("List accommodations error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }
);

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
      const parsed = createAccommodationSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: "Validation failed", details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      const accommodation = await prisma.accommodation.create({
        data: {
          tripId,
          destinationId: parsed.data.destinationId,
          name: parsed.data.name,
          address: parsed.data.address,
          checkIn: new Date(parsed.data.checkIn),
          checkOut: new Date(parsed.data.checkOut),
          bookingReference: parsed.data.bookingReference,
          cost: parsed.data.cost,
          status: parsed.data.status,
        },
        include: {
          destination: { select: { name: true } },
        },
      });

      return NextResponse.json(
        { success: true, data: accommodation },
        { status: 201 }
      );
    } catch (error) {
      console.error("Create accommodation error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }
);
