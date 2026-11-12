// ============================================
// Expense service (transactions)
// ============================================
import prisma from "@/lib/db/postgres";
import { Prisma } from "@prisma/client";
import { conflict, forbidden, notFound, unprocessable } from "@/lib/api/errors";
import { TripRole } from "@/lib/api/route";
import { ExpenseDTO } from "@/types";
import { fromMinor, splitEvenly, toMinor } from "@/lib/utils/money";
import { formatDateOnly, parseDateOnly } from "@/lib/utils/time";
import { z } from "zod";
import { expenseSchema } from "@/lib/utils/validation";
import { decimalToString } from "@/lib/utils/money";

export type ExpenseInput = z.infer<typeof expenseSchema>;

const include = {
  payer: { select: { userId: true, name: true } },
  splits: { include: { user: { select: { userId: true, name: true } } }, orderBy: { userId: "asc" as const } },
} satisfies Prisma.ExpenseInclude;

type ExpenseRow = Prisma.ExpenseGetPayload<{ include: typeof include }>;

export function toExpenseDTO(e: ExpenseRow): ExpenseDTO {
  return {
    expenseId: e.expenseId,
    tripId: e.tripId,
    paidBy: e.paidBy,
    category: e.category,
    amount: decimalToString(e.amount),
    description: e.description,
    expenseDate: formatDateOnly(e.expenseDate),
    payer: e.payer,
    splits: e.splits.map((s) => ({ userId: s.userId, name: s.user.name, shareAmount: decimalToString(s.shareAmount), isSettled: s.isSettled })),
  };
}

export async function listExpenses(tripId: number): Promise<ExpenseDTO[]> {
  const rows = await prisma.expense.findMany({
    where: { tripId }, include, orderBy: [{ expenseDate: "desc" }, { expenseId: "desc" }], take: 500,
  });
  return rows.map(toExpenseDTO);
}

async function resolveSplits(tripId: number, input: ExpenseInput) {
  const members = await prisma.tripMember.findMany({ where: { tripId, status: "active" }, select: { userId: true } });
  const memberIds = new Set(members.map((m) => m.userId));
  const total = toMinor(input.amount);

  let shares: { userId: number; shareMinor: number }[];
  if (input.splits) {
    shares = input.splits.map((s) => ({ userId: s.userId, shareMinor: toMinor(s.shareAmount) }));
    const sum = shares.reduce((a, s) => a + s.shareMinor, 0);
    if (sum !== total) throw unprocessable(`The shares add up to ${fromMinor(sum)} but the expense is ${fromMinor(total)}.`, undefined, "SPLIT_SUM");
  } else {
    const ids = [...new Set(input.splitWith ?? [...memberIds])];
    shares = splitEvenly(total, ids);
  }
  if (new Set(shares.map((s) => s.userId)).size !== shares.length) throw unprocessable("A member appears more than once in the split.");
  for (const s of shares) if (!memberIds.has(s.userId)) throw unprocessable("Everyone in the split must be an active member of this trip.", undefined, "NOT_A_MEMBER");
  return { shares, memberIds };
}

export async function createExpense(tripId: number, userId: number, role: TripRole, input: ExpenseInput): Promise<ExpenseDTO> {
  const paidBy = input.paidBy ?? userId;
  if (paidBy !== userId && role !== "organizer") throw forbidden("Only an organizer can record an expense paid by someone else.");
  const { shares, memberIds } = await resolveSplits(tripId, input);
  if (!memberIds.has(paidBy)) throw unprocessable("The payer must be an active member of this trip.", undefined, "NOT_A_MEMBER");

  const row = await prisma.$transaction(async (tx) => {
    const e = await tx.expense.create({
      data: {
        tripId, paidBy, category: input.category, amount: input.amount,
        description: input.description, expenseDate: parseDateOnly(input.expenseDate),
      },
    });
    await tx.expenseSplit.createMany({
      data: shares.map((s) => ({ expenseId: e.expenseId, userId: s.userId, shareAmount: fromMinor(s.shareMinor) })),
    });
    return tx.expense.findUniqueOrThrow({ where: { expenseId: e.expenseId }, include });
  });
  return toExpenseDTO(row);
}

async function loadEditable(tripId: number, expenseId: number, userId: number, role: TripRole) {
  const e = await prisma.expense.findFirst({ where: { expenseId, tripId }, include: { payments: { select: { paymentId: true } } } });
  if (!e) throw notFound("Expense not found");
  if (role !== "organizer" && e.paidBy !== userId) throw forbidden("Only the organizer or the person who paid can change this expense.");
  if (e.payments.length > 0) throw conflict("This expense already has settlement payments, so it can no longer be changed or deleted.", undefined, "HAS_PAYMENTS");
  return e;
}

export async function updateExpense(tripId: number, expenseId: number, userId: number, role: TripRole, input: ExpenseInput): Promise<ExpenseDTO> {
  const existing = await loadEditable(tripId, expenseId, userId, role);
  const paidBy = input.paidBy ?? existing.paidBy;
  if (paidBy !== existing.paidBy && role !== "organizer") throw forbidden("Only an organizer can change who paid.");
  const { shares, memberIds } = await resolveSplits(tripId, input);
  if (!memberIds.has(paidBy)) throw unprocessable("The payer must be an active member of this trip.", undefined, "NOT_A_MEMBER");

  const row = await prisma.$transaction(async (tx) => {
    await tx.expenseSplit.deleteMany({ where: { expenseId } });
    await tx.expense.update({
      where: { expenseId },
      data: { paidBy, category: input.category, amount: input.amount, description: input.description ?? null, expenseDate: parseDateOnly(input.expenseDate) },
    });
    await tx.expenseSplit.createMany({
      data: shares.map((s) => ({ expenseId, userId: s.userId, shareAmount: fromMinor(s.shareMinor) })),
    });
    return tx.expense.findUniqueOrThrow({ where: { expenseId }, include });
  });
  return toExpenseDTO(row);
}

export async function deleteExpense(tripId: number, expenseId: number, userId: number, role: TripRole): Promise<void> {
  await loadEditable(tripId, expenseId, userId, role);
  await prisma.expense.delete({ where: { expenseId } });
}

/** Settles all of a member's outstanding shares through the stored function (one atomic statement). */
export async function settleMember(tripId: number, userId: number, method: string) {
  const member = await prisma.tripMember.findUnique({ where: { tripId_userId: { tripId, userId } } });
  if (!member || member.status !== "active") throw notFound("That person is not a member of this trip.");
  const rows = await prisma.$transaction((tx) =>
    tx.$queryRaw<{ settled_count: number; total_settled: unknown }[]>`
      SELECT * FROM fn_settle_member_dues(${tripId}, ${userId}, ${method})`
  );
  return { settledCount: Number(rows[0]?.settled_count ?? 0), totalSettled: decimalToString(rows[0]?.total_settled) };
}
