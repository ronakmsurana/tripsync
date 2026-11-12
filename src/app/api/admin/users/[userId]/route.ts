// PATCH /api/admin/users/[userId] — change a user's global role or status (admin only)
import { z } from "zod";
import prisma from "@/lib/db/postgres";
import { route } from "@/lib/api/route";
import { ok } from "@/lib/api/response";
import { conflict, notFound } from "@/lib/api/errors";

const schema = z.object({ role: z.enum(["user", "admin"]).optional(), status: z.enum(["active", "suspended"]).optional() })
  .refine((d) => d.role || d.status, "Nothing to change");

export const PATCH = route({ admin: true }, async (ctx) => {
  const userId = ctx.int("userId");
  const d = await ctx.body(schema);
  if (userId === ctx.user.userId) throw conflict("You cannot change your own role or status.", undefined, "SELF_CHANGE");
  const r = await prisma.user.updateMany({ where: { userId }, data: d });
  if (r.count === 0) throw notFound("User not found");
  return ok({ userId, ...d }, { message: "User updated" });
});
