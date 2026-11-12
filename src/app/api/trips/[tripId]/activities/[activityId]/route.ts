// GET/PUT/DELETE /api/trips/[tripId]/activities/[activityId]   (activityId = MongoDB ObjectId)
import prisma from "@/lib/db/postgres";
import { ANY_ROLE, CAN_EDIT, Ctx, route } from "@/lib/api/route";
import { ok } from "@/lib/api/response";
import { badRequest, forbidden, notFound } from "@/lib/api/errors";
import { updateActivitySchema } from "@/lib/utils/validation";
import { deleteActivity, getActivity, updateActivity } from "@/lib/services/activityService";

function activityId(ctx: Ctx): string {
  const id = ctx.params.activityId;
  if (!/^[0-9a-f]{24}$/.test(id)) throw badRequest("Invalid activity id");
  return id;
}

/** Organizers may change any activity; members only the ones they created. */
async function assertCanModify(ctx: Ctx, id: string) {
  const slot = await prisma.itinerarySlot.findFirst({ where: { mongoDocId: id, tripId: ctx.tripId }, select: { createdBy: true } });
  if (!slot) throw notFound("Activity not found");
  if (ctx.role !== "organizer" && slot.createdBy !== ctx.user.userId) throw forbidden("You can only change activities you created.");
}

export const GET = route({ trip: ANY_ROLE }, async (ctx) => ok(await getActivity(ctx.tripId, activityId(ctx))));

export const PUT = route({ trip: CAN_EDIT }, async (ctx) => {
  const id = activityId(ctx);
  await assertCanModify(ctx, id);
  const input = await ctx.body(updateActivitySchema);
  return ok(await updateActivity(ctx.tripId, id, input, ctx.user.userId), { message: "Activity updated" });
});

export const DELETE = route({ trip: CAN_EDIT }, async (ctx) => {
  const id = activityId(ctx);
  await assertCanModify(ctx, id);
  await deleteActivity(ctx.tripId, id);
  return ok({ deleted: true }, { message: "Activity deleted" });
});
