// GET/POST /api/trips/[tripId]/expenses
import { ANY_ROLE, CAN_EDIT, route } from "@/lib/api/route";
import { created, ok } from "@/lib/api/response";
import { expenseSchema } from "@/lib/utils/validation";
import { createExpense, listExpenses } from "@/lib/services/expenseService";

export const GET = route({ trip: ANY_ROLE }, async ({ tripId }) => ok(await listExpenses(tripId)));

export const POST = route({ trip: CAN_EDIT }, async (ctx) => {
  const input = await ctx.body(expenseSchema);
  return created(await createExpense(ctx.tripId, ctx.user.userId, ctx.role!, input), "Expense recorded");
});
