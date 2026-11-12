// ============================================
// Budget service
// ============================================
// Planned vs. spent comes from the SQL view vw_budget_vs_actual, member
// balances from vw_member_balances (both computed from persisted rows).
// MongoDB contributes the ESTIMATED cost of planned activities via an
// aggregation pipeline.
// ============================================
import prisma from "@/lib/db/postgres";
import { getActivitiesCollection } from "@/lib/db/mongodb";
import { BalanceRow, BudgetOverview, BudgetRow } from "@/types";
import { decimalToString, fromMinor, percent, signedToMinor } from "@/lib/utils/money";

interface ViewRow { category: string; planned: unknown; spent: unknown; remaining: unknown; utilization_pct: unknown }
interface BalRow {
  user_id: number; name: string; member_role: string;
  total_paid: unknown; total_share: unknown; settlements_made: unknown; settlements_received: unknown; net_balance: unknown; dues_outstanding: unknown;
}

export async function getEstimatedActivityCosts(tripId: number) {
  const col = await getActivitiesCollection();
  const rows = await col
    .aggregate([
      { $match: { tripId } },
      { $group: { _id: "$slotType", totalEstimated: { $sum: "$estimatedCost.amount" }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, category: "$_id", totalEstimated: 1, count: 1 } },
    ])
    .toArray();
  return rows.map((r) => ({
    category: r.category as string,
    totalEstimated: decimalToString(r.totalEstimated?.toString?.() ?? r.totalEstimated ?? "0"),
    count: Number(r.count),
  }));
}

export async function getBudgetOverview(tripId: number): Promise<BudgetOverview> {
  const [viewRows, balRows, estimated] = await Promise.all([
    prisma.$queryRaw<ViewRow[]>`
      SELECT category, planned, spent, remaining, utilization_pct
        FROM vw_budget_vs_actual WHERE trip_id = ${tripId} ORDER BY category`,
    prisma.$queryRaw<BalRow[]>`
      SELECT user_id, name, member_role, total_paid, total_share, settlements_made, settlements_received, net_balance, dues_outstanding
        FROM vw_member_balances WHERE trip_id = ${tripId} ORDER BY net_balance DESC, name`,
    getEstimatedActivityCosts(tripId),
  ]);

  const rows: BudgetRow[] = viewRows.map((r) => ({
    category: r.category,
    planned: decimalToString(r.planned),
    spent: decimalToString(r.spent),
    remaining: decimalToString(r.remaining),
    utilizationPct: r.utilization_pct === null ? null : Number(r.utilization_pct),
  }));
  const planned = rows.reduce((s, r) => s + signedToMinor(r.planned), 0);
  const spent = rows.reduce((s, r) => s + signedToMinor(r.spent), 0);
  const estimatedTotal = estimated.reduce((s, r) => s + signedToMinor(r.totalEstimated), 0);

  const balances: BalanceRow[] = balRows.map((b) => ({
    userId: b.user_id,
    name: b.name,
    memberRole: b.member_role,
    totalPaid: decimalToString(b.total_paid),
    totalShare: decimalToString(b.total_share),
    settlementsMade: decimalToString(b.settlements_made),
    settlementsReceived: decimalToString(b.settlements_received),
    netBalance: decimalToString(b.net_balance),
    duesOutstanding: decimalToString(b.dues_outstanding),
  }));

  return {
    rows,
    totals: { planned: fromMinor(planned), spent: fromMinor(spent), remaining: fromMinor(planned - spent), utilizationPct: percent(spent, planned) },
    estimatedActivityCosts: estimated,
    estimatedActivitiesTotal: fromMinor(estimatedTotal),
    balances,
  };
}
