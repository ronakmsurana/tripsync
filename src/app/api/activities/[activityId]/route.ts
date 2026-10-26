// ============================================
// Activity Detail API
// GET    /api/activities/[activityId] — Get detail
// PUT    /api/activities/[activityId] — Update
// DELETE /api/activities/[activityId] — Delete
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import prisma from "@/lib/db/postgres";
import { getActivitiesCollection } from "@/lib/db/mongodb";
import { authenticate, getTripMemberRole } from "@/lib/auth/middleware";
import { deleteEmbedding, storeEmbedding } from "@/lib/services/embeddingService";

export async function GET(
  request: NextRequest,
  context: { params: Promise<Record<string, string>> }
) {
  try {
    const user = await authenticate(request);
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const params = await context.params;
    const activityId = params.activityId;

    if (!ObjectId.isValid(activityId)) {
      return NextResponse.json(
        { error: "Invalid activity ID" },
        { status: 400 }
      );
    }

    const activitiesCol = await getActivitiesCollection();
    const activity = await activitiesCol.findOne({
      _id: new ObjectId(activityId),
    });

    if (!activity) {
      return NextResponse.json(
        { error: "Activity not found" },
        { status: 404 }
      );
    }

    // Verify membership
    const role = await getTripMemberRole(activity.tripId, user.userId);
    if (!role) {
      return NextResponse.json(
        { error: "Not a member of this trip" },
        { status: 403 }
      );
    }

    // Get the associated itinerary slot
    const slot = await prisma.itinerarySlot.findFirst({
      where: { mongoDocId: activityId },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...activity,
        _id: activity._id.toString(),
        slot,
      },
    });
  } catch (error) {
    console.error("Get activity error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<Record<string, string>> }
) {
  try {
    const user = await authenticate(request);
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const params = await context.params;
    const activityId = params.activityId;
    const body = await request.json();

    if (!ObjectId.isValid(activityId)) {
      return NextResponse.json(
        { error: "Invalid activity ID" },
        { status: 400 }
      );
    }

    const activitiesCol = await getActivitiesCollection();
    const existing = await activitiesCol.findOne({
      _id: new ObjectId(activityId),
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Activity not found" },
        { status: 404 }
      );
    }

    // Only creator or organizer can edit
    const role = await getTripMemberRole(existing.tripId, user.userId);
    if (!role || (role !== "organizer" && existing.createdBy !== user.userId)) {
      return NextResponse.json(
        { error: "Not authorized to edit this activity" },
        { status: 403 }
      );
    }

    // Update MongoDB document
    const updateFields: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };

    if (body.title) updateFields.title = body.title;
    if (body.description !== undefined) updateFields.description = body.description;
    if (body.location) updateFields.location = body.location;
    if (body.tags) updateFields.tags = body.tags;
    if (body.estimatedCost) updateFields.estimatedCost = body.estimatedCost;
    if (body.customFields) updateFields.customFields = body.customFields;
    if (body.slotType) updateFields.slotType = body.slotType;

    await activitiesCol.updateOne(
      { _id: new ObjectId(activityId) },
      { $set: updateFields }
    );

    // Update itinerary slot if times changed
    if (body.startTime || body.endTime || body.title) {
      const slotUpdate: Record<string, unknown> = {};
      if (body.startTime) slotUpdate.startTime = new Date(body.startTime);
      if (body.endTime) slotUpdate.endTime = new Date(body.endTime);
      if (body.title) slotUpdate.title = body.title;
      if (body.slotType) slotUpdate.slotType = body.slotType;

      await prisma.itinerarySlot.updateMany({
        where: { mongoDocId: activityId },
        data: slotUpdate,
      });
    }

    // Re-generate embedding if text changed
    if (body.title || body.description || body.tags) {
      const updated = await activitiesCol.findOne({
        _id: new ObjectId(activityId),
      });
      if (updated) {
        const embeddingText = [
          updated.title,
          updated.description || "",
          ...(updated.tags || []),
          updated.slotType,
        ]
          .filter(Boolean)
          .join(" ");

        storeEmbedding(
          activityId,
          existing.tripId,
          updated.title,
          embeddingText
        ).catch((err) =>
          console.error("Embedding update failed:", err)
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: "Activity updated successfully",
    });
  } catch (error) {
    console.error("Update activity error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<Record<string, string>> }
) {
  try {
    const user = await authenticate(request);
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const params = await context.params;
    const activityId = params.activityId;

    if (!ObjectId.isValid(activityId)) {
      return NextResponse.json(
        { error: "Invalid activity ID" },
        { status: 400 }
      );
    }

    const activitiesCol = await getActivitiesCollection();
    const existing = await activitiesCol.findOne({
      _id: new ObjectId(activityId),
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Activity not found" },
        { status: 404 }
      );
    }

    // Only creator or organizer can delete
    const role = await getTripMemberRole(existing.tripId, user.userId);
    if (!role || (role !== "organizer" && existing.createdBy !== user.userId)) {
      return NextResponse.json(
        { error: "Not authorized to delete this activity" },
        { status: 403 }
      );
    }

    // Delete from all three databases
    await Promise.all([
      activitiesCol.deleteOne({ _id: new ObjectId(activityId) }),
      prisma.itinerarySlot.deleteMany({ where: { mongoDocId: activityId } }),
      deleteEmbedding(activityId),
    ]);

    return NextResponse.json({
      success: true,
      message: "Activity deleted from all databases",
    });
  } catch (error) {
    console.error("Delete activity error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
