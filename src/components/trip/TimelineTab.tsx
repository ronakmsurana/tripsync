"use client";

import { useState } from "react";
import { EmptyState, ErrorBanner, Loading } from "@/components/ui";
import { useFetch } from "@/lib/client/api";
import { dayKey, fmtDate, fmtTime, money } from "@/lib/client/format";
import type { TimelineItem } from "@/types";
import { TripCtx, slotIcon, transportIcon } from "./shared";

type Cat = "all" | "transit" | "stay" | "experience";
const CAT_OF = { transport: "transit", accommodation: "stay", activity: "experience" } as const;

export default function TimelineTab({ ctx }: { ctx: TripCtx }) {
  const { data, error, loading, reload } = useFetch<TimelineItem[]>(`/api/trips/${ctx.trip.tripId}/timeline`);
  const [cat, setCat] = useState<Cat>("all");

  if (error) return <div className="mt-6"><ErrorBanner message={error.message} onRetry={reload} /></div>;
  if (loading && !data) return <Loading text="Building your timeline…" />;

  const items = (data ?? []).filter((i) => cat === "all" || CAT_OF[i.itemType] === cat);

  return (
    <div className="mt-6 space-y-5">
      {/* Filter Pills */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-xs text-slate-500 font-semibold mr-1">View:</span>
          {(["all", "transit", "stay", "experience"] as const).map((c) => (
            <button key={c} type="button" onClick={() => setCat(c)} className={`px-2.5 py-1 text-xs font-semibold capitalize rounded-none border transition-colors ${cat === c ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"}`}>
              {c === "all" ? "All Entries" : c === "transit" ? "Flights & Transit" : c === "stay" ? "Hotels & Stays" : "Experiences"}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-500">{items.length} scheduled events</span>
      </div>

      {items.length === 0 ? (
        <EmptyState title="Nothing scheduled yet" hint="Add transit, a stay or an activity and it will appear here in chronological order." />
      ) : (
        <div className="space-y-3">
          {items.map((item, idx) => {
            const day = dayKey(item.startTime);
            const header = idx === 0 || dayKey(items[idx - 1].startTime) !== day;
            const hasConflict = item.conflictCount > 0;
            const icon = item.itemType === "accommodation" ? "🏨" : item.itemType === "transport" ? transportIcon(item.title.split(":")[0]) : slotIcon(item.slotType);
            return (
              <div key={`${item.itemType}-${item.itemId}`}>
                {header && <div className="pt-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">{fmtDate(day, { weekday: "long", day: "numeric", month: "long" })}</div>}
                <div className={`p-4 border transition-colors ${hasConflict ? "border-amber-400 bg-amber-50/40" : "border-slate-200 bg-white hover:border-slate-400"}`}>
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-2.5 border-b border-slate-100">
                    <div className="flex items-start gap-3">
                      <span className="text-xl mt-0.5">{icon}</span>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-slate-950">{item.title}</span>
                          <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase border border-slate-200 bg-slate-50 text-slate-700">{CAT_OF[item.itemType]}</span>
                          {item.bookingReference && <span className="text-[11px] font-mono text-slate-500">Ref: {item.bookingReference}</span>}
                          {item.status === "cancelled" && <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase border border-red-300 bg-red-50 text-red-800">Cancelled</span>}
                        </div>
                        {item.slotType && <div className="text-xs text-slate-500 mt-0.5 font-medium capitalize">{item.slotType}</div>}
                      </div>
                    </div>
                    <div className="text-left sm:text-right whitespace-nowrap">
                      <div className="text-xs font-mono font-bold text-slate-900">
                        {fmtTime(item.startTime)} → {dayKey(item.endTime) !== day ? `${fmtDate(item.endTime, { day: "numeric", month: "short" })}, ` : ""}{fmtTime(item.endTime)}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500">{fmtDate(item.startTime)}</div>
                    </div>
                  </div>

                  <div className="mt-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <p className="text-slate-600 leading-relaxed">{item.description}</p>
                    {item.cost !== null && Number(item.cost) > 0 && <div className="whitespace-nowrap font-mono font-bold text-slate-900">{money(item.cost, ctx.trip.currency)}</div>}
                  </div>

                  {item.tags && item.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">{item.tags.map((t) => <span key={t} className="text-[10px] font-mono text-slate-500">#{t}</span>)}</div>
                  )}

                  {hasConflict && (
                    <div className="mt-3 p-3 border border-amber-300 bg-amber-50 flex items-start justify-between gap-3 text-xs">
                      <div className="text-amber-900"><strong>⚠️ Schedule Clash:</strong> this entry overlaps {item.conflictCount} other item{item.conflictCount === 1 ? "" : "s"}.</div>
                      <button type="button" onClick={() => ctx.goToTab("conflicts")} className="px-3 py-1 text-xs font-bold text-black bg-amber-400 hover:bg-amber-300 border border-amber-500 rounded-none whitespace-nowrap">
                        Review &amp; fix
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
