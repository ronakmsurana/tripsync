// ============================================
// Schedule conflict engine
// ============================================
// Fixed logistics (transport, hotel check-in / check-out) versus flexible
// activities. The rules live in PURE functions (easy to unit-test); the
// database is only used to load the data.
//
// Rules
//   * Transport occupies [departure - buffer, arrival]. The buffer depends on
//     the mode (flights need to be at the airport 2 h early, a car only 15 min).
//     An activity overlapping it is a HARD conflict.
//   * Hotel check-in occupies [check_in, check_in + 60 min], check-out occupies
//     [check_out - 60 min, check_out]. Overlap is a HARD conflict. Time in the
//     middle of a stay is free — being "at the hotel" is not a conflict.
//   * Two activities that overlap are a SOFT conflict (warning).
//   * Two transports that overlap are a HARD conflict.
// ============================================
import prisma from "@/lib/db/postgres";
import { Conflict } from "@/types";
import { formatLocalDateTime, MINUTE_MS } from "@/lib/utils/time";

export const TRANSPORT_BUFFER_MIN: Record<string, number> = {
  flight: 120, train: 45, bus: 30, ferry: 45, car: 15, other: 15,
};
export const CHECK_WINDOW_MIN = 60;
const STEP_MIN = 15;

export interface Block {
  type: "transport" | "accommodation_in" | "accommodation_out";
  id: number;
  title: string;
  start: Date;
  end: Date;
  /** Real (un-buffered) times, shown to the user. */
  realStart: Date;
  realEnd: Date;
}

export interface SlotLike {
  slotId: number;
  mongoDocId: string;
  title: string;
  startTime: Date;
  endTime: Date;
}
export interface TransportLike {
  transportId: number; transportType: string; provider: string; departureTime: Date; arrivalTime: Date; status: string;
}
export interface AccommodationLike {
  accommodationId: number; name: string; checkIn: Date; checkOut: Date; status: string;
}

const overlaps = (aS: Date, aE: Date, bS: Date, bE: Date) => aS < bE && aE > bS;
const add = (d: Date, min: number) => new Date(d.getTime() + min * MINUTE_MS);

export function wall(d: Date): string {
  return d.toLocaleString("en-GB", {
    timeZone: "UTC", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

export function buildBlocks(transports: TransportLike[], accommodations: AccommodationLike[]): Block[] {
  const blocks: Block[] = [];
  for (const t of transports) {
    if (t.status === "cancelled") continue;
    const buffer = TRANSPORT_BUFFER_MIN[t.transportType] ?? 15;
    blocks.push({
      type: "transport", id: t.transportId, title: `${t.transportType}: ${t.provider}`,
      start: add(t.departureTime, -buffer), end: t.arrivalTime, realStart: t.departureTime, realEnd: t.arrivalTime,
    });
  }
  for (const a of accommodations) {
    if (a.status === "cancelled") continue;
    blocks.push({
      type: "accommodation_in", id: a.accommodationId, title: `${a.name} check-in`,
      start: a.checkIn, end: add(a.checkIn, CHECK_WINDOW_MIN), realStart: a.checkIn, realEnd: add(a.checkIn, CHECK_WINDOW_MIN),
    });
    blocks.push({
      type: "accommodation_out", id: a.accommodationId, title: `${a.name} check-out`,
      start: add(a.checkOut, -CHECK_WINDOW_MIN), end: a.checkOut, realStart: add(a.checkOut, -CHECK_WINDOW_MIN), realEnd: a.checkOut,
    });
  }
  return blocks;
}

const iso = formatLocalDateTime;

function blockConflictText(b: Block): string {
  if (b.type === "transport") return `overlaps with ${b.title} (${wall(b.realStart)} → ${wall(b.realEnd)}, including boarding buffer)`;
  return `overlaps with ${b.title} (${wall(b.realStart)} → ${wall(b.realEnd)})`;
}

/** Conflicts of ONE candidate time window against the fixed blocks and other activities. */
export function findConflictsForWindow(
  subject: { id: number; mongoDocId?: string; title: string; start: Date; end: Date },
  blocks: Block[],
  otherSlots: SlotLike[]
): Conflict[] {
  const out: Conflict[] = [];
  for (const b of blocks) {
    if (!overlaps(subject.start, subject.end, b.start, b.end)) continue;
    out.push({
      key: `a${subject.id}-${b.type}${b.id}`,
      severity: "hard",
      kind: b.type === "transport" ? "activity_transport" : b.type === "accommodation_in" ? "activity_check_in" : "activity_check_out",
      subject: { type: "activity", id: subject.id, mongoDocId: subject.mongoDocId, title: subject.title, startTime: iso(subject.start), endTime: iso(subject.end) },
      other: { type: b.type === "transport" ? "transport" : "accommodation", id: b.id, title: b.title, startTime: iso(b.realStart), endTime: iso(b.realEnd) },
      message: `“${subject.title}” ${blockConflictText(b)}.`,
    });
  }
  for (const s of otherSlots) {
    if (s.slotId === subject.id) continue;
    if (!overlaps(subject.start, subject.end, s.startTime, s.endTime)) continue;
    out.push({
      key: `aa${Math.min(subject.id, s.slotId)}-${Math.max(subject.id, s.slotId)}`,
      severity: "soft",
      kind: "activity_activity",
      subject: { type: "activity", id: subject.id, mongoDocId: subject.mongoDocId, title: subject.title, startTime: iso(subject.start), endTime: iso(subject.end) },
      other: { type: "activity", id: s.slotId, title: s.title, startTime: iso(s.startTime), endTime: iso(s.endTime) },
      message: `“${subject.title}” overlaps with another activity, “${s.title}” (${wall(s.startTime)} → ${wall(s.endTime)}).`,
    });
  }
  return out;
}

/**
 * Earliest free window of the same length at or after the original start
 * (15-minute steps, inside [windowStart, windowEnd]); falls back to the latest
 * free window before it. Avoids fixed blocks AND other activities.
 */
export function suggestFreeWindow(
  subject: { id: number; start: Date; end: Date },
  blocks: Block[],
  otherSlots: SlotLike[],
  windowStart: Date,
  windowEnd: Date
): { start: Date; end: Date } | null {
  const duration = subject.end.getTime() - subject.start.getTime();
  const busy: [Date, Date][] = [
    ...blocks.map((b) => [b.start, b.end] as [Date, Date]),
    ...otherSlots.filter((s) => s.slotId !== subject.id).map((s) => [s.startTime, s.endTime] as [Date, Date]),
  ];
  const free = (start: Date) => {
    const end = new Date(start.getTime() + duration);
    if (start < windowStart || end > windowEnd) return false;
    return !busy.some(([bs, be]) => overlaps(start, end, bs, be));
  };
  const step = STEP_MIN * MINUTE_MS;
  for (let t = subject.start.getTime(); t + duration <= windowEnd.getTime(); t += step) {
    if (free(new Date(t))) return { start: new Date(t), end: new Date(t + duration) };
  }
  for (let t = subject.start.getTime() - step; t >= windowStart.getTime(); t -= step) {
    if (free(new Date(t))) return { start: new Date(t), end: new Date(t + duration) };
  }
  return null;
}

/** Every conflict in a trip (each pair reported once). */
export function findTripConflicts(
  slots: SlotLike[],
  transports: TransportLike[],
  accommodations: AccommodationLike[],
  window?: { start: Date; end: Date }
): Conflict[] {
  const blocks = buildBlocks(transports, accommodations);
  const seen = new Set<string>();
  const result: Conflict[] = [];

  for (const slot of slots) {
    const found = findConflictsForWindow(
      { id: slot.slotId, mongoDocId: slot.mongoDocId, title: slot.title, start: slot.startTime, end: slot.endTime },
      blocks,
      slots
    );
    for (const c of found) {
      if (seen.has(c.key)) continue;
      seen.add(c.key);
      if (window) {
        const s = suggestFreeWindow({ id: slot.slotId, start: slot.startTime, end: slot.endTime }, blocks, slots, window.start, window.end);
        if (s) c.suggestion = { startTime: iso(s.start), endTime: iso(s.end) };
      }
      result.push(c);
    }
  }

  const live = transports.filter((t) => t.status !== "cancelled");
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i], b = live[j];
      if (!overlaps(a.departureTime, a.arrivalTime, b.departureTime, b.arrivalTime)) continue;
      result.push({
        key: `tt${Math.min(a.transportId, b.transportId)}-${Math.max(a.transportId, b.transportId)}`,
        severity: "hard",
        kind: "transport_transport",
        subject: { type: "transport", id: a.transportId, title: `${a.transportType}: ${a.provider}`, startTime: iso(a.departureTime), endTime: iso(a.arrivalTime) },
        other: { type: "transport", id: b.transportId, title: `${b.transportType}: ${b.provider}`, startTime: iso(b.departureTime), endTime: iso(b.arrivalTime) },
        message: `${a.transportType}: ${a.provider} and ${b.transportType}: ${b.provider} are scheduled at the same time.`,
      });
    }
  }
  return result.sort((x, y) => (x.severity === y.severity ? x.subject.startTime.localeCompare(y.subject.startTime) : x.severity === "hard" ? -1 : 1));
}

// ---------------------------------------------------------------------
// Database loaders
// ---------------------------------------------------------------------
export async function loadSchedule(tripId: number) {
  const [trip, slots, transports, accommodations] = await Promise.all([
    prisma.trip.findUnique({ where: { tripId }, select: { startDate: true, endDate: true } }),
    prisma.itinerarySlot.findMany({ where: { tripId }, orderBy: { startTime: "asc" } }),
    prisma.transport.findMany({ where: { tripId } }),
    prisma.accommodation.findMany({ where: { tripId } }),
  ]);
  const window = trip ? { start: trip.startDate, end: new Date(trip.endDate.getTime() + 24 * 60 * MINUTE_MS) } : undefined;
  return { slots, transports, accommodations, window };
}

export async function getTripConflicts(tripId: number): Promise<Conflict[]> {
  const { slots, transports, accommodations, window } = await loadSchedule(tripId);
  return findTripConflicts(slots, transports, accommodations, window);
}

/** Preview for a window that is about to be saved (create / move). */
export async function checkWindow(
  tripId: number,
  start: Date,
  end: Date,
  title: string,
  excludeSlotId?: number
): Promise<{ conflicts: Conflict[]; suggestion?: { startTime: string; endTime: string } }> {
  const { slots, transports, accommodations, window } = await loadSchedule(tripId);
  const blocks = buildBlocks(transports, accommodations);
  const others = slots.filter((s) => s.slotId !== excludeSlotId);
  const subjectId = excludeSlotId ?? -1;
  const conflicts = findConflictsForWindow({ id: subjectId, title, start, end }, blocks, others);
  let suggestion: { startTime: string; endTime: string } | undefined;
  if (conflicts.length && window) {
    const s = suggestFreeWindow({ id: subjectId, start, end }, blocks, others, window.start, window.end);
    if (s) suggestion = { startTime: iso(s.start), endTime: iso(s.end) };
  }
  return { conflicts, suggestion };
}
