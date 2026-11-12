// ============================================
// Activity service — PostgreSQL + MongoDB + vector index
// ============================================
// Consistency strategy (a single transaction cannot span PostgreSQL and MongoDB):
//   * PostgreSQL is the SOURCE OF TRUTH. Lists are driven by itinerary_slots.
//   * CREATE : ObjectId generated up-front -> PG transaction (slot + index row)
//              -> Mongo insert. If the Mongo insert fails the PG rows are
//              removed again (compensation) and the caller gets a 503.
//   * UPDATE : PG transaction first, then Mongo $set. A Mongo failure returns
//              503 and the same request can safely be retried (idempotent).
//   * DELETE : PG transaction first; the Mongo delete is best-effort. A leftover
//              document is invisible (lists come from PG) and removed by
//              reconcile().
//   * Embedding: generated after the response-critical work; failure only leaves
//              the row 'pending' (keyword search still works).
// ============================================
import { ObjectId, Decimal128 } from "mongodb";
import prisma from "@/lib/db/postgres";
import { getActivitiesCollection } from "@/lib/db/mongodb";
import { ApiError, conflict, notFound, unprocessable } from "@/lib/api/errors";
import { ActivityDTO, Conflict } from "@/types";
import { CreateActivityInput, UpdateActivityInput } from "@/lib/utils/validation";
import { formatLocalDateTime, parseLocalDateTime, tripWindow, MINUTE_MS } from "@/lib/utils/time";
import { checkWindow } from "./conflictEngine";
import { buildSearchContent, deleteIndexRow, syncEmbedding, upsertIndexRow } from "./searchIndexService";
import { normalizeMoney } from "@/lib/utils/money";

interface ActivityDoc {
  _id: ObjectId;
  tripId: number;
  slotType: string;
  title: string;
  description?: string;
  location?: { name?: string; coordinates?: { lat: number; lng: number } };
  tags?: string[];
  estimatedDurationMinutes?: number;
  estimatedCost?: { amount: Decimal128 | number; currency: string };
  notes?: { userId: number; text: string; createdAt: Date }[];
  customFields?: Record<string, unknown>;
  createdBy: number;
  createdAt: Date;
  updatedAt: Date;
}

const amountString = (a: Decimal128 | number | undefined) => (a === undefined ? "0.00" : normalizeMoney(a.toString()));

function toDTO(
  slot: { slotId: number; tripId: number; destinationId: number | null; mongoDocId: string; slotType: string; title: string; startTime: Date; endTime: Date; createdBy: number },
  doc: ActivityDoc | undefined,
  indexed: boolean,
  currency: string
): ActivityDTO {
  return {
    id: slot.mongoDocId,
    slotId: slot.slotId,
    tripId: slot.tripId,
    destinationId: slot.destinationId,
    slotType: slot.slotType,
    title: slot.title,
    description: doc?.description ?? "",
    startTime: formatLocalDateTime(slot.startTime),
    endTime: formatLocalDateTime(slot.endTime),
    location: doc?.location,
    tags: doc?.tags ?? [],
    estimatedCost: { amount: amountString(doc?.estimatedCost?.amount), currency: doc?.estimatedCost?.currency ?? currency },
    notes: (doc?.notes ?? []).map((n) => ({ userId: n.userId, text: n.text, createdAt: n.createdAt.toISOString() })),
    customFields: doc?.customFields ?? {},
    createdBy: slot.createdBy,
    indexed,
    documentMissing: !doc,
  };
}

export async function listActivities(tripId: number): Promise<ActivityDTO[]> {
  const [trip, slots, idx] = await Promise.all([
    prisma.trip.findUnique({ where: { tripId }, select: { currency: true } }),
    prisma.itinerarySlot.findMany({ where: { tripId }, orderBy: [{ startTime: "asc" }, { slotId: "asc" }] }),
    prisma.$queryRaw<{ mongo_doc_id: string; sync_status: string }[]>`
      SELECT mongo_doc_id, sync_status FROM activity_embeddings WHERE trip_id = ${tripId}`,
  ]);
  const col = await getActivitiesCollection<ActivityDoc>();
  const docs = slots.length ? await col.find({ _id: { $in: slots.map((s) => new ObjectId(s.mongoDocId)) } }).toArray() : [];
  const byId = new Map(docs.map((d) => [d._id.toString(), d]));
  const indexed = new Map(idx.map((r) => [r.mongo_doc_id, r.sync_status === "synced"]));
  return slots.map((s) => toDTO(s, byId.get(s.mongoDocId), indexed.get(s.mongoDocId) ?? false, trip?.currency ?? "INR"));
}

export async function getActivity(tripId: number, mongoDocId: string): Promise<ActivityDTO> {
  const slot = await prisma.itinerarySlot.findFirst({ where: { mongoDocId, tripId } });
  if (!slot) throw notFound("Activity not found");
  const [trip, doc, idx] = await Promise.all([
    prisma.trip.findUnique({ where: { tripId }, select: { currency: true } }),
    (await getActivitiesCollection<ActivityDoc>()).findOne({ _id: new ObjectId(mongoDocId) }),
    prisma.$queryRaw<{ sync_status: string }[]>`SELECT sync_status FROM activity_embeddings WHERE mongo_doc_id = ${mongoDocId}`,
  ]);
  return toDTO(slot, doc ?? undefined, idx[0]?.sync_status === "synced", trip?.currency ?? "INR");
}

/** Friendly pre-checks (the database triggers enforce the same rules as a last line of defence). */
async function assertPlacement(tripId: number, start: Date, end: Date, destinationId?: number | null) {
  const trip = await prisma.trip.findUnique({ where: { tripId }, select: { startDate: true, endDate: true } });
  if (!trip) throw notFound("Trip not found");
  const w = tripWindow(trip.startDate, trip.endDate);
  if (start < w.start || end > w.end) {
    throw unprocessable(
      `Activities must fall within the trip dates (${formatLocalDateTime(w.start).slice(0, 10)} to ${formatLocalDateTime(new Date(w.end.getTime() - MINUTE_MS)).slice(0, 10)}).`,
      undefined,
      "OUTSIDE_TRIP_DATES"
    );
  }
  if (destinationId) {
    const d = await prisma.destination.findFirst({ where: { destinationId, tripId }, select: { destinationId: true } });
    if (!d) throw unprocessable("That destination does not belong to this trip.", undefined, "BAD_DESTINATION");
  }
}

function conflictError(conflicts: Conflict[], suggestion?: { startTime: string; endTime: string }) {
  return conflict(
    conflicts.some((c) => c.severity === "hard")
      ? "This time clashes with a booking. Review the conflicts, pick the suggested slot, or save anyway."
      : "This time overlaps another activity. Review it, pick the suggested slot, or save anyway.",
    { conflicts, suggestion },
    "SCHEDULE_CONFLICT"
  );
}

export async function createActivity(tripId: number, userId: number, input: CreateActivityInput) {
  const start = parseLocalDateTime(input.startTime);
  const end = parseLocalDateTime(input.endTime);
  await assertPlacement(tripId, start, end, input.destinationId);

  const { conflicts, suggestion } = await checkWindow(tripId, start, end, input.title);
  if (conflicts.length > 0 && !input.force) throw conflictError(conflicts, suggestion);

  const trip = await prisma.trip.findUniqueOrThrow({ where: { tripId }, select: { currency: true } });
  const now = new Date();
  const _id = new ObjectId();
  const mongoDocId = _id.toHexString();
  const currency = input.estimatedCost?.currency ?? trip.currency;

  const doc: ActivityDoc = {
    _id,
    tripId,
    slotType: input.slotType,
    title: input.title,
    description: input.description ?? "",
    location: input.location ?? {},
    tags: input.tags ?? [],
    estimatedDurationMinutes: Math.round((end.getTime() - start.getTime()) / MINUTE_MS),
    estimatedCost: { amount: Decimal128.fromString(input.estimatedCost?.amount ?? "0.00"), currency },
    notes: input.notes ? [{ userId, text: input.notes, createdAt: now }] : [],
    customFields: input.customFields ?? {},
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  };
  const content = buildSearchContent({
    title: input.title, description: input.description, tags: input.tags, slotType: input.slotType, locationName: input.location?.name,
  });

  // 1) PostgreSQL: slot + index row, atomically.
  await prisma.$transaction(async (tx) => {
    await tx.itinerarySlot.create({
      data: {
        tripId, destinationId: input.destinationId ?? null, mongoDocId, slotType: input.slotType,
        title: input.title, startTime: start, endTime: end, createdBy: userId,
      },
    });
    await upsertIndexRow(tx, { mongoDocId, tripId, title: input.title, content });
  });

  // 2) MongoDB: rich document. Compensate on failure.
  try {
    await (await getActivitiesCollection<ActivityDoc>()).insertOne(doc);
  } catch (err) {
    await prisma
      .$transaction(async (tx) => {
        await deleteIndexRow(tx, mongoDocId);
        await tx.itinerarySlot.deleteMany({ where: { mongoDocId } });
      })
      .catch((e) => console.error("Compensation failed for", mongoDocId, e));
    console.error("Mongo insert failed, PostgreSQL rows rolled back:", err);
    throw new ApiError(503, "DOCUMENT_STORE_UNAVAILABLE", "The activity store (MongoDB) is unavailable, so nothing was saved. Please try again.");
  }

  // 3) Embedding (best effort).
  const indexed = await syncEmbedding(mongoDocId);
  const activity = await getActivity(tripId, mongoDocId);
  return { activity: { ...activity, indexed }, conflicts, suggestion };
}

export async function updateActivity(tripId: number, mongoDocId: string, input: UpdateActivityInput, userId: number) {
  const slot = await prisma.itinerarySlot.findFirst({ where: { mongoDocId, tripId } });
  if (!slot) throw notFound("Activity not found");
  const col = await getActivitiesCollection<ActivityDoc>();
  const existing = await col.findOne({ _id: new ObjectId(mongoDocId) });

  const start = input.startTime ? parseLocalDateTime(input.startTime) : slot.startTime;
  const end = input.endTime ? parseLocalDateTime(input.endTime) : slot.endTime;
  if (end <= start) throw unprocessable("End time must be after start time.", undefined, "BAD_TIME_RANGE");
  const destinationId = input.destinationId === undefined ? slot.destinationId : input.destinationId;
  const timeChanged = start.getTime() !== slot.startTime.getTime() || end.getTime() !== slot.endTime.getTime();
  const title = input.title ?? slot.title;
  const slotType = input.slotType ?? slot.slotType;

  await assertPlacement(tripId, start, end, destinationId);
  if (timeChanged) {
    const { conflicts, suggestion } = await checkWindow(tripId, start, end, title, slot.slotId);
    if (conflicts.length > 0 && !input.force) throw conflictError(conflicts, suggestion);
  }

  const description = input.description ?? existing?.description ?? "";
  const tags = input.tags ?? existing?.tags ?? [];
  const location = input.location ?? existing?.location ?? {};
  const content = buildSearchContent({ title, description, tags, slotType, locationName: location.name });

  await prisma.$transaction(async (tx) => {
    await tx.itinerarySlot.update({
      where: { slotId: slot.slotId },
      data: { title, slotType, startTime: start, endTime: end, destinationId },
    });
    await upsertIndexRow(tx, { mongoDocId, tripId, title, content });
  });

  const set: Record<string, unknown> = {
    title, slotType, description, tags, location,
    estimatedDurationMinutes: Math.round((end.getTime() - start.getTime()) / MINUTE_MS),
    updatedAt: new Date(),
  };
  if (input.estimatedCost) set.estimatedCost = { amount: Decimal128.fromString(input.estimatedCost.amount), currency: input.estimatedCost.currency };
  if (input.customFields) set.customFields = input.customFields;

  try {
    const trip = await prisma.trip.findUniqueOrThrow({ where: { tripId }, select: { currency: true } });
    if (!existing) {
      // Self-heal: the document went missing; rebuild a complete one from the slot + this update.
      const now = new Date();
      await col.insertOne({
        _id: new ObjectId(mongoDocId), tripId, slotType, title, description, location, tags,
        estimatedDurationMinutes: set.estimatedDurationMinutes as number,
        estimatedCost: (set.estimatedCost as ActivityDoc["estimatedCost"]) ?? { amount: Decimal128.fromString("0.00"), currency: trip.currency },
        notes: input.notes ? [{ userId, text: input.notes, createdAt: now }] : [],
        customFields: input.customFields ?? {}, createdBy: slot.createdBy, createdAt: now, updatedAt: now,
      });
    } else {
      await col.updateOne(
        { _id: new ObjectId(mongoDocId) },
        { $set: set, ...(input.notes ? { $push: { notes: { userId, text: input.notes, createdAt: new Date() } } } : {}) }
      );
    }
  } catch (err) {
    console.error("Mongo update failed (PostgreSQL already updated):", err);
    throw new ApiError(503, "DOCUMENT_STORE_UNAVAILABLE", "Saved the schedule, but the activity details could not be stored. Please retry the same save.");
  }

  await syncEmbedding(mongoDocId);
  return getActivity(tripId, mongoDocId);
}

export async function deleteActivity(tripId: number, mongoDocId: string): Promise<void> {
  const slot = await prisma.itinerarySlot.findFirst({ where: { mongoDocId, tripId }, select: { slotId: true } });
  if (!slot) throw notFound("Activity not found");
  await prisma.$transaction(async (tx) => {
    await deleteIndexRow(tx, mongoDocId);
    await tx.itinerarySlot.delete({ where: { slotId: slot.slotId } });
  });
  try {
    await (await getActivitiesCollection()).deleteOne({ _id: new ObjectId(mongoDocId) });
  } catch (err) {
    console.error("Mongo delete failed; document will be removed by reconcile():", mongoDocId, err);
  }
}

/** Best-effort removal of every document of a deleted trip. */
export async function purgeTripDocuments(tripId: number): Promise<void> {
  try {
    await (await getActivitiesCollection()).deleteMany({ tripId });
  } catch (err) {
    console.error("Could not purge Mongo documents of trip", tripId, err);
  }
}
