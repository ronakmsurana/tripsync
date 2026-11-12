// GET/POST /api/trips/[tripId]/accommodation
import prisma from "@/lib/db/postgres";
import { ANY_ROLE, ORGANIZER, route } from "@/lib/api/route";
import { created, ok } from "@/lib/api/response";
import { accommodationSchema } from "@/lib/utils/validation";
import { parseLocalDateTime } from "@/lib/utils/time";
import { accommodationDTO, accommodationInclude } from "@/lib/services/mappers";
import { assertDestinationsInTrip } from "@/lib/services/bookingGuards";

export const GET = route({ trip: ANY_ROLE }, async ({ tripId }) => {
  const rows = await prisma.accommodation.findMany({ where: { tripId }, include: accommodationInclude, orderBy: { checkIn: "asc" } });
  return ok(rows.map(accommodationDTO));
});

export const POST = route({ trip: ORGANIZER }, async (ctx) => {
  const d = await ctx.body(accommodationSchema);
  await assertDestinationsInTrip(ctx.tripId, [d.destinationId]);
  const row = await prisma.accommodation.create({
    data: {
      tripId: ctx.tripId, destinationId: d.destinationId, name: d.name, address: d.address,
      checkIn: parseLocalDateTime(d.checkIn), checkOut: parseLocalDateTime(d.checkOut),
      bookingReference: d.bookingReference, cost: d.cost, status: d.status,
    },
    include: accommodationInclude,
  });
  return created(accommodationDTO(row), "Stay added");
});
