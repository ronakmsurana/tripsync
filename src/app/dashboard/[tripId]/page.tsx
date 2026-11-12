"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import Navbar from "@/components/Navbar";
import ActivitiesTab from "@/components/trip/ActivitiesTab";
import BudgetTab from "@/components/trip/BudgetTab";
import ConflictsTab from "@/components/trip/ConflictsTab";
import LogisticsTab from "@/components/trip/LogisticsTab";
import MembersTab from "@/components/trip/MembersTab";
import TimelineTab from "@/components/trip/TimelineTab";
import { TripCtx, useAction } from "@/components/trip/shared";
import { ConfirmButton, DateInput, EmptyState, ErrorBanner, Field, Loading, Modal, btnPrimary, btnSecondary } from "@/components/ui";
import { api, useAuth, useFetch } from "@/lib/client/api";
import { cap, fmtDateDDMMYYYY, fmtDateTime, fmtTime } from "@/lib/client/format";
import type { Conflict, TripDetail } from "@/types";

type TabId = "timeline" | "logistics" | "activities" | "budget" | "conflicts" | "travelers";

export default function TripPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>("timeline");
  const [openNewActivity, setOpenNewActivity] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const trip = useFetch<TripDetail>(`/api/trips/${tripId}`);
  const conflicts = useFetch<{ conflicts: Conflict[]; summary: { total: number; hard: number; soft: number } }>(trip.data ? `/api/trips/${tripId}/conflicts` : null);
  const action = useAction();

  const onChanged = useCallback(() => { void trip.reload(); void conflicts.reload(); }, [trip, conflicts]);

  if (trip.error) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-16">
          <EmptyState title={trip.error.status === 404 ? "Trip not found" : "Couldn't load this trip"} hint={trip.error.status === 404 ? "It may not exist, or you may not be a member of it." : trip.error.message} action={<Link href="/dashboard" className={btnPrimary}>← Back to all trips</Link>} />
        </main>
      </div>
    );
  }
  if (!trip.data || !user) {
    return (<div className="min-h-screen bg-[#f8fafc] flex flex-col"><Navbar /><main className="flex-1"><Loading text="Opening trip…" /></main></div>);
  }

  const t = trip.data;
  const role = t.memberRole;
  const ctx: TripCtx = { trip: t, userId: user.userId, role, canEdit: role !== "viewer", isOrganizer: role === "organizer", onChanged, goToTab: (id) => setActiveTab(id as TabId) };
  const list = conflicts.data?.conflicts ?? [];
  const top = list[0];
  const canFixTop = !!top && top.subject.type === "activity" && !!top.suggestion && !!top.subject.mongoDocId && ctx.canEdit;

  const applyTop = () => {
    if (!top?.suggestion || !top.subject.mongoDocId) return;
    void action.run(async () => {
      await api(`/api/trips/${tripId}/activities/${top.subject.mongoDocId}`, { method: "PUT", body: { startTime: top.suggestion!.startTime, endTime: top.suggestion!.endTime } });
      onChanged();
    });
  };

  const tabs: { id: TabId; label: string; badge?: string | number; badgeAlert?: boolean }[] = [
    { id: "timeline", label: "Unified Timeline", badge: t.counts.itinerarySlots + t.counts.transports + t.counts.accommodations },
    { id: "logistics", label: "Transit & Stays", badge: t.counts.transports + t.counts.accommodations },
    { id: "activities", label: "Experiences & AI Search", badge: t.counts.itinerarySlots },
    { id: "budget", label: "Expenses & Splits", badge: t.counts.expenses },
    { id: "conflicts", label: "Schedule Assistant", badge: list.length, badgeAlert: list.length > 0 },
    { id: "travelers", label: "Travelers" },
  ];

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-3">
          <Link href="/dashboard" className="hover:text-slate-900 transition-colors">All Trips</Link>
          <span>/</span>
          <span className="text-slate-900 font-medium">{t.tripName}</span>
        </div>

        {/* Trip Header Banner */}
        <div className="p-6 border border-slate-300 bg-white shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase border border-slate-300 bg-slate-50 text-slate-700">{t.status}</span>
                <span className="text-xs text-slate-600 font-mono font-semibold">{fmtDateDDMMYYYY(t.startDate)} → {fmtDateDDMMYYYY(t.endDate)}</span>
                <span className="text-slate-300">•</span>
                <span className="text-xs text-slate-700 font-medium">{t.counts.destinations} destination{t.counts.destinations === 1 ? "" : "s"}</span>
                <span className="text-slate-300">•</span>
                <span className="text-xs text-slate-700 font-medium">Your role: {role === "member" ? "Traveler" : cap(role)}</span>
                {list.length > 0 && (
                  <span className="px-2 py-0.5 text-[10px] font-bold uppercase border border-amber-300 bg-amber-50 text-amber-800 flex items-center gap-1">
                    <span>⚠️</span> {list.length} Collision{list.length === 1 ? "" : "s"} Detected
                  </span>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-950 tracking-tight">{t.tripName}</h1>
              {t.description && <p className="text-xs sm:text-sm text-slate-600 mt-2 max-w-3xl leading-relaxed">{t.description}</p>}
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              {ctx.isOrganizer && <button type="button" onClick={() => setEditOpen(true)} className={btnSecondary + " !py-2.5"}>Edit Trip</button>}
              {ctx.canEdit && (
                <button type="button" onClick={() => { setActiveTab("activities"); setOpenNewActivity(true); }} className="px-4 py-2.5 text-xs font-bold text-white bg-slate-950 hover:bg-slate-800 border border-slate-950 rounded-none transition-colors shadow-sm flex items-center gap-1.5">
                  <span>+</span><span>Add Activity</span>
                </button>
              )}
            </div>
          </div>

          {/* Quick Collision Alert Box */}
          {top && (
            <div className="mt-5 p-3.5 border border-amber-300 bg-amber-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-amber-900 font-medium">
                <span className="text-base">⚠️</span>
                <span><strong>Schedule Collision:</strong> {top.message}</span>
              </div>
              {canFixTop ? (
                <button type="button" disabled={action.busy} onClick={applyTop} className="px-3 py-1.5 text-xs font-bold text-black bg-amber-400 hover:bg-amber-300 border border-amber-500 rounded-none transition-colors self-start sm:self-auto disabled:opacity-50">
                  {action.busy ? "Moving…" : `Move to ${fmtDateTime(top.suggestion!.startTime)} – ${fmtTime(top.suggestion!.endTime)}`}
                </button>
              ) : (
                <button type="button" onClick={() => setActiveTab("conflicts")} className="px-3 py-1.5 text-xs font-bold text-black bg-amber-400 hover:bg-amber-300 border border-amber-500 rounded-none self-start sm:self-auto">Review</button>
              )}
            </div>
          )}
          {action.error && <div className="mt-3"><ErrorBanner message={action.error} /></div>}
        </div>

        {/* Tab Navigation */}
        <div className="mt-6 border-b border-slate-200 flex items-center gap-1 overflow-x-auto" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-colors border-b-2 flex items-center gap-1.5 ${
                activeTab === tab.id ? "border-slate-950 text-slate-950 bg-white" : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
              }`}
            >
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span className={`px-1.5 py-0.5 text-[10px] font-mono ${tab.badgeAlert ? "bg-amber-100 text-amber-900 font-bold border border-amber-300" : "bg-slate-100 text-slate-600 border border-slate-200"}`}>{tab.badge}</span>
              )}
            </button>
          ))}
        </div>

        {activeTab === "timeline" && <TimelineTab ctx={ctx} />}
        {activeTab === "logistics" && <LogisticsTab ctx={ctx} />}
        {activeTab === "activities" && <ActivitiesTab ctx={ctx} openNew={openNewActivity} onNewHandled={() => setOpenNewActivity(false)} />}
        {activeTab === "budget" && <BudgetTab ctx={ctx} />}
        {activeTab === "conflicts" && <ConflictsTab ctx={ctx} />}
        {activeTab === "travelers" && <MembersTab ctx={ctx} />}

        {ctx.isOrganizer && (
          <div className="mt-12 pt-5 border-t border-slate-200 flex items-center justify-between text-xs">
            <span className="text-slate-500">Danger zone — deleting a trip permanently removes its bookings, expenses and activities.</span>
            <ConfirmButton disabled={action.busy} message={`Permanently delete “${t.tripName}” and everything in it?`} onConfirm={() => void action.run(async () => { await api(`/api/trips/${tripId}`, { method: "DELETE" }); router.push("/dashboard"); })}>Delete Trip</ConfirmButton>
          </div>
        )}
      </main>

      {editOpen && <EditTripModal trip={t} onClose={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); onChanged(); }} />}
    </div>
  );
}

function EditTripModal({ trip, onClose, onSaved }: { trip: TripDetail; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ tripName: trip.tripName, description: trip.description ?? "", startDate: trip.startDate, endDate: trip.endDate, currency: trip.currency, status: trip.status });
  const a = useAction();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title="Edit Trip" onClose={onClose} wide>
      <form onSubmit={(e) => { e.preventDefault(); void a.run(async () => { await api(`/api/trips/${trip.tripId}`, { method: "PUT", body: f }); onSaved(); }); }} className="space-y-4">
        <ErrorBanner message={a.error} />
        <Field text="Trip Name" error={a.fields.tripName}><input className="input-sharp" required maxLength={200} value={f.tripName} onChange={set("tripName")} /></Field>
        <Field text="Summary" error={a.fields.description}><textarea className="input-sharp" rows={2} maxLength={2000} value={f.description} onChange={set("description")} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field text="Start Date (DD/MM/YYYY)" error={a.fields.startDate}><DateInput required value={f.startDate} onChange={set("startDate")} /></Field>
          <Field text="End Date (DD/MM/YYYY)" error={a.fields.endDate}><DateInput required min={f.startDate} value={f.endDate} onChange={set("endDate")} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field text="Status"><select className="input-sharp" value={f.status} onChange={set("status")}>{["planning", "confirmed", "ongoing", "completed", "cancelled"].map((s) => <option key={s} value={s}>{cap(s)}</option>)}</select></Field>
          <Field text="Currency" error={a.fields.currency}><select className="input-sharp" value={f.currency} onChange={set("currency")}>{["INR", "USD", "EUR", "GBP"].map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
        </div>
        <div className="pt-4 flex justify-end gap-2 border-t border-slate-200"><button type="button" className={btnSecondary} onClick={onClose} disabled={a.busy}>Cancel</button><button type="submit" className={btnPrimary} disabled={a.busy}>{a.busy ? "Saving…" : "Save changes"}</button></div>
      </form>
    </Modal>
  );
}
