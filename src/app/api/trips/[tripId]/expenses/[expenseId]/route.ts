// PUT/DELETE /api/trips/[tripId]/expenses/[expenseId]
import { CAN_EDIT, route } from "@/lib/api/route";
import { ok } from "@/lib/api/response";
import { expenseSchema } from "@/lib/utils/validation";
import { deleteExpense, updateExpense } from "@/lib/services/expenseService";

export const PUT = route({ trip: CAN_EDIT }, async (ctx) => {
  const input = await ctx.body(expenseSchema);
  return ok(await updateExpense(ctx.tripId, ctx.int("expenseId"), ctx.user.userId, ctx.role!, input), { message: "Expense updated" });
});

export const DELETE = route({ trip: CAN_EDIT }, async (ctx) => {
  await deleteExpense(ctx.tripId, ctx.int("expenseId"), ctx.user.userId, ctx.role!);
  return ok({ deleted: true }, { message: "Expense deleted" });
});
