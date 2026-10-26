// ============================================
// Trip Detail API
// GET    /api/trips/[tripId] — Get trip details
// PUT    /api/trips/[tripId] — Update trip
// DELETE /api/trips/[tripId] — Delete trip
// ============================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/postgres";
import { withTripRole } from "@/lib/auth/middleware";
import { updateTripSchema } from "@/lib/utils/validation";
import { TokenPayload } from "@/lib/auth/jwt";

// GET — Get trip details (any member role can view)
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

      const trip = await prisma.trip.findUnique({
        where: { tripId },
        include: {
          creator: { select: { userId: true, name: true, email: true } },
          members: {
            include: {
              user: { select: { userId: true, name: true, email: true } },
            },
            where: { status: "active" },
          },
          destinations: { orderBy: { arrivalDate: "asc" } },
          _count: {
            select: {
              transports: true,
              accommodations: true,
              expenses: true,
              itinerarySlots: true,
            },
          },
        },
      });

      if (!trip) {
        return NextResponse.json(
          { error: "Trip not found" },
          { status: 404 }
        );
      }

      return NextResponse.json({ success: true, data: trip });
    } catch (error) {
      console.error("Get trip error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }
);

// PUT — Update trip (organizer only)
export const PUT = withTripRole(
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
      const parsed = updateTripSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: "Validation failed", details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      const updateData: Record<string, unknown> = {};
      if (parsed.data.tripName) updateData.tripName = parsed.data.tripName;
      if (parsed.data.description !== undefined)
        updateData.description = parsed.data.description;
      if (parsed.data.startDate)
        updateData.startDate = new Date(parsed.data.startDate);
      if (parsed.data.endDate)
        updateData.endDate = new Date(parsed.data.endDate);
      if (parsed.data.currency) updateData.currency = parsed.data.currency;
      if (parsed.data.status) updateData.status = parsed.data.status;

      const trip = await prisma.trip.update({
        where: { tripId },
        data: updateData,
      });

      return NextResponse.json({
        success: true,
        data: trip,
        message: "Trip updated successfully",
      });
    } catch (error) {
      console.error("Update trip error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }
);

// DELETE — Delete trip (organizer only)
export const DELETE = withTripRole(
  ["organizer"],
  async (
    _request: NextRequest,
    context: { params: Promise<Record<string, string>> },
    _user: TokenPayload,
    _role: string
  ) => {
    try {
      const params = await context.params;
      const tripId = parseInt(params.tripId);

      // CASCADE will handle related records
      await prisma.trip.delete({ where: { tripId } });

      return NextResponse.json({
        success: true,
        message: "Trip deleted successfully",
      });
    } catch (error) {
      console.error("Delete trip error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }
);
