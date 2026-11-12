"use client";

import { useState } from "react";
import { ConfirmButton, DateInput, DateTimeInput, EmptyState, ErrorBanner, Field, Loading, Modal, btnLink, btnPrimary, btnSecondary } from "@/components/ui";
import { api, useFetch } from "@/lib/client/api";
import { cap, fmtDate, fmtDateTime, money } from "@/lib/client/format";
import type { AccommodationDTO, DestinationDTO, TransportDTO } from "@/types";
import { TripCtx, transportIcon, useAction } from "./shared";

const base = (ctx: TripCtx) => `/api/trips/${ctx.trip.tripId}`;
const STATUSES = ["confirmed", "pending", "cancelled"];

export default function LogisticsTab({ ctx }: { ctx: TripCtx }) {
  const dests = useFetch<DestinationDTO[]>(`${base(ctx)}/destinations`);
  const transports = useFetch<TransportDTO[]>(`${base(ctx)}/transport`);
  const stays = useFetch<AccommodationDTO[]>(`${base(ctx)}/accommodation`);
  const [modal, setModal] = useState<null | { kind: "dest" | "transport" | "stay"; item?: DestinationDTO | TransportDTO | AccommodationDTO }>(null);
  const del = useAction();

  const refresh = () => { dests.reload(); transports.reload(); stays.reload(); ctx.onChanged(); };
  const remove = (path: string) => del.run(async () => { await api(`${base(ctx)}/${path}`, { method: "DELETE" }); refresh(); });

  const err = dests.error || transports.error || stays.error;
  if (err) return <div className="mt-6"><ErrorBanner message={err.message} onRetry={refresh} /></div>;
  if (!dests.data || !transports.data || !stays.data) return <Loading />;

  const addBtn = (kind: "dest" | "transport" | "stay", text: string) =>
    ctx.isOrganizer && (
      <button type="button" onClick={() => setModal({ kind })} className="px-3 py-1.5 text-xs font-bold text-white bg-slate-950 hover:bg-slate-800 border border-slate-950 rounded-none">+ {text}</button>
    );
  const actions = (kind: string, onEdit: () => void, path: string) =>
    ctx.isOrganizer && (
      <div className="flex items-center gap-3">
        <button type="button" className={btnLink} onClick={onEdit}>Edit</button>
        <ConfirmButton disabled={del.busy} onConfirm={() => remove(path)} message={`Remove this ${kind}?`} className="text-xs font-semibold text-red-600 hover:text-red-800">Remove</ConfirmButton>
      </div>
    );

  return (
    <div className="mt-6 space-y-8">
      <ErrorBanner message={del.error} />

      {/* Destinations */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-slate-950 flex items-center gap-2"><span>📍</span> Destinations</h3>
          {addBtn("dest", "Add Destination")}
        </div>
        {dests.data.length === 0 ? (
          <EmptyState title="No destinations yet" hint="Destinations anchor transport and stays to a place and a date range." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {dests.data.map((d) => (
              <div key={d.destinationId} className="p-4 border border-slate-300 bg-white shadow-sm">
                <h4 className="text-sm font-bold text-slate-950">{d.name}</h4>
                <p className="text-xs text-slate-600 mt-0.5">{d.location}</p>
                <p className="text-xs font-mono text-slate-700 mt-2">{fmtDate(d.arrivalDate)} → {fmtDate(d.departureDate)}</p>
                {d.notes && <p className="text-[11px] text-slate-500 mt-1">{d.notes}</p>}
                <div className="mt-3 pt-2 border-t border-slate-100">{actions("destination", () => setModal({ kind: "dest", item: d }), `destinations/${d.destinationId}`)}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Transport */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-slate-950 flex items-center gap-2"><span>✈️</span> Fixed Flights &amp; Ground Transit</h3>
          {dests.data.length >= 2 && addBtn("transport", "Add Transport")}
        </div>
        {transports.data.length === 0 ? (
          <EmptyState title="No transport booked" hint={dests.data.length < 2 ? "Add at least two destinations first, then book travel between them." : "Add flights, trains or buses between your destinations."} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {transports.data.map((t) => (
              <div key={t.transportId} className={`p-5 border bg-white shadow-sm flex flex-col justify-between ${t.status === "cancelled" ? "border-slate-200 opacity-60" : "border-slate-300"}`}>
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-mono font-bold text-slate-700 uppercase">{t.transportType} · {t.status}</span>
                    {t.bookingReference && <span className="font-mono text-slate-500 font-semibold">Ref: {t.bookingReference}</span>}
                  </div>
                  <h4 className="text-sm font-bold text-slate-950">{transportIcon(t.transportType)} {t.provider}</h4>
                  <p className="text-xs text-slate-600 mt-1">{t.departureDestination?.name} → {t.arrivalDestination?.name}</p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="font-mono font-semibold text-slate-700">{fmtDateTime(t.departureTime)} → {fmtDateTime(t.arrivalTime)}</span>
                  <span className="font-mono font-bold text-slate-950">{money(t.cost, ctx.trip.currency)}</span>
                </div>
                <div className="mt-3">{actions("transport booking", () => setModal({ kind: "transport", item: t }), `transport/${t.transportId}`)}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Stays */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-slate-950 flex items-center gap-2"><span>🏨</span> Stays &amp; Accommodations</h3>
          {dests.data.length >= 1 && addBtn("stay", "Add Stay")}
        </div>
        {stays.data.length === 0 ? (
          <EmptyState title="No stays booked" hint="Add your hotel or guest house so check-in and check-out are part of the schedule audit." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {stays.data.map((h) => (
              <div key={h.accommodationId} className={`p-5 border bg-white shadow-sm flex flex-col justify-between ${h.status === "cancelled" ? "border-slate-200 opacity-60" : "border-slate-300"}`}>
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-mono font-bold text-slate-700 uppercase">Stay · {h.status}</span>
                    {h.bookingReference && <span className="font-mono text-slate-500 font-semibold">Booking: {h.bookingReference}</span>}
                  </div>
                  <h4 className="text-sm font-bold text-slate-950">{h.name}</h4>
                  <p className="text-xs text-slate-600 mt-1">{[h.destination?.name, h.address].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="font-mono font-semibold text-slate-700">In {fmtDateTime(h.checkIn)} · Out {fmtDateTime(h.checkOut)}</span>
                  <span className="font-mono font-bold text-slate-950">{money(h.cost, ctx.trip.currency)}</span>
                </div>
                <div className="mt-3">{actions("stay", () => setModal({ kind: "stay", item: h }), `accommodation/${h.accommodationId}`)}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {modal?.kind === "dest" && <DestinationForm ctx={ctx} item={modal.item as DestinationDTO | undefined} onClose={() => setModal(null)} onSaved={() => { setModal(null); refresh(); }} />}
      {modal?.kind === "transport" && <TransportForm ctx={ctx} dests={dests.data} item={modal.item as TransportDTO | undefined} onClose={() => setModal(null)} onSaved={() => { setModal(null); refresh(); }} />}
      {modal?.kind === "stay" && <StayForm ctx={ctx} dests={dests.data} item={modal.item as AccommodationDTO | undefined} onClose={() => setModal(null)} onSaved={() => { setModal(null); refresh(); }} />}
    </div>
  );
}

function Footer({ busy, onClose, editing }: { busy: boolean; onClose: () => void; editing: boolean }) {
  return (
    <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-200">
      <button type="button" onClick={onClose} disabled={busy} className={btnSecondary}>Cancel</button>
      <button type="submit" disabled={busy} className={btnPrimary}>{busy ? "Saving…" : editing ? "Save changes" : "Add"}</button>
    </div>
  );
}

function DestinationForm({ ctx, item, onClose, onSaved }: { ctx: TripCtx; item?: DestinationDTO; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: item?.name ?? "", location: item?.location ?? "", arrivalDate: item?.arrivalDate ?? ctx.trip.startDate, departureDate: item?.departureDate ?? ctx.trip.endDate, notes: item?.notes ?? "" });
  const a = useAction();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void a.run(async () => {
      await api(`${base(ctx)}/destinations${item ? `/${item.destinationId}` : ""}`, { method: item ? "PUT" : "POST", body: { ...f, notes: f.notes || undefined } });
      onSaved();
    });
  };
  return (
    <Modal title={item ? "Edit Destination" : "Add Destination"} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <ErrorBanner message={a.error} />
        <div className="grid grid-cols-2 gap-3">
          <Field text="Name" error={a.fields.name}><input className="input-sharp" required maxLength={200} value={f.name} onChange={set("name")} placeholder="Hampi" /></Field>
          <Field text="Location" error={a.fields.location}><input className="input-sharp" required maxLength={300} value={f.location} onChange={set("location")} placeholder="Hampi, Karnataka" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field text="Arrival (DD/MM/YYYY)" error={a.fields.arrivalDate}><DateInput required min={ctx.trip.startDate} max={ctx.trip.endDate} value={f.arrivalDate} onChange={set("arrivalDate")} /></Field>
          <Field text="Departure (DD/MM/YYYY)" error={a.fields.departureDate}><DateInput required min={f.arrivalDate} max={ctx.trip.endDate} value={f.departureDate} onChange={set("departureDate")} /></Field>
        </div>
        <Field text="Notes" error={a.fields.notes}><textarea className="input-sharp" rows={2} maxLength={2000} value={f.notes} onChange={set("notes")} /></Field>
        <Footer busy={a.busy} onClose={onClose} editing={!!item} />
      </form>
    </Modal>
  );
}

function DestSelect({ dests, value, onChange }: { dests: DestinationDTO[]; value: number | ""; onChange: (v: number) => void }) {
  return (
    <select className="input-sharp" required value={value} onChange={(e) => onChange(Number(e.target.value))}>
      <option value="" disabled>Choose…</option>
      {dests.map((d) => <option key={d.destinationId} value={d.destinationId}>{d.name}</option>)}
    </select>
  );
}

const dtMin = (ctx: TripCtx) => `${ctx.trip.startDate}T00:00`;
const dtMax = (ctx: TripCtx) => `${ctx.trip.endDate}T23:59`;

function TransportForm({ ctx, dests, item, onClose, onSaved }: { ctx: TripCtx; dests: DestinationDTO[]; item?: TransportDTO; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    transportType: item?.transportType ?? "bus", provider: item?.provider ?? "",
    departureDestinationId: (item?.departureDestinationId ?? dests[0]?.destinationId ?? "") as number | "",
    arrivalDestinationId: (item?.arrivalDestinationId ?? dests[1]?.destinationId ?? "") as number | "",
    departureTime: item?.departureTime ?? `${ctx.trip.startDate}T08:00`, arrivalTime: item?.arrivalTime ?? `${ctx.trip.startDate}T12:00`,
    bookingReference: item?.bookingReference ?? "", cost: item?.cost ?? "0", status: item?.status ?? "confirmed",
  });
  const a = useAction();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void a.run(async () => {
      await api(`${base(ctx)}/transport${item ? `/${item.transportId}` : ""}`, { method: item ? "PUT" : "POST", body: { ...f, bookingReference: f.bookingReference || undefined } });
      onSaved();
    });
  };
  return (
    <Modal title={item ? "Edit Transport" : "Add Transport"} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <ErrorBanner message={a.error} />
        <div className="grid grid-cols-2 gap-3">
          <Field text="Mode" error={a.fields.transportType}>
            <select className="input-sharp" value={f.transportType} onChange={set("transportType")}>{["flight", "train", "bus", "car", "ferry", "other"].map((t) => <option key={t} value={t}>{cap(t)}</option>)}</select>
          </Field>
          <Field text="Provider" error={a.fields.provider}><input className="input-sharp" required maxLength={200} value={f.provider} onChange={set("provider")} placeholder="KSRTC Airavat" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field text="From" error={a.fields.departureDestinationId}><DestSelect dests={dests} value={f.departureDestinationId} onChange={(v) => setF({ ...f, departureDestinationId: v })} /></Field>
          <Field text="To" error={a.fields.arrivalDestinationId}><DestSelect dests={dests} value={f.arrivalDestinationId} onChange={(v) => setF({ ...f, arrivalDestinationId: v })} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field text="Departs (DD/MM/YYYY HH:mm)" error={a.fields.departureTime}><DateTimeInput required min={dtMin(ctx)} max={dtMax(ctx)} value={f.departureTime} onChange={set("departureTime")} /></Field>
          <Field text="Arrives (DD/MM/YYYY HH:mm)" error={a.fields.arrivalTime}><DateTimeInput required min={f.departureTime} value={f.arrivalTime} onChange={set("arrivalTime")} /></Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field text="Booking ref" error={a.fields.bookingReference}><input className="input-sharp" maxLength={100} value={f.bookingReference} onChange={set("bookingReference")} /></Field>
          <Field text={`Cost (${ctx.trip.currency})`} error={a.fields.cost}><input className="input-sharp" inputMode="decimal" value={f.cost} onChange={set("cost")} /></Field>
          <Field text="Status"><select className="input-sharp" value={f.status} onChange={set("status")}>{STATUSES.map((s) => <option key={s} value={s}>{cap(s)}</option>)}</select></Field>
        </div>
        <Footer busy={a.busy} onClose={onClose} editing={!!item} />
      </form>
    </Modal>
  );
}

function StayForm({ ctx, dests, item, onClose, onSaved }: { ctx: TripCtx; dests: DestinationDTO[]; item?: AccommodationDTO; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    destinationId: (item?.destinationId ?? dests[0]?.destinationId ?? "") as number | "", name: item?.name ?? "", address: item?.address ?? "",
    checkIn: item?.checkIn ?? `${ctx.trip.startDate}T14:00`, checkOut: item?.checkOut ?? `${ctx.trip.endDate}T11:00`,
    bookingReference: item?.bookingReference ?? "", cost: item?.cost ?? "0", status: item?.status ?? "confirmed",
  });
  const a = useAction();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void a.run(async () => {
      await api(`${base(ctx)}/accommodation${item ? `/${item.accommodationId}` : ""}`, { method: item ? "PUT" : "POST", body: { ...f, address: f.address || undefined, bookingReference: f.bookingReference || undefined } });
      onSaved();
    });
  };
  return (
    <Modal title={item ? "Edit Stay" : "Add Stay"} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <ErrorBanner message={a.error} />
        <div className="grid grid-cols-2 gap-3">
          <Field text="Name" error={a.fields.name}><input className="input-sharp" required maxLength={200} value={f.name} onChange={set("name")} placeholder="Hampi Heritage Guest House" /></Field>
          <Field text="Destination" error={a.fields.destinationId}><DestSelect dests={dests} value={f.destinationId} onChange={(v) => setF({ ...f, destinationId: v })} /></Field>
        </div>
        <Field text="Address" error={a.fields.address}><input className="input-sharp" maxLength={500} value={f.address} onChange={set("address")} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field text="Check-in (DD/MM/YYYY HH:mm)" error={a.fields.checkIn}><DateTimeInput required min={dtMin(ctx)} max={dtMax(ctx)} value={f.checkIn} onChange={set("checkIn")} /></Field>
          <Field text="Check-out (DD/MM/YYYY HH:mm)" error={a.fields.checkOut}><DateTimeInput required min={f.checkIn} max={dtMax(ctx)} value={f.checkOut} onChange={set("checkOut")} /></Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field text="Booking ref" error={a.fields.bookingReference}><input className="input-sharp" maxLength={100} value={f.bookingReference} onChange={set("bookingReference")} /></Field>
          <Field text={`Cost (${ctx.trip.currency})`} error={a.fields.cost}><input className="input-sharp" inputMode="decimal" value={f.cost} onChange={set("cost")} /></Field>
          <Field text="Status"><select className="input-sharp" value={f.status} onChange={set("status")}>{STATUSES.map((s) => <option key={s} value={s}>{cap(s)}</option>)}</select></Field>
        </div>
        <Footer busy={a.busy} onClose={onClose} editing={!!item} />
      </form>
    </Modal>
  );
}
