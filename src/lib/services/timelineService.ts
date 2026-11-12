// Unified timeline: SQL view vw_trip_timeline + MongoDB details for activities.
import prisma from "@/lib/db/postgres";
import { getActivitiesCollection } from "@/lib/db/mongodb";
import { ObjectId } from "mongodb";
import { TimelineItem } from "@/types";
import { decimalToString } from "@/lib/utils/money";
import { formatLocalDateTime } from "@/lib/utils/time";
import { getTripConflicts } from "./conflictEngine";

export async function getTimeline(tripId: number): Promise<TimelineItem[]> {
  const [rows, slots, conflicts] = await Promise.all([
    prisma.$queryRaw<{
      item_type: "transport" | "accommodation" | "activity"; item_id: number; title: string; start_time: Date; end_time: Date;
      cost: unknown; status: string | null; booking_reference: string | null; is_fixed: boolean;
    }[]>`
      SELECT item_type, item_id, title, start_time, end_time, cost, status, booking_reference, is_fixed
        FROM vw_trip_timeline WHERE trip_id = ${tripId} ORDER BY start_time, item_type, item_id`,
    prisma.itinerarySlot.findMany({ where: { tripId }, select: { slotId: true, mongoDocId: true, slotType: true } }),
    getTripConflicts(tripId),
  ]);
  const slotById = new Map(slots.map((s) => [s.slotId, s]));
  const docs = slots.length
    ? await (await getActivitiesCollection()).find({ _id: { $in: slots.map((s) => new ObjectId(s.mongoDocId)) } }).toArray()
    : [];
  const docById = new Map(docs.map((d) => [d._id.toString(), d]));

  const count = (type: string, id: number) =>
    conflicts.filter((c) => (c.subject.type === type && c.subject.id === id) || (c.other.type === type && c.other.id === id)).length;

  return rows.map((r) => {
    const slot = r.item_type === "activity" ? slotById.get(r.item_id) : undefined;
    const doc = slot ? docById.get(slot.mongoDocId) : undefined;
    return {
      itemType: r.item_type,
      itemId: r.item_id,
      title: r.title,
      startTime: formatLocalDateTime(r.start_time),
      endTime: formatLocalDateTime(r.end_time),
      cost: r.cost === null || r.cost === undefined ? null : decimalToString(r.cost),
      status: r.status,
      bookingReference: r.booking_reference,
      isFixed: r.is_fixed,
      slotType: slot?.slotType,
      description: doc?.description,
      tags: doc?.tags,
      activityId: slot?.mongoDocId,
      conflictCount: count(r.item_type === "accommodation" ? "accommodation" : r.item_type, r.item_id),
    };
  });
}
