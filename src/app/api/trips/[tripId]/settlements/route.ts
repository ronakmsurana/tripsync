// POST /api/trips/[tripId]/settlements — settle a member's outstanding shares
import { CAN_EDIT, route } from "@/lib/api/route";
import { ok } from "@/lib/api/response";
import { forbidden } from "@/lib/api/errors";
import { settleSchema } from "@/lib/utils/validation";
import { settleMember } from "@/lib/services/expenseService";

export const POST = route({ trip: CAN_EDIT }, async (ctx) => {
  const input = await ctx.body(settleSchema);
  const target = input.userId ?? ctx.user.userId;
  if (target !== ctx.user.userId && ctx.role !== "organizer") throw forbidden("Only an organizer can settle for someone else.");
  const result = await settleMember(ctx.tripId, target, input.paymentMethod);
  return ok(result, { message: result.settledCount ? `Settled ${result.settledCount} share(s)` : "Nothing to settle" });
});
