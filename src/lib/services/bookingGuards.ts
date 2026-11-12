import prisma from "@/lib/db/postgres";
import { unprocessable } from "@/lib/api/errors";

/** Friendly check that every destination id belongs to the trip (the composite FK enforces it in the DB too). */
export async function assertDestinationsInTrip(tripId: number, ids: number[]) {
  const n = await prisma.destination.count({ where: { tripId, destinationId: { in: ids } } });
  if (n !== new Set(ids).size) throw unprocessable("Choose destinations that belong to this trip.", undefined, "BAD_DESTINATION");
}
