// DELETE /api/trips/[tripId]/budget/[category] — remove a planned category
import prisma from "@/lib/db/postgres";
import { ORGANIZER, route } from "@/lib/api/route";
import { ok } from "@/lib/api/response";
import { badRequest, notFound } from "@/lib/api/errors";
import { CATEGORIES } from "@/lib/utils/validation";
import { getBudgetOverview } from "@/lib/services/budgetService";

export const DELETE = route({ trip: ORGANIZER }, async (ctx) => {
  const category = ctx.params.category;
  if (!(CATEGORIES as readonly string[]).includes(category)) throw badRequest("Unknown category");
  const r = await prisma.budget.deleteMany({ where: { tripId: ctx.tripId, category } });
  if (r.count === 0) throw notFound("No budget set for that category");
  return ok(await getBudgetOverview(ctx.tripId), { message: "Budget removed" });
});
