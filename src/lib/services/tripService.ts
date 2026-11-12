// ============================================
// Trip service
// ============================================
import prisma from "@/lib/db/postgres";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { notFound } from "@/lib/api/errors";
import { TripRole } from "@/lib/api/route";
import { TripSummary } from "@/types";
import { createTripSchema, tripListQuerySchema, updateTripSchema } from "@/lib/utils/validation";
import { formatDateOnly, parseDateOnly } from "@/lib/utils/time";
import { decimalToString } from "@/lib/utils/money";
import { getTripConflicts } from "./conflictEngine";
import { purgeTripDocuments } from "./activityService";

/** The destination with the longest stay (ties: earliest). */
function mainDestination(ds: { name: string; arrivalDate: Date; departureDate: Date }[]): string | null {
  let best: (typeof ds)[number] | null = null;
  for (const d of ds) {
    if (!best || d.departureDate.getTime() - d.arrivalDate.getTime() > best.departureDate.getTime() - best.arrivalDate.getTime()) best = d;
  }
  return best?.name ?? null;
}

export async function listTrips(userId: number, query: z.infer<typeof tripListQuerySchema>): Promise<TripSummary[]> {
  const where: Prisma.TripMemberWhereInput = {
    userId,
    status: "active",
    trip: {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { tripName: { contains: query.q, mode: "insensitive" } },
              { description: { contains: query.q, mode: "insensitive" } },
              { destinations: { some: { OR: [{ name: { contains: query.q, mode: "insensitive" } }, { location: { contains: query.q, mode: "insensitive" } }] } } },
            ],
          }
        : {}),
    },
  };
  const orderBy: Prisma.TripMemberOrderByWithRelationInput =
    query.sort === "name" ? { trip: { tripName: "asc" } } : { trip: { startDate: query.sort === "start_desc" ? "desc" : "asc" } };

  const memberships = await prisma.tripMember.findMany({
    where,
    orderBy,
    include: {
      trip: {
        include: {
          creator: { select: { name: true } },
          _count: { select: { members: { where: { status: "active" } } } },
          destinations: { orderBy: { arrivalDate: "asc" }, select: { name: true, arrivalDate: true, departureDate: true } },
        },
      },
    },
  });
  if (memberships.length === 0) return [];

  const ids = memberships.map((m) => m.tripId);
  const money = await prisma.$queryRaw<{ trip_id: number; planned: unknown; spent: unknown }[]>`
    SELECT t.trip_id,
           (SELECT COALESCE(SUM(planned_amount), 0) FROM budgets  b WHERE b.trip_id = t.trip_id) AS planned,
           (SELECT COALESCE(SUM(amount), 0)         FROM expenses e WHERE e.trip_id = t.trip_id) AS spent
      FROM trips t WHERE t.trip_id IN (${Prisma.join(ids)})`;
  const moneyById = new Map(money.map((m) => [m.trip_id, m]));
  const conflictCounts = await Promise.all(ids.map(async (id) => [id, (await getTripConflicts(id)).length] as const));
  const conflictsById = new Map(conflictCounts);

  return memberships.map((m) => ({
    tripId: m.tripId,
    tripName: m.trip.tripName,
    description: m.trip.description,
    startDate: formatDateOnly(m.trip.startDate),
    endDate: formatDateOnly(m.trip.endDate),
    currency: m.trip.currency,
    status: m.trip.status,
    memberRole: m.memberRole as TripRole,
    memberCount: m.trip._count.members,
    creatorName: m.trip.creator.name,
    primaryDestination: mainDestination(m.trip.destinations),
    conflictCount: conflictsById.get(m.tripId) ?? 0,
    totalPlanned: decimalToString(moneyById.get(m.tripId)?.planned),
    totalSpent: decimalToString(moneyById.get(m.tripId)?.spent),
  }));
}

export async function createTrip(userId: number, input: z.infer<typeof createTripSchema>) {
  return prisma.$transaction(async (tx) => {
    const trip = await tx.trip.create({
      data: {
        tripName: input.tripName, description: input.description, currency: input.currency,
        startDate: parseDateOnly(input.startDate), endDate: parseDateOnly(input.endDate), createdBy: userId,
      },
    });
    await tx.tripMember.create({ data: { tripId: trip.tripId, userId, memberRole: "organizer" } });
    if (input.primaryDestination) {
      await tx.destination.create({
        data: {
          tripId: trip.tripId, name: input.primaryDestination, location: input.primaryDestination,
          arrivalDate: trip.startDate, departureDate: trip.endDate,
        },
      });
    }
    return trip;
  });
}

export async function getTripDetail(tripId: number, role: TripRole) {
  const trip = await prisma.trip.findUnique({
    where: { tripId },
    include: {
      creator: { select: { userId: true, name: true } },
      _count: { select: { transports: true, accommodations: true, itinerarySlots: true, expenses: true, destinations: true } },
    },
  });
  if (!trip) throw notFound("Trip not found");
  return {
    tripId: trip.tripId, tripName: trip.tripName, description: trip.description,
    startDate: formatDateOnly(trip.startDate), endDate: formatDateOnly(trip.endDate),
    currency: trip.currency, status: trip.status, creator: trip.creator, memberRole: role,
    counts: trip._count,
  };
}

export async function updateTrip(tripId: number, input: z.infer<typeof updateTripSchema>) {
  const data: Prisma.TripUpdateInput = {};
  if (input.tripName !== undefined) data.tripName = input.tripName;
  if (input.description !== undefined) data.description = input.description || null;
  if (input.startDate) data.startDate = parseDateOnly(input.startDate);
  if (input.endDate) data.endDate = parseDateOnly(input.endDate);
  if (input.currency) data.currency = input.currency;
  if (input.status) data.status = input.status;
  // Date-order against the stored value when only one end is sent; shrink guard is a DB trigger.
  return prisma.trip.update({ where: { tripId }, data });
}

export async function deleteTrip(tripId: number) {
  await prisma.trip.delete({ where: { tripId } }); // ON DELETE CASCADE removes every child row
  await purgeTripDocuments(tripId);
}
