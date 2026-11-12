// PATCH/DELETE /api/trips/[tripId]/members/[userId]
import prisma from "@/lib/db/postgres";
import { ANY_ROLE, ORGANIZER, route } from "@/lib/api/route";
import { ok } from "@/lib/api/response";
import { conflict, forbidden, notFound } from "@/lib/api/errors";
import { updateMemberSchema } from "@/lib/utils/validation";

export const PATCH = route({ trip: ORGANIZER }, async (ctx) => {
  const userId = ctx.int("userId");
  const d = await ctx.body(updateMemberSchema);
  const r = await prisma.tripMember.updateMany({ where: { tripId: ctx.tripId, userId, status: "active" }, data: { memberRole: d.memberRole } });
  if (r.count === 0) throw notFound("Member not found");
  return ok({ userId, memberRole: d.memberRole }, { message: "Role updated" });
});

// An organizer may remove anyone; any member may leave. The last organizer can never be removed (DB trigger).
export const DELETE = route({ trip: ANY_ROLE }, async (ctx) => {
  const userId = ctx.int("userId");
  if (userId !== ctx.user.userId && ctx.role !== "organizer") throw forbidden("Only an organizer can remove other members.");
  const involved = await prisma.expense.count({
    where: { tripId: ctx.tripId, OR: [{ paidBy: userId }, { splits: { some: { userId } } }] },
  });
  if (involved > 0) throw conflict("This person is part of recorded expenses, so they can't be removed. Settle and delete those expenses first.", undefined, "HAS_EXPENSES");
  const r = await prisma.tripMember.deleteMany({ where: { tripId: ctx.tripId, userId } });
  if (r.count === 0) throw notFound("Member not found");
  return ok({ removed: true }, { message: userId === ctx.user.userId ? "You left the trip" : "Member removed" });
});
