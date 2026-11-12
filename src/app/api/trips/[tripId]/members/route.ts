// GET/POST /api/trips/[tripId]/members
import prisma from "@/lib/db/postgres";
import { ANY_ROLE, ORGANIZER, route } from "@/lib/api/route";
import { created, ok } from "@/lib/api/response";
import { conflict, notFound } from "@/lib/api/errors";
import { addMemberSchema } from "@/lib/utils/validation";
import { MemberDTO, TripRole } from "@/types";

async function listMembers(tripId: number): Promise<MemberDTO[]> {
  const rows = await prisma.tripMember.findMany({
    where: { tripId, status: "active" },
    include: { user: { select: { userId: true, name: true, email: true } } },
    orderBy: [{ joinedAt: "asc" }, { userId: "asc" }],
  });
  return rows.map((m) => ({ userId: m.userId, name: m.user.name, email: m.user.email, memberRole: m.memberRole as TripRole, joinedAt: m.joinedAt.toISOString() }));
}

export const GET = route({ trip: ANY_ROLE }, async ({ tripId }) => ok(await listMembers(tripId)));

export const POST = route({ trip: ORGANIZER }, async (ctx) => {
  const d = await ctx.body(addMemberSchema);
  const target = await prisma.user.findUnique({ where: { email: d.email }, select: { userId: true, name: true, status: true } });
  if (!target || target.status !== "active") throw notFound("No active user with that email. They need to create a TripSync account first.");
  const existing = await prisma.tripMember.findUnique({ where: { tripId_userId: { tripId: ctx.tripId, userId: target.userId } } });
  if (existing?.status === "active") throw conflict("That person is already on this trip.", undefined, "ALREADY_MEMBER");
  if (existing) {
    await prisma.tripMember.update({ where: { tripId_userId: { tripId: ctx.tripId, userId: target.userId } }, data: { status: "active", memberRole: d.memberRole } });
  } else {
    await prisma.tripMember.create({ data: { tripId: ctx.tripId, userId: target.userId, memberRole: d.memberRole } });
  }
  return created(await listMembers(ctx.tripId), `${target.name} added as ${d.memberRole}`);
});
