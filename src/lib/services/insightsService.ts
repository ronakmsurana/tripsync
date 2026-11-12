// MongoDB aggregation: one $facet pipeline produces several summaries at once.
import { getActivitiesCollection } from "@/lib/db/mongodb";
import { decimalToString } from "@/lib/utils/money";

export async function getTripInsights(tripId: number) {
  const col = await getActivitiesCollection();
  const [res] = await col
    .aggregate([
      { $match: { tripId } },
      {
        $facet: {
          byType: [
            { $group: { _id: "$slotType", count: { $sum: 1 }, totalMinutes: { $sum: "$estimatedDurationMinutes" }, estimated: { $sum: "$estimatedCost.amount" } } },
            { $sort: { count: -1, _id: 1 } },
          ],
          topTags: [
            { $unwind: "$tags" },
            { $group: { _id: "$tags", count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } },
            { $limit: 8 },
          ],
          totals: [{ $group: { _id: null, activities: { $sum: 1 }, minutes: { $sum: "$estimatedDurationMinutes" }, estimated: { $sum: "$estimatedCost.amount" } } }],
        },
      },
    ])
    .toArray();
  const totals = res?.totals?.[0];
  return {
    byType: (res?.byType ?? []).map((r: { _id: string; count: number; totalMinutes: number; estimated: unknown }) => ({
      slotType: r._id, count: r.count, totalMinutes: r.totalMinutes ?? 0, estimated: decimalToString(r.estimated?.toString?.() ?? r.estimated),
    })),
    topTags: (res?.topTags ?? []).map((r: { _id: string; count: number }) => ({ tag: r._id, count: r.count })),
    totals: {
      activities: totals?.activities ?? 0,
      minutes: totals?.minutes ?? 0,
      estimated: decimalToString(totals?.estimated?.toString?.() ?? totals?.estimated),
    },
  };
}
