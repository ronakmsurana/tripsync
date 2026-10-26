// ============================================
// Cross-Database Conflict Detection Engine
// ============================================
// The flagship feature of TripSync.
// Queries PostgreSQL to detect schedule overlaps
// between rigid logistics (transport, accommodation)
// and flexible activities (itinerary slots).
// ============================================

import prisma from "@/lib/db/postgres";
import { Conflict } from "@/types";

interface TimeWindow {
  startTime: Date;
  endTime: Date;
}

interface ConflictCandidate {
  conflict_source: string;
  item_id: number;
  item_title: string;
  start_time: Date;
  end_time: Date;
}

/**
 * Detect all schedule conflicts for a given time window within a trip.
 * Used when adding or moving a flexible activity.
 *
 * @param tripId - The trip to check within
 * @param window - The proposed time window
 * @param excludeSlotId - Optional slot ID to exclude (for editing existing slots)
 * @returns Array of detected conflicts with severity levels
 */
export async function detectConflicts(
  tripId: number,
  window: TimeWindow,
  excludeSlotId?: number
): Promise<Conflict[]> {
  // Use raw SQL for the UNION ALL query — more efficient than 3 separate Prisma queries
  const results = await prisma.$queryRaw<ConflictCandidate[]>`
    -- Check transport overlaps (HARD conflicts)
    SELECT
      'transport' AS conflict_source,
      t.transport_id AS item_id,
      CONCAT(t.transport_type, ': ', t.provider) AS item_title,
      t.departure_time AS start_time,
      t.arrival_time AS end_time
    FROM transports t
    WHERE t.trip_id = ${tripId}
      AND t.status != 'cancelled'
      AND t.departure_time < ${window.endTime}
      AND t.arrival_time > ${window.startTime}

    UNION ALL

    -- Check accommodation overlaps (HARD conflicts — you can't be
    -- at the hotel check-in desk AND doing an activity simultaneously)
    SELECT
      'accommodation' AS conflict_source,
      a.accommodation_id AS item_id,
      a.name AS item_title,
      a.check_in AS start_time,
      a.check_out AS end_time
    FROM accommodations a
    WHERE a.trip_id = ${tripId}
      AND a.status != 'cancelled'
      AND a.check_in < ${window.endTime}
      AND a.check_out > ${window.startTime}

    UNION ALL

    -- Check other activity overlaps (SOFT conflicts — warnings)
    SELECT
      'activity' AS conflict_source,
      s.slot_id AS item_id,
      s.title AS item_title,
      s.start_time AS start_time,
      s.end_time AS end_time
    FROM itinerary_slots s
    WHERE s.trip_id = ${tripId}
      AND (${excludeSlotId}::int IS NULL OR s.slot_id != ${excludeSlotId})
      AND s.start_time < ${window.endTime}
      AND s.end_time > ${window.startTime}

    ORDER BY start_time
  `;

  return results.map((row) => ({
    conflictSource: row.conflict_source as Conflict["conflictSource"],
    itemId: row.item_id,
    itemTitle: row.item_title,
    startTime: row.start_time.toISOString(),
    endTime: row.end_time.toISOString(),
    severity:
      row.conflict_source === "activity"
        ? ("soft" as const)
        : ("hard" as const),
    message: buildConflictMessage(row),
  }));
}

/**
 * Build a human-readable conflict message.
 */
function buildConflictMessage(candidate: ConflictCandidate): string {
  const start = new Date(candidate.start_time).toLocaleString();
  const end = new Date(candidate.end_time).toLocaleString();

  switch (candidate.conflict_source) {
    case "transport":
      return `Overlaps with transport "${candidate.item_title}" (${start} → ${end}). You cannot schedule activities during transit.`;
    case "accommodation":
      return `Overlaps with accommodation "${candidate.item_title}" check-in/check-out (${start} → ${end}).`;
    case "activity":
      return `Overlaps with another activity "${candidate.item_title}" (${start} → ${end}). Consider adjusting the schedule.`;
    default:
      return `Schedule conflict detected with ${candidate.item_title}.`;
  }
}

/**
 * Get all conflicts for an entire trip — used for the dashboard conflict overview.
 * Checks every itinerary slot against all transport and accommodation bookings.
 */
export async function getTripConflicts(tripId: number): Promise<Conflict[]> {
  // Fetch all itinerary slots for this trip
  const slots = await prisma.itinerarySlot.findMany({
    where: { tripId },
    orderBy: { startTime: "asc" },
  });

  const allConflicts: Conflict[] = [];

  for (const slot of slots) {
    const conflicts = await detectConflicts(
      tripId,
      { startTime: slot.startTime, endTime: slot.endTime },
      slot.slotId // exclude self
    );
    allConflicts.push(...conflicts);
  }

  // Deduplicate (same pair can appear twice)
  const seen = new Set<string>();
  return allConflicts.filter((c) => {
    const key = `${c.conflictSource}-${c.itemId}-${c.startTime}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
