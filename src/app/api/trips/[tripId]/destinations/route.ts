// ============================================
// Destinations API
// GET  /api/trips/[tripId]/destinations — List
// POST /api/trips/[tripId]/destinations — Create
// ============================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/postgres";
import { withTripRole } from "@/lib/auth/middleware";
import { createDestinationSchema } from "@/lib/utils/validation";
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

      const destinations = await prisma.destination.findMany({
        where: { tripId },
        include: {
          _count: {
            select: { accommodations: true, itinerarySlots: true },
          },
        },
        orderBy: { arrivalDate: "asc" },
      });

      return NextResponse.json({ success: true, data: destinations });
    } catch (error) {
      console.error("List destinations error:", error);
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
      const parsed = createDestinationSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: "Validation failed", details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      const destination = await prisma.destination.create({
        data: {
          tripId,
          name: parsed.data.name,
          location: parsed.data.location,
          arrivalDate: new Date(parsed.data.arrivalDate),
          departureDate: new Date(parsed.data.departureDate),
          notes: parsed.data.notes,
        },
      });

      return NextResponse.json(
        { success: true, data: destination },
        { status: 201 }
      );
    } catch (error) {
      console.error("Create destination error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }
);
