"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import { Badge, DateInput, EmptyState, ErrorBanner, Field, Loading, Modal, Stat, btnPrimary, btnSecondary } from "@/components/ui";
import { api, ApiClientError, errorMessage, useAuth, useFetch } from "@/lib/client/api";
import { cap, fmtDateDDMMYYYY, fmtDateTime, money } from "@/lib/client/format";
import type { TripSummary } from "@/types";

type Filter = "all" | "planning" | "confirmed" | "ongoing" | "completed";
interface DashboardData {
  totals: { trips: number; activeTrips: number; conflicts: number; tripsWithConflicts: number };
  money: { currency: string; planned: string; spent: string; utilizationPct: number | null }[];
  upcoming: { activityId: string; title: string; slotType: string; tripId: number; tripName: string; startTime: string; endTime: string }[];
}

const isoDay = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [sort, setSort] = useState<"start_asc" | "start_desc" | "name">("start_asc");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const params = new URLSearchParams({ sort });
  if (filter !== "all") params.set("status", filter);
  if (debounced) params.set("q", debounced);
  const trips = useFetch<TripSummary[]>(`/api/trips?${params}`);
  const stats = useFetch<DashboardData>("/api/dashboard");

  // ---- create-trip modal ----
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ tripName: "", description: "", startDate: isoDay(14), endDate: isoDay(18), currency: "INR", primaryDestination: "" });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  const handleCreateTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setFormError(null);
    setFieldErrors({});
    try {
      const created = await api<{ tripId: number }>("/api/trips", { method: "POST", body: { ...form, primaryDestination: form.primaryDestination || undefined, description: form.description || undefined } });
      router.push(`/dashboard/${created.tripId}`);
    } catch (err) {
      setFormError(errorMessage(err));
      if (err instanceof ApiClientError) setFieldErrors(err.fields);
      setSaving(false);
    }
  };

  const list = trips.data ?? [];
  const money1 = stats.data?.money ?? [];
  const next = stats.data?.upcoming[0];
  const roleLabel = user?.role === "admin" ? "Administrator" : "Traveler";

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {/* Dashboard Title Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold text-slate-950 tracking-tight">Trips &amp; Expeditions</h1>
              <span className="px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider bg-slate-100 border border-slate-300 text-slate-700">{roleLabel}</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">Synchronized timelines, travel buffers, bookings, and group split accounting.</p>
          </div>

          <button type="button" onClick={() => setIsCreateOpen(true)} className="px-4 py-2.5 text-xs font-bold text-white bg-slate-950 hover:bg-slate-800 border border-slate-950 rounded-none transition-colors self-start sm:self-auto flex items-center gap-1.5">
            <span>+</span>
            <span>New Trip</span>
          </button>
        </div>

        {/* Crisp Metrics Bar */}
        {stats.error ? (
          <div className="mt-6"><ErrorBanner message={stats.error.message} onRetry={stats.reload} /></div>
        ) : (
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat title="Active Trips" value={stats.data ? stats.data.totals.activeTrips : "–"} sub={`${stats.data?.totals.trips ?? 0} total · planning, confirmed & ongoing`} />
            <Stat title="Upcoming Activities" value={stats.data ? stats.data.upcoming.length : "–"} sub={next ? `Next: ${next.title} · ${fmtDateTime(next.startTime)}` : "Nothing scheduled ahead"} />
            <Stat
              tone={stats.data && stats.data.totals.conflicts > 0 ? "amber" : "default"}
              title="Schedule Alerts"
              value={stats.data ? (stats.data.totals.conflicts === 0 ? "None" : `${stats.data.totals.conflicts} Collision${stats.data.totals.conflicts === 1 ? "" : "s"}`) : "–"}
              sub={stats.data ? (stats.data.totals.conflicts === 0 ? "All schedules are clear" : `Across ${stats.data.totals.tripsWithConflicts} trip${stats.data.totals.tripsWithConflicts === 1 ? "" : "s"} — action required`) : ""}
            />
            <Stat
              title="Total Group Spend"
              value={money1.length === 0 ? "–" : money1.length === 1 ? money(money1[0].spent, money1[0].currency) : "Mixed"}
              sub={money1.length === 1 ? (money1[0].utilizationPct === null ? "No budget set yet" : `${money1[0].utilizationPct}% of planned budget`) : money1.map((m) => money(m.spent, m.currency)).join(" · ")}
            />
          </div>
        )}

        {/* Filter Navigation */}
        <div className="mt-8 flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200 pb-2">
          <div className="flex items-center gap-1 flex-wrap">
            {(["all", "planning", "confirmed", "ongoing", "completed"] as const).map((tab) => (
              <button key={tab} type="button" onClick={() => setFilter(tab)} className={`px-3 py-1.5 text-xs font-semibold capitalize rounded-none border transition-colors ${filter === tab ? "bg-slate-900 text-white border-slate-900" : "text-slate-600 hover:text-slate-900 bg-white border-transparent hover:border-slate-300"}`}>
                {tab}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search trips or places…" aria-label="Search trips" className="input-sharp !w-52 !py-1.5 !text-xs" />
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort trips" className="input-sharp !w-36 !py-1.5 !text-xs">
              <option value="start_asc">Soonest first</option>
              <option value="start_desc">Latest first</option>
              <option value="name">Name A–Z</option>
            </select>
            <div className="text-xs text-slate-500 whitespace-nowrap">{list.length} trip{list.length === 1 ? "" : "s"}</div>
          </div>
        </div>

        {/* Trips Cards Grid */}
        {trips.error ? (
          <div className="mt-6"><ErrorBanner message={trips.error.message} onRetry={trips.reload} /></div>
        ) : trips.loading && !trips.data ? (
          <Loading text="Loading your trips…" />
        ) : list.length === 0 ? (
          <div className="mt-6">
            {debounced || filter !== "all" ? (
              <EmptyState title="No trips match your filters" hint="Try a different search or status." action={<button type="button" className={btnSecondary} onClick={() => { setQuery(""); setFilter("all"); }}>Clear filters</button>} />
            ) : (
              <EmptyState title="No trips yet" hint="Create your first trip to start planning itineraries, bookings and budgets." action={<button type="button" className={btnPrimary} onClick={() => setIsCreateOpen(true)}>+ New Trip</button>} />
            )}
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            {list.map((t) => {
              const hasConflict = t.conflictCount > 0;
              const planned = Number(t.totalPlanned);
              return (
                <div key={t.tripId} className="p-6 border border-slate-200 bg-white hover:border-slate-400 transition-colors shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono font-bold text-slate-500 uppercase">Trip #{t.tripId}</span>
                          <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase border border-slate-200 bg-slate-50 text-slate-700">{t.status}</span>
                          {hasConflict && <Badge tone="amber">⚠️ Schedule Alert</Badge>}
                        </div>
                        <h2 className="text-lg font-bold text-slate-950 mt-1.5">{t.tripName}</h2>
                      </div>
                      <span className="text-xs font-mono font-bold px-2 py-0.5 border border-slate-200 bg-slate-50 text-slate-700">{t.currency}</span>
                    </div>

                    <p className="text-xs text-slate-600 mt-3 leading-relaxed">{t.description || "No description yet."}</p>

                    {/* Trip Details Matrix */}
                    <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-slate-400 text-[11px] block">Dates</span>
                        <span className="text-slate-800 font-mono font-medium">{fmtDateDDMMYYYY(t.startDate)} → {fmtDateDDMMYYYY(t.endDate)}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[11px] block">Primary Area</span>
                        <span className="text-slate-800 font-medium truncate block">{t.primaryDestination || "Not specified"}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[11px] block">Organizer</span>
                        <span className="text-slate-800 font-medium">{t.creatorName}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[11px] block">Party</span>
                        <span className="text-slate-800 font-medium">{t.memberCount} Traveler{t.memberCount === 1 ? "" : "s"} · you: {cap(t.memberRole)}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-slate-400 text-[11px] block">Budget used</span>
                        <span className="text-slate-800 font-mono font-medium tabular-nums">
                          {money(t.totalSpent, t.currency)} {planned > 0 ? `of ${money(t.totalPlanned, t.currency)}` : "(no budget set)"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-200 flex items-center justify-between">
                    <div className="text-xs">
                      {hasConflict ? (
                        <span className="text-amber-700 font-medium">{t.conflictCount} conflict{t.conflictCount === 1 ? "" : "s"} to review</span>
                      ) : (
                        <span className="text-emerald-700 font-medium">✓ All transit &amp; stays synchronized</span>
                      )}
                    </div>
                    <Link href={`/dashboard/${t.tripId}`} className="px-4 py-2 text-xs font-bold text-white bg-slate-950 hover:bg-slate-800 border border-slate-950 rounded-none transition-colors">
                      Open Itinerary →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Sharp Create Trip Modal */}
      {isCreateOpen && (
        <Modal title="Create New Trip" onClose={() => !saving && setIsCreateOpen(false)} wide>
          <form onSubmit={handleCreateTrip} className="space-y-4">
            <ErrorBanner message={formError} />
            <Field text="Trip Name" error={fieldErrors.tripName}>
              <input type="text" value={form.tripName} onChange={set("tripName")} placeholder="e.g. Kerala Backwaters & Munnar Hills" required maxLength={200} className="input-sharp" />
            </Field>
            <Field text="Trip Summary" error={fieldErrors.description}>
              <textarea value={form.description} onChange={set("description")} placeholder="Outline trip focus and general itinerary..." rows={2} maxLength={2000} className="input-sharp" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field text="Start Date (DD/MM/YYYY)" error={fieldErrors.startDate}>
                <DateInput value={form.startDate} onChange={set("startDate")} required />
              </Field>
              <Field text="End Date (DD/MM/YYYY)" error={fieldErrors.endDate}>
                <DateInput value={form.endDate} min={form.startDate} onChange={set("endDate")} required />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field text="Primary Destination" error={fieldErrors.primaryDestination}>
                <input type="text" value={form.primaryDestination} onChange={set("primaryDestination")} placeholder="e.g. Munnar, Kerala" className="input-sharp" />
              </Field>
              <Field text="Currency" error={fieldErrors.currency}>
                <select value={form.currency} onChange={set("currency")} className="input-sharp">
                  <option value="INR">INR (₹)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                </select>
              </Field>
            </div>
            <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-200">
              <button type="button" onClick={() => setIsCreateOpen(false)} disabled={saving} className={btnSecondary}>Cancel</button>
              <button type="submit" disabled={saving} className={btnPrimary}>{saving ? "Saving…" : "Save & Open"}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
