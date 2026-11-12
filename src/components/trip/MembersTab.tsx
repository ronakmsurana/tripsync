"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, ConfirmButton, ErrorBanner, Field, Loading, Notice, btnPrimary } from "@/components/ui";
import { api, useFetch } from "@/lib/client/api";
import { cap, fmtDate } from "@/lib/client/format";
import type { MemberDTO, TripRole } from "@/types";
import { TripCtx, useAction } from "./shared";

export default function MembersTab({ ctx }: { ctx: TripCtx }) {
  const router = useRouter();
  const base = `/api/trips/${ctx.trip.tripId}/members`;
  const members = useFetch<MemberDTO[]>(base);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TripRole>("member");
  const act = useAction();
  const [done, setDone] = useState<string | null>(null);

  if (members.error) return <div className="mt-6"><ErrorBanner message={members.error.message} onRetry={members.reload} /></div>;
  if (!members.data) return <Loading />;
  const refresh = () => { members.reload(); ctx.onChanged(); };

  return (
    <div className="mt-6 space-y-5">
      <ErrorBanner message={act.error} />
      {done && <Notice tone="ok">{done}</Notice>}
      <section className="p-5 border border-slate-200 bg-white shadow-sm">
        <h3 className="text-base font-bold text-slate-950 mb-1">Travelers</h3>
        <p className="text-xs text-slate-500 mb-3"><strong>Organizers</strong> manage everything. <strong>Travelers</strong> can add activities and expenses. <strong>Viewers</strong> are read-only.</p>
        <div className="divide-y divide-slate-100 border border-slate-200">
          {members.data.map((m) => (
            <div key={m.userId} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div>
                <div className="font-bold text-slate-950">{m.name} {m.userId === ctx.userId && <span className="font-normal text-slate-400">(you)</span>}</div>
                <div className="text-slate-500">{m.email} · joined {fmtDate(m.joinedAt.slice(0, 10), { day: "numeric", month: "short", year: "numeric" })}</div>
              </div>
              <div className="flex items-center gap-3">
                {ctx.isOrganizer ? (
                  <select aria-label={`Role of ${m.name}`} className="input-sharp !w-32 !py-1 !text-xs" value={m.memberRole} disabled={act.busy} onChange={(e) => void act.run(async () => { await api(`${base}/${m.userId}`, { method: "PATCH", body: { memberRole: e.target.value } }); refresh(); })}>
                    <option value="organizer">Organizer</option><option value="member">Traveler</option><option value="viewer">Viewer</option>
                  </select>
                ) : <Badge>{cap(m.memberRole)}</Badge>}
                {(ctx.isOrganizer || m.userId === ctx.userId) && (
                  <ConfirmButton disabled={act.busy} message={m.userId === ctx.userId ? "Leave this trip?" : `Remove ${m.name} from this trip?`} className="text-xs font-semibold text-red-600 hover:text-red-800"
                    onConfirm={() => void act.run(async () => { await api(`${base}/${m.userId}`, { method: "DELETE" }); if (m.userId === ctx.userId) router.push("/dashboard"); else refresh(); })}>
                    {m.userId === ctx.userId ? "Leave" : "Remove"}
                  </ConfirmButton>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {ctx.isOrganizer && (
        <section className="p-5 border border-slate-200 bg-white shadow-sm">
          <h3 className="text-sm font-bold text-slate-950 mb-3">Invite a traveler</h3>
          <form className="grid grid-cols-1 sm:grid-cols-[1fr_9rem_auto] gap-2 items-end" onSubmit={(e) => { e.preventDefault(); void act.run(async () => { await api(base, { method: "POST", body: { email, memberRole: role } }); setDone(`Added ${email}`); setEmail(""); refresh(); }); }}>
            <Field text="Their TripSync e-mail" error={act.fields.email}><input type="email" required className="input-sharp" value={email} onChange={(e) => { setEmail(e.target.value); setDone(null); }} placeholder="friend@example.com" /></Field>
            <Field text="Role"><select className="input-sharp" value={role} onChange={(e) => setRole(e.target.value as TripRole)}><option value="member">Traveler</option><option value="viewer">Viewer</option><option value="organizer">Organizer</option></select></Field>
            <button type="submit" disabled={act.busy} className={btnPrimary + " !py-2.5"}>{act.busy ? "Adding…" : "Add"}</button>
          </form>
          <p className="text-[11px] text-slate-500 mt-2">They need a TripSync account first.</p>
        </section>
      )}
    </div>
  );
}
