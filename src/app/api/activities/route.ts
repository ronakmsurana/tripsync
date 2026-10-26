// ============================================
// Activities API (Cross-Database: MongoDB + PG)
// GET  /api/activities?tripId=X — List activities
// POST /api/activities — Create activity
// ============================================
// This is the most complex API — it writes to:
// 1. MongoDB (rich activity document)
// 2. PostgreSQL itinerary_slots (time skeleton)
// 3. PostgreSQL activity_embeddings (semantic vector)
// All wrapped in a pseudo-transaction.
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import prisma from "@/lib/db/postgres";
import { getActivitiesCollection } from "@/lib/db/mongodb";
import { withAuth } from "@/lib/auth/middleware";
import { getTripMemberRole } from "@/lib/auth/middleware";
import { createActivitySchema } from "@/lib/utils/validation";
import { detectConflicts } from "@/lib/services/conflictEngine";
import { storeEmbedding } from "@/lib/services/embeddingService";
import { TokenPayload } from "@/lib/auth/jwt";

// GET — List activities for a trip (from MongoDB)
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

      const activitiesCol = await getActivitiesCollection();
      const activities = await activitiesCol
        .find({ tripId })
        .sort({ createdAt: -1 })
        .toArray();

      // Also fetch itinerary slots for time info
      const slots = await prisma.itinerarySlot.findMany({
        where: { tripId },
        orderBy: { startTime: "asc" },
      });

      // Merge slot time data with activity documents
      const slotMap = new Map(
        slots.map((s) => [s.mongoDocId, s])
      );

      const enrichedActivities = activities.map((activity) => ({
        ...activity,
        _id: activity._id.toString(),
        slot: slotMap.get(activity._id.toString()) || null,
      }));

      return NextResponse.json({
        success: true,
        data: enrichedActivities,
      });
    } catch (error) {
      console.error("List activities error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }
);

// POST — Create a new activity (writes to MongoDB + PostgreSQL)
export const POST = withAuth(
  async (request: NextRequest, _context: { params: Promise<Record<string, string>> }, user: TokenPayload) => {
    try {
      const body = await request.json();
      const tripId = body.tripId;

      if (!tripId) {
        return NextResponse.json(
          { error: "tripId is required" },
          { status: 400 }
        );
      }

      // Verify membership (organizer or member can add activities)
      const role = await getTripMemberRole(tripId, user.userId);
      if (!role || role === "viewer") {
        return NextResponse.json(
          { error: "Viewers cannot add activities" },
          { status: 403 }
        );
      }

      const parsed = createActivitySchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Validation failed", details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      const data = parsed.data;
      const startTime = new Date(data.startTime);
      const endTime = new Date(data.endTime);

      // Step 1: Detect conflicts BEFORE creating
      const conflicts = await detectConflicts(tripId, {
        startTime,
        endTime,
      });

      const hardConflicts = conflicts.filter(
        (c) => c.severity === "hard"
      );

      // If there are hard conflicts, warn but still allow (user can force)
      const hasHardConflicts = hardConflicts.length > 0;

      // Step 2: Insert into MongoDB (rich document)
      const activitiesCol = await getActivitiesCollection();
      const mongoDoc = {
        tripId,
        slotType: data.slotType,
        title: data.title,
        description: data.description || "",
        location: data.location || {},
        tags: data.tags || [],
        estimatedDurationMinutes: Math.round(
          (endTime.getTime() - startTime.getTime()) / 60000
        ),
        estimatedCost: data.estimatedCost || { amount: 0, currency: "INR" },
        notes: data.notes
          ? [
              {
                userId: user.userId,
                text: data.notes,
                createdAt: new Date().toISOString(),
              },
            ]
          : [],
        customFields: data.customFields || {},
        createdBy: user.userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const mongoResult = await activitiesCol.insertOne(mongoDoc);
      const mongoDocId = mongoResult.insertedId.toString();

      // Step 3: Insert itinerary slot in PostgreSQL (time skeleton)
      const slot = await prisma.itinerarySlot.create({
        data: {
          tripId,
          destinationId: data.destinationId || null,
          mongoDocId,
          slotType: data.slotType,
          title: data.title,
          startTime,
          endTime,
          createdBy: user.userId,
        },
      });

      // Step 4: Generate and store embedding (async, non-blocking)
      const embeddingText = [
        data.title,
        data.description || "",
        ...(data.tags || []),
        data.slotType,
        data.location?.name || "",
      ]
        .filter(Boolean)
        .join(" ");

      // Fire and forget — embedding generation shouldn't block the response
      storeEmbedding(mongoDocId, tripId, data.title, embeddingText).catch(
        (err) => console.error("Embedding storage failed:", err)
      );

      return NextResponse.json(
        {
          success: true,
          data: {
            activity: { ...mongoDoc, _id: mongoDocId },
            slot,
            conflicts,
            hasHardConflicts,
          },
          message: hasHardConflicts
            ? "Activity created with schedule conflicts detected"
            : "Activity created successfully",
        },
        { status: 201 }
      );
    } catch (error) {
      console.error("Create activity error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }
);
