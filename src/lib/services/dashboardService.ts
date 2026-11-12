// Dashboard numbers for the signed-in user — everything computed from persisted rows.
import prisma from "@/lib/db/postgres";
import { listTrips } from "./tripService";
import { fromMinor, signedToMinor } from "@/lib/utils/money";
import { formatLocalDateTime } from "@/lib/utils/time";

export async function getDashboard(userId: number) {
  const trips = await listTrips(userId, { sort: "start_asc" });
  const upcoming = await prisma.$queryRaw<{ mongo_doc_id: string; title: string; slot_type: string; start_time: Date; end_time: Date; trip_id: number; trip_name: string }[]>`
    SELECT s.mongo_doc_id, s.title, s.slot_type, s.start_time, s.end_time, t.trip_id, t.trip_name
      FROM itinerary_slots s
      JOIN trips t ON t.trip_id = s.trip_id
      JOIN trip_members tm ON tm.trip_id = t.trip_id AND tm.user_id = ${userId} AND tm.status = 'active'
     WHERE s.end_time >= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AND t.status <> 'cancelled'
     ORDER BY s.start_time
     LIMIT 6`;

  const byCurrency = new Map<string, { planned: number; spent: number }>();
  for (const t of trips) {
    const c = byCurrency.get(t.currency) ?? { planned: 0, spent: 0 };
    c.planned += signedToMinor(t.totalPlanned);
    c.spent += signedToMinor(t.totalSpent);
    byCurrency.set(t.currency, c);
  }
  return {
    totals: {
      trips: trips.length,
      activeTrips: trips.filter((t) => ["planning", "confirmed", "ongoing"].includes(t.status)).length,
      conflicts: trips.reduce((s, t) => s + t.conflictCount, 0),
      tripsWithConflicts: trips.filter((t) => t.conflictCount > 0).length,
    },
    money: [...byCurrency.entries()].map(([currency, v]) => ({
      currency, planned: fromMinor(v.planned), spent: fromMinor(v.spent),
      utilizationPct: v.planned > 0 ? Math.round((v.spent / v.planned) * 1000) / 10 : null,
    })),
    upcoming: upcoming.map((u) => ({
      activityId: u.mongo_doc_id, title: u.title, slotType: u.slot_type, tripId: u.trip_id, tripName: u.trip_name,
      startTime: formatLocalDateTime(u.start_time), endTime: formatLocalDateTime(u.end_time),
    })),
  };
}
