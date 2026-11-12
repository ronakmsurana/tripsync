"use client";

import { useState } from "react";
import { DateTimeInput, ErrorBanner, Field, Modal, btnPrimary, btnSecondary } from "@/components/ui";
import { api, ApiClientError, errorMessage, useFetch } from "@/lib/client/api";
import { cap, fmtDateTime, fmtTime } from "@/lib/client/format";
import type { ActivityDTO, Conflict, DestinationDTO } from "@/types";
import { TripCtx } from "./shared";

const STANDARD_TYPES = ["sightseeing", "dining", "adventure", "leisure", "festival"];

interface ConflictInfo { conflicts: Conflict[]; suggestion?: { startTime: string; endTime: string }; message: string }

export default function ActivityForm({ ctx, item, onClose, onSaved }: { ctx: TripCtx; item?: ActivityDTO; onClose: () => void; onSaved: () => void }) {
  const day1 = ctx.trip.startDate;
  const dests = useFetch<DestinationDTO[]>(`/api/trips/${ctx.trip.tripId}/destinations`);

  const initialSlotType = item?.slotType ?? "sightseeing";
  const isInitialCustom = !STANDARD_TYPES.includes(initialSlotType.toLowerCase());

  const [selectedType, setSelectedType] = useState<string>(isInitialCustom ? "custom" : initialSlotType);
  const [customType, setCustomType] = useState<string>(isInitialCustom && initialSlotType !== "custom" ? initialSlotType : "");

  const [f, setF] = useState({
    title: item?.title ?? "", destinationId: item?.destinationId ? String(item.destinationId) : "",
    startTime: item?.startTime ?? `${day1}T10:00`, endTime: item?.endTime ?? `${day1}T11:30`, description: item?.description ?? "",
    tags: (item?.tags ?? []).join(", "), cost: item?.estimatedCost.amount ?? "0", locationName: item?.location?.name ?? "", notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => { setF({ ...f, [k]: e.target.value }); setConflict(null); };

  const save = async (override?: { startTime: string; endTime: string }, force = false) => {
    if (busy) return;
    setBusy(true); setError(null); setFields({});

    let resolvedType = selectedType;
    if (selectedType === "custom") {
      const trimmed = customType.trim();
      if (!trimmed) {
        setFields({ slotType: "Please enter a custom type name" });
        setBusy(false);
        return;
      }
      resolvedType = trimmed;
    }

    const times = override ?? { startTime: f.startTime, endTime: f.endTime };
    const body = {
      title: f.title, slotType: resolvedType, destinationId: f.destinationId ? Number(f.destinationId) : null, ...times,
      description: f.description, tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean),
      estimatedCost: { amount: f.cost || "0", currency: ctx.trip.currency },
      location: f.locationName ? { name: f.locationName } : undefined, notes: f.notes || undefined, force,
    };
    try {
      const base = `/api/trips/${ctx.trip.tripId}/activities`;
      await api(item ? `${base}/${item.id}` : base, { method: item ? "PUT" : "POST", body });
      onSaved();
    } catch (e) {
      if (e instanceof ApiClientError && e.code === "SCHEDULE_CONFLICT") {
        const d = e.details as { conflicts: Conflict[]; suggestion?: ConflictInfo["suggestion"] };
        setConflict({ conflicts: d.conflicts, suggestion: d.suggestion, message: e.message });
        if (override) setF((p) => ({ ...p, ...override }));
      } else {
        setError(errorMessage(e));
        if (e instanceof ApiClientError) setFields(e.fields);
      }
      setBusy(false);
    }
  };

  return (
    <Modal title={item ? "Edit Activity" : "Add Activity"} onClose={() => !busy && onClose()} wide>
      <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="space-y-4">
        <ErrorBanner message={error} />
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div className={selectedType === "custom" ? "sm:col-span-5" : "sm:col-span-8"}>
            <Field text="Title" error={fields.title}>
              <input className="input-sharp" required maxLength={200} value={f.title} onChange={set("title")} placeholder="Sunrise at Matanga Hill" />
            </Field>
          </div>
          <div className={selectedType === "custom" ? "sm:col-span-3" : "sm:col-span-4"}>
            <Field text="Type" error={fields.slotType}>
              <select
                className="input-sharp"
                value={selectedType}
                onChange={(e) => {
                  setSelectedType(e.target.value);
                  setConflict(null);
                }}
              >
                {STANDARD_TYPES.map((t) => (
                  <option key={t} value={t}>{cap(t)}</option>
                ))}
                <option value="custom">Custom…</option>
              </select>
            </Field>
          </div>
          {selectedType === "custom" && (
            <div className="sm:col-span-4">
              <Field text="Custom Type Name" error={fields.slotType}>
                <input
                  className="input-sharp"
                  required
                  maxLength={30}
                  value={customType}
                  onChange={(e) => {
                    setCustomType(e.target.value);
                    setConflict(null);
                  }}
                  placeholder="e.g. Scuba Diving, Spa"
                  autoFocus
                />
              </Field>
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field text="Starts (DD/MM/YYYY HH:mm)" error={fields.startTime}><DateTimeInput required min={`${ctx.trip.startDate}T00:00`} max={`${ctx.trip.endDate}T23:59`} value={f.startTime} onChange={set("startTime")} /></Field>
          <Field text="Ends (DD/MM/YYYY HH:mm)" error={fields.endTime}><DateTimeInput required min={f.startTime} max={`${ctx.trip.endDate}T23:59`} value={f.endTime} onChange={set("endTime")} /></Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field text="Destination" error={fields.destinationId}>
            <select className="input-sharp" value={f.destinationId} onChange={set("destinationId")}>
              <option value="">— None —</option>
              {(dests.data ?? []).map((d) => <option key={d.destinationId} value={d.destinationId}>{d.name}</option>)}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field text="Place name" error={fields["location.name"]}><input className="input-sharp" maxLength={200} value={f.locationName} onChange={set("locationName")} placeholder="e.g. Virupaksha Temple" /></Field>
          </div>
        </div>
        <Field text="Description (used for search)" error={fields.description}><textarea className="input-sharp" rows={2} maxLength={5000} value={f.description} onChange={set("description")} placeholder="What will you do and why is it worth it?" /></Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field text="Tags (comma separated)" error={fields.tags}><input className="input-sharp" value={f.tags} onChange={set("tags")} placeholder="temple, sunrise" /></Field>
          <Field text={`Estimated cost (${ctx.trip.currency})`} error={fields["estimatedCost.amount"]}><input className="input-sharp" inputMode="decimal" value={f.cost} onChange={set("cost")} /></Field>
        </div>
        <Field text={item ? "Add a note" : "Note"} error={fields.notes}><input className="input-sharp" maxLength={2000} value={f.notes} onChange={set("notes")} placeholder="Optional" /></Field>

        {conflict && (
          <div role="alert" className="p-3 border border-amber-400 bg-amber-50 text-xs text-amber-900 space-y-2">
            <div className="font-bold">⚠️ Schedule conflict</div>
            <p>{conflict.message}</p>
            <ul className="list-disc pl-4 space-y-0.5">{conflict.conflicts.map((c) => <li key={c.key}>{c.message}</li>)}</ul>
            <div className="flex flex-wrap gap-2 pt-1">
              {conflict.suggestion && (
                <button type="button" disabled={busy} onClick={() => void save(conflict.suggestion)} className="px-3 py-1.5 text-xs font-bold text-black bg-amber-400 hover:bg-amber-300 border border-amber-500 rounded-none">
                  Use suggested time ({fmtDateTime(conflict.suggestion.startTime)} → {fmtTime(conflict.suggestion.endTime)})
                </button>
              )}
              <button type="button" disabled={busy} onClick={() => void save(undefined, true)} className={btnSecondary}>Save anyway</button>
            </div>
          </div>
        )}

        <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-200">
          <button type="button" onClick={onClose} disabled={busy} className={btnSecondary}>Cancel</button>
          <button type="submit" disabled={busy} className={btnPrimary}>{busy ? "Saving…" : item ? "Save changes" : "Add Activity"}</button>
        </div>
      </form>
    </Modal>
  );
}
