// ============================================
// Expenses API
// GET  /api/trips/[tripId]/expenses — List
// POST /api/trips/[tripId]/expenses — Create
// ============================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/postgres";
import { withTripRole } from "@/lib/auth/middleware";
import { createExpenseSchema } from "@/lib/utils/validation";
import { TokenPayload } from "@/lib/auth/jwt";

export const GET = withTripRole(
  ["organizer", "member", "viewer"],
  async (
    _request: NextRequest,
    context: { params: Promise<Record<string, string>> },
    _user: TokenPayload,
    _role: string
  ) => {
    try {
      const params = await context.params;
      const tripId = parseInt(params.tripId);

      const expenses = await prisma.expense.findMany({
        where: { tripId },
        include: {
          payer: { select: { userId: true, name: true } },
          splits: {
            include: {
              user: { select: { userId: true, name: true } },
            },
          },
        },
        orderBy: { expenseDate: "desc" },
      });

      return NextResponse.json({ success: true, data: expenses });
    } catch (error) {
      console.error("List expenses error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }
);

export const POST = withTripRole(
  ["organizer", "member"],
  async (
    request: NextRequest,
    context: { params: Promise<Record<string, string>> },
    user: TokenPayload,
    _role: string
  ) => {
    try {
      const params = await context.params;
      const tripId = parseInt(params.tripId);
      const body = await request.json();
      const parsed = createExpenseSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: "Validation failed", details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      // Use a transaction for expense + splits (demonstrates ACID)
      const expense = await prisma.$transaction(async (tx) => {
        const newExpense = await tx.expense.create({
          data: {
            tripId,
            paidBy: user.userId,
            category: parsed.data.category,
            amount: parsed.data.amount,
            description: parsed.data.description,
            expenseDate: new Date(parsed.data.expenseDate),
          },
        });

        // Create splits if provided
        if (parsed.data.splits && parsed.data.splits.length > 0) {
          await tx.expenseSplit.createMany({
            data: parsed.data.splits.map((split) => ({
              expenseId: newExpense.expenseId,
              userId: split.userId,
              shareAmount: split.shareAmount,
            })),
          });
        }

        return tx.expense.findUnique({
          where: { expenseId: newExpense.expenseId },
          include: {
            payer: { select: { userId: true, name: true } },
            splits: {
              include: {
                user: { select: { userId: true, name: true } },
              },
            },
          },
        });
      });

      return NextResponse.json(
        { success: true, data: expense },
        { status: 201 }
      );
    } catch (error) {
      console.error("Create expense error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }
);
