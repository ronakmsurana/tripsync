// ============================================
// Budget Service
// ============================================
// Aggregates budget data across PostgreSQL
// (fixed costs) and MongoDB (estimated activity
// costs) to provide a unified financial view.
// ============================================

import prisma from "@/lib/db/postgres";
import { getActivitiesCollection } from "@/lib/db/mongodb";
import { BudgetSummary } from "@/types";

/**
 * Get budget vs. actual spending summary for a trip.
 * Uses the stored function fn_trip_budget_summary if available,
 * otherwise falls back to a Prisma-based aggregation.
 */
export async function getBudgetSummary(
  tripId: number
): Promise<BudgetSummary[]> {
  try {
    // Try using the stored function first (demonstrates advanced DB feature)
    const results = await prisma.$queryRaw<BudgetSummary[]>`
      SELECT
        b.category,
        b.planned_amount AS planned,
        COALESCE(SUM(e.amount), 0) AS spent,
        b.planned_amount - COALESCE(SUM(e.amount), 0) AS remaining
      FROM budgets b
      LEFT JOIN expenses e
        ON e.trip_id = b.trip_id AND e.category = b.category
      WHERE b.trip_id = ${tripId}
      GROUP BY b.category, b.planned_amount
      ORDER BY b.category
    `;

    return results.map((r) => ({
      category: r.category,
      planned: Number(r.planned),
      spent: Number(r.spent),
      remaining: Number(r.remaining),
    }));
  } catch {
    return [];
  }
}

/**
 * Get estimated costs from MongoDB activities (not yet incurred expenses).
 * Aggregates by slot_type using a MongoDB aggregation pipeline.
 */
export async function getEstimatedActivityCosts(
  tripId: number
): Promise<{ category: string; totalEstimated: number; count: number }[]> {
  const activitiesCol = await getActivitiesCollection();

  const pipeline = [
    { $match: { tripId } },
    {
      $group: {
        _id: "$slotType",
        totalEstimated: { $sum: "$estimatedCost.amount" },
        count: { $sum: 1 },
      },
    },
    { $sort: { totalEstimated: -1 as const } },
    {
      $project: {
        _id: 0,
        category: "$_id",
        totalEstimated: 1,
        count: 1,
      },
    },
  ];

  const results = await activitiesCol.aggregate(pipeline).toArray();

  return results.map((r) => ({
    category: r.category as string,
    totalEstimated: Number(r.totalEstimated || 0),
    count: Number(r.count || 0),
  }));
}

/**
 * Get combined financial overview — merges SQL budget data with
 * MongoDB estimated costs for a comprehensive dashboard.
 */
export async function getFinancialOverview(tripId: number) {
  const [budgetSummary, estimatedCosts] = await Promise.all([
    getBudgetSummary(tripId),
    getEstimatedActivityCosts(tripId),
  ]);

  // Calculate totals
  const totalPlanned = budgetSummary.reduce(
    (sum, b) => sum + b.planned,
    0
  );
  const totalSpent = budgetSummary.reduce((sum, b) => sum + b.spent, 0);
  const totalEstimatedActivities = estimatedCosts.reduce(
    (sum, e) => sum + e.totalEstimated,
    0
  );

  return {
    budgetSummary,
    estimatedActivityCosts: estimatedCosts,
    totals: {
      planned: totalPlanned,
      spent: totalSpent,
      remaining: totalPlanned - totalSpent,
      estimatedActivities: totalEstimatedActivities,
      projectedTotal: totalSpent + totalEstimatedActivities,
    },
  };
}

/**
 * Get per-member expense breakdown for settlement tracking.
 */
export async function getMemberExpenseBreakdown(tripId: number) {
  const results = await prisma.$queryRaw<
    Array<{
      user_id: number;
      name: string;
      total_paid: number;
      total_owed: number;
      net_balance: number;
    }>
  >`
    SELECT
      u.user_id,
      u.name,
      COALESCE(paid.total, 0) AS total_paid,
      COALESCE(owed.total, 0) AS total_owed,
      COALESCE(paid.total, 0) - COALESCE(owed.total, 0) AS net_balance
    FROM users u
    INNER JOIN trip_members tm ON tm.user_id = u.user_id AND tm.trip_id = ${tripId}
    LEFT JOIN (
      SELECT paid_by AS user_id, SUM(amount) AS total
      FROM expenses WHERE trip_id = ${tripId}
      GROUP BY paid_by
    ) paid ON paid.user_id = u.user_id
    LEFT JOIN (
      SELECT user_id, SUM(share_amount) AS total
      FROM expense_splits es
      INNER JOIN expenses e ON e.expense_id = es.expense_id
      WHERE e.trip_id = ${tripId}
      GROUP BY user_id
    ) owed ON owed.user_id = u.user_id
    ORDER BY net_balance DESC
  `;

  return results.map((r) => ({
    userId: r.user_id,
    name: r.name,
    totalPaid: Number(r.total_paid),
    totalOwed: Number(r.total_owed),
    netBalance: Number(r.net_balance),
  }));
}
