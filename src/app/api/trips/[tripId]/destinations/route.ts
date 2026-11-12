// GET/POST /api/trips/[tripId]/destinations
import prisma from "@/lib/db/postgres";
import { ANY_ROLE, ORGANIZER, route } from "@/lib/api/route";
import { created, ok } from "@/lib/api/response";
import { destinationSchema } from "@/lib/utils/validation";
import { parseDateOnly } from "@/lib/utils/time";
import { destinationDTO } from "@/lib/services/mappers";

export const GET = route({ trip: ANY_ROLE }, async ({ tripId }) => {
  const rows = await prisma.destination.findMany({ where: { tripId }, orderBy: [{ arrivalDate: "asc" }, { destinationId: "asc" }] });
  return ok(rows.map(destinationDTO));
});

export const POST = route({ trip: ORGANIZER }, async (ctx) => {
  const d = await ctx.body(destinationSchema);
  const row = await prisma.destination.create({
    data: { tripId: ctx.tripId, name: d.name, location: d.location, arrivalDate: parseDateOnly(d.arrivalDate), departureDate: parseDateOnly(d.departureDate), notes: d.notes },
  });
  return created(destinationDTO(row), "Destination added");
});
