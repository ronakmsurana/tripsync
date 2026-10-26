// ============================================
// Transport API
// GET  /api/trips/[tripId]/transport — List
// POST /api/trips/[tripId]/transport — Create
// ============================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/postgres";
import { withTripRole } from "@/lib/auth/middleware";
import { createTransportSchema } from "@/lib/utils/validation";
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

      const transports = await prisma.transport.findMany({
        where: { tripId },
        include: {
          departureDestination: { select: { name: true, location: true } },
          arrivalDestination: { select: { name: true, location: true } },
        },
        orderBy: { departureTime: "asc" },
      });

      return NextResponse.json({ success: true, data: transports });
    } catch (error) {
      console.error("List transports error:", error);
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
      const parsed = createTransportSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: "Validation failed", details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      const transport = await prisma.transport.create({
        data: {
          tripId,
          transportType: parsed.data.transportType,
          provider: parsed.data.provider,
          departureDestinationId: parsed.data.departureDestinationId,
          arrivalDestinationId: parsed.data.arrivalDestinationId,
          departureTime: new Date(parsed.data.departureTime),
          arrivalTime: new Date(parsed.data.arrivalTime),
          bookingReference: parsed.data.bookingReference,
          cost: parsed.data.cost,
          status: parsed.data.status,
        },
        include: {
          departureDestination: { select: { name: true } },
          arrivalDestination: { select: { name: true } },
        },
      });

      return NextResponse.json(
        { success: true, data: transport },
        { status: 201 }
      );
    } catch (error) {
      console.error("Create transport error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }
);
