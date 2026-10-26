// ============================================
// Budget API
// GET  /api/trips/[tripId]/budget — Budget summary
// POST /api/trips/[tripId]/budget — Create/update
// ============================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/postgres";
import { withTripRole } from "@/lib/auth/middleware";
import { createBudgetSchema } from "@/lib/utils/validation";
import { getFinancialOverview, getMemberExpenseBreakdown } from "@/lib/services/budgetService";
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

      const [overview, memberBreakdown] = await Promise.all([
        getFinancialOverview(tripId),
        getMemberExpenseBreakdown(tripId),
      ]);

      return NextResponse.json({
        success: true,
        data: { ...overview, memberBreakdown },
      });
    } catch (error) {
      console.error("Get budget error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }
);

export const POST = withTripRole(
  ["organizer"],
  async (
    request: NextRequest,
    context: { params: Promise<Record<string, string>> },
    _user: TokenPayload,
    _role: string
  ) => {
    try {
      const params = await context.params;
      const tripId = parseInt(params.tripId);
      const body = await request.json();
      const parsed = createBudgetSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: "Validation failed", details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      // Upsert — update if category already exists for this trip
      const budget = await prisma.budget.upsert({
        where: {
          tripId_category: {
            tripId,
            category: parsed.data.category,
          },
        },
        update: {
          plannedAmount: parsed.data.plannedAmount,
          remarks: parsed.data.remarks,
        },
        create: {
          tripId,
          category: parsed.data.category,
          plannedAmount: parsed.data.plannedAmount,
          remarks: parsed.data.remarks,
        },
      });

      return NextResponse.json(
        { success: true, data: budget },
        { status: 201 }
      );
    } catch (error) {
      console.error("Create budget error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }
);
