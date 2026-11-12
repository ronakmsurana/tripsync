"use client";

import { useState } from "react";
import { Badge, ConfirmButton, EmptyState, ErrorBanner, Loading, Notice, btnLink } from "@/components/ui";
import { api, errorMessage, useFetch } from "@/lib/client/api";
import { cap, fmtDateTime, fmtTime, money } from "@/lib/client/format";
import type { ActivityDTO, InsightsDTO, SearchResponse } from "@/types";
import ActivityForm from "./ActivityForm";
import { slotIcon, TripCtx, useAction } from "./shared";

export default function ActivitiesTab({ ctx, openNew, onNewHandled }: { ctx: TripCtx; openNew: boolean; onNewHandled: () => void }) {
  const base = `/api/trips/${ctx.trip.tripId}`;
  const acts = useFetch<ActivityDTO[]>(`${base}/activities`);
  const insights = useFetch<InsightsDTO>(`${base}/insights`);
  const [formState, setForm] = useState<null | { item?: ActivityDTO }>(null);
  // The header's "Add Activity" button sets openNew (owned by the page); it is cleared when the form closes.
  const form = formState ?? (openNew && ctx.canEdit ? {} : null);
  const closeForm = () => { setForm(null); onNewHandled(); };
  const del = useAction();

  // ---- search ----
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<"auto" | "semantic" | "keyword">("auto");
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const runSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim() || searching) return;
    setSearching(true); setSearchError(null);
    try {
      setResult(await api<SearchResponse>(`${base}/search`, { method: "POST", body: { query: q, mode } }));
    } catch (err) {
      setSearchError(errorMessage(err)); setResult(null);
    } finally { setSearching(false); }
  };

  const refresh = () => { acts.reload(); insights.reload(); ctx.onChanged(); };
  const mayChange = (a: ActivityDTO) => ctx.isOrganizer || (ctx.canEdit && a.createdBy === ctx.userId);

  if (acts.error) return <div className="mt-6"><ErrorBanner message={acts.error.message} onRetry={acts.reload} /></div>;
  if (!acts.data) return <Loading />;

  return (
    <div className="mt-6 space-y-6">
      {/* Search */}
      <div className="p-5 border border-slate-200 bg-white shadow-sm">
        <h3 className="text-base font-bold text-slate-950 mb-1">Find an activity</h3>
        <p className="text-xs text-slate-600 mb-3">Describe what you feel like doing. Semantic search matches meaning using vector embeddings in PostgreSQL (pgvector); keyword search uses PostgreSQL full-text search.</p>
        <form onSubmit={runSearch} className="flex flex-col sm:flex-row gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. peaceful morning near ancient ruins" aria-label="Search activities" maxLength={500} className="input-sharp flex-1" />
          <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} aria-label="Search mode" className="input-sharp !w-full sm:!w-44">
            <option value="auto">Auto (semantic first)</option>
            <option value="semantic">Semantic only</option>
            <option value="keyword">Keyword only</option>
          </select>
          <button type="submit" disabled={searching || !q.trim()} className="px-4 py-2 text-xs font-bold text-white bg-slate-950 hover:bg-slate-800 border border-slate-950 rounded-none disabled:opacity-50">{searching ? "Searching…" : "Search"}</button>
        </form>
        <div className="mt-3 space-y-2">
          <ErrorBanner message={searchError} />
          {result && (
            <>
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <Badge tone={result.modeUsed === "semantic" ? "blue" : "slate"}>{result.modeUsed === "semantic" ? "Semantic · pgvector cosine" : "Keyword · full-text"}</Badge>
                <span>{result.results.length} result{result.results.length === 1 ? "" : "s"} for “{result.query}”</span>
              </div>
              {result.notice && <Notice tone="warn">{result.notice}</Notice>}
              {result.results.length === 0 ? (
                <EmptyState title="No matching activities" hint="Try different words, or add more description and tags to your activities." />
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200">
                  {result.results.map((r) => (
                    <div key={r.id} className="p-3 flex items-start justify-between gap-3 text-xs">
                      <div>
                        <div className="font-bold text-slate-950">{slotIcon(r.slotType)} {r.title}</div>
                        <div className="text-slate-600 mt-0.5">{r.description}</div>
                        {r.startTime && <div className="font-mono text-[11px] text-slate-500 mt-1">{fmtDateTime(r.startTime)}</div>}
                      </div>
                      <span className="font-mono text-[11px] font-bold text-slate-700 whitespace-nowrap">{r.scoreLabel}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Itinerary mix (MongoDB $facet aggregation) */}
      {insights.data && insights.data.totals.activities > 0 && (
        <div className="p-4 border border-slate-200 bg-white shadow-sm text-xs">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <span className="font-bold text-slate-950">Itinerary mix</span>
            {insights.data.byType.map((t) => <span key={t.slotType} className="text-slate-600">{slotIcon(t.slotType)} {cap(t.slotType)}: <strong className="text-slate-900">{t.count}</strong> · {Math.round(t.totalMinutes / 60 * 10) / 10}h</span>)}
            <span className="text-slate-600">Est. cost: <strong className="font-mono text-slate-900">{money(insights.data.totals.estimated, ctx.trip.currency)}</strong></span>
          </div>
          {insights.data.topTags.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{insights.data.topTags.map((t) => <span key={t.tag} className="px-1.5 py-0.5 text-[10px] font-mono border border-slate-200 bg-slate-50 text-slate-600">#{t.tag} ×{t.count}</span>)}</div>}
        </div>
      )}

      <ErrorBanner message={del.error} />
      {acts.data.length === 0 ? (
        <EmptyState title="No activities planned" hint="Add sights, meals and experiences; TripSync will check them against your bookings." action={ctx.canEdit ? <button type="button" onClick={() => setForm({})} className="px-4 py-2 text-xs font-bold text-white bg-slate-950 border border-slate-950 rounded-none">+ Add Activity</button> : undefined} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {acts.data.map((a) => (
            <div key={a.id} className="p-4 border border-slate-300 bg-white shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-sm font-bold text-slate-950">{slotIcon(a.slotType)} {a.title}</h4>
                  <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase border border-slate-200 bg-slate-50 text-slate-700">{a.slotType}</span>
                </div>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{a.description || <em className="text-slate-400">No description</em>}</p>
                <div className="mt-2 text-[11px] font-mono text-slate-700">{fmtDateTime(a.startTime)} → {fmtTime(a.endTime)}</div>
                {a.tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{a.tags.map((t) => <span key={t} className="text-[10px] font-mono text-slate-500">#{t}</span>)}</div>}
              </div>
              <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="font-mono font-bold text-slate-900">{Number(a.estimatedCost.amount) > 0 ? money(a.estimatedCost.amount, a.estimatedCost.currency) : "Free / TBD"}</span>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-slate-400" title={a.indexed ? "Vector embedding stored" : "Searchable by keyword; embedding pending"}>{a.indexed ? "● vector" : "○ keyword only"}</span>
                  {a.documentMissing && <Badge tone="red">details missing</Badge>}
                  {mayChange(a) && (
                    <>
                      <button type="button" className={btnLink} onClick={() => setForm({ item: a })}>Edit</button>
                      <ConfirmButton disabled={del.busy} message={`Delete “${a.title}”?`} className="text-xs font-semibold text-red-600 hover:text-red-800" onConfirm={() => void del.run(async () => { await api(`/api/trips/${ctx.trip.tripId}/activities/${a.id}`, { method: "DELETE" }); refresh(); })}>Delete</ConfirmButton>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {form && <ActivityForm ctx={ctx} item={form.item} onClose={closeForm} onSaved={() => { closeForm(); refresh(); }} />}
    </div>
  );
}
