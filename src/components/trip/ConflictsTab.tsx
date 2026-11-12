"use client";

import { useState } from "react";
import { Badge, ErrorBanner, Loading } from "@/components/ui";
import { api, errorMessage, useFetch } from "@/lib/client/api";
import { fmtDateTime, fmtTime } from "@/lib/client/format";
import type { Conflict } from "@/types";
import { TripCtx } from "./shared";

interface Data { conflicts: Conflict[]; summary: { total: number; hard: number; soft: number } }

export default function ConflictsTab({ ctx, onLoaded }: { ctx: TripCtx; onLoaded?: () => void }) {
  const { data, error, loading, reload } = useFetch<Data>(`/api/trips/${ctx.trip.tripId}/conflicts`);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const apply = async (c: Conflict) => {
    if (!c.suggestion || !c.subject.mongoDocId || busyKey) return;
    setBusyKey(c.key);
    setActionError(null);
    try {
      await api(`/api/trips/${ctx.trip.tripId}/activities/${c.subject.mongoDocId}`, { method: "PUT", body: { startTime: c.suggestion.startTime, endTime: c.suggestion.endTime } });
      ctx.onChanged();
      await reload();
      onLoaded?.();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusyKey(null);
    }
  };

  if (error) return <div className="mt-6"><ErrorBanner message={error.message} onRetry={reload} /></div>;
  if (loading && !data) return <Loading text="Auditing your schedule…" />;
  const list = data?.conflicts ?? [];

  return (
    <div className="mt-6 space-y-4">
      <div className="p-5 border border-slate-200 bg-white shadow-sm">
        <h3 className="text-base font-bold text-slate-950 mb-1">Schedule Collision Center</h3>
        <p className="text-xs text-slate-600">
          TripSync audits every activity against transport departures (with boarding buffers), hotel check-in/check-out windows and other activities. Hard conflicts involve a booking; soft conflicts are two activities at the same time.
        </p>
        {actionError && <div className="mt-3"><ErrorBanner message={actionError} /></div>}

        <div className="mt-4 space-y-3">
          {list.length > 0 ? (
            list.map((c) => (
              <div key={c.key} className="p-4 border border-amber-400 bg-amber-50/50">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2.5 border-b border-amber-200">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate-950">{c.subject.title}</span>
                      <Badge tone={c.severity === "hard" ? "red" : "amber"}>{c.severity === "hard" ? "Booking collision" : "Activity overlap"}</Badge>
                    </div>
                    <p className="text-xs text-slate-700 mt-1">{c.message}</p>
                  </div>
                  {c.subject.type === "activity" && c.suggestion && ctx.canEdit ? (
                    <button type="button" disabled={busyKey === c.key} onClick={() => apply(c)} className="px-3 py-1.5 text-xs font-bold text-black bg-amber-400 hover:bg-amber-300 border border-amber-500 rounded-none whitespace-nowrap self-start sm:self-auto disabled:opacity-50">
                      {busyKey === c.key ? "Moving…" : `Move to ${fmtTime(c.suggestion.startTime)} – ${fmtTime(c.suggestion.endTime)}`}
                    </button>
                  ) : c.subject.type === "transport" ? (
                    <button type="button" onClick={() => ctx.goToTab("logistics")} className="px-3 py-1.5 text-xs font-semibold border border-slate-300 bg-white hover:bg-slate-50 rounded-none whitespace-nowrap">Edit transport</button>
                  ) : null}
                </div>
                <div className="mt-2 text-[11px] font-mono text-slate-600">
                  {c.subject.title}: {fmtDateTime(c.subject.startTime)} → {fmtTime(c.subject.endTime)} • Overlaps: {c.other.title} ({fmtDateTime(c.other.startTime)} → {fmtTime(c.other.endTime)})
                  {c.suggestion && <> • Suggested free slot: {fmtDateTime(c.suggestion.startTime)} → {fmtTime(c.suggestion.endTime)}</>}
                </div>
              </div>
            ))
          ) : (
            <div className="p-6 border border-emerald-300 bg-emerald-50/40 text-center">
              <span className="text-2xl">✓</span>
              <h4 className="text-sm font-bold text-slate-950 mt-1">Schedule Clear</h4>
              <p className="text-xs text-slate-600 mt-0.5">All transit, stays and daily plans have safe buffers with zero overlaps.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
