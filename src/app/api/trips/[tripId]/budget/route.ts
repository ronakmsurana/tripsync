// GET  /api/trips/[tripId]/budget — planned vs spent per category + balances
// POST /api/trips/[tripId]/budget — set the planned amount of a category (upsert)
import prisma from "@/lib/db/postgres";
import { ANY_ROLE, ORGANIZER, route } from "@/lib/api/route";
import { ok } from "@/lib/api/response";
import { budgetSchema } from "@/lib/utils/validation";
import { getBudgetOverview } from "@/lib/services/budgetService";

export const GET = route({ trip: ANY_ROLE }, async ({ tripId }) => ok(await getBudgetOverview(tripId)));

export const POST = route({ trip: ORGANIZER }, async (ctx) => {
  const d = await ctx.body(budgetSchema);
  await prisma.budget.upsert({
    where: { tripId_category: { tripId: ctx.tripId, category: d.category } },
    update: { plannedAmount: d.plannedAmount, remarks: d.remarks ?? null },
    create: { tripId: ctx.tripId, category: d.category, plannedAmount: d.plannedAmount, remarks: d.remarks },
  });
  return ok(await getBudgetOverview(ctx.tripId), { message: "Budget saved" });
});
