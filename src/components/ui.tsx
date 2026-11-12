"use client";

// Small set of shared UI pieces. They only reuse the classes already used across TripSync
// (sharp corners, slate palette, input-sharp), so every page keeps the same look.
import { ReactNode, useEffect } from "react";

export const btnPrimary =
  "px-4 py-2 text-xs font-bold text-white bg-slate-950 hover:bg-slate-800 border border-slate-950 rounded-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
export const btnSecondary =
  "px-4 py-2 text-xs font-semibold text-slate-700 hover:text-slate-950 border border-slate-300 bg-white hover:bg-slate-50 rounded-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
export const btnDanger =
  "px-3 py-1.5 text-xs font-semibold text-red-700 hover:text-white hover:bg-red-600 border border-red-300 bg-white rounded-none transition-colors disabled:opacity-50";
export const btnLink = "text-xs font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-50";
export const label = "block text-xs font-semibold text-slate-700 mb-1";

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`w-full ${wide ? "max-w-2xl" : "max-w-lg"} max-h-[90vh] overflow-y-auto p-6 bg-white border border-slate-300 shadow-xl`}>
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <h3 className="text-base font-bold text-slate-950">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-900 text-sm font-bold p-1">✕</button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export function Field({ name, text, error, children }: { name?: string; text: string; error?: string; children: ReactNode }) {
  return (
    <div data-field={name}>
      <label className={label}>{text}</label>
      {children}
      {error && <p className="mt-1 text-[11px] text-red-700">{error}</p>}
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string | null | undefined; onRetry?: () => void }) {
  if (!message) return null;
  return (
    <div role="alert" className="p-2.5 border border-red-300 bg-red-50 text-red-800 text-xs font-medium flex items-center justify-between gap-3">
      <span>{message}</span>
      {onRetry && <button type="button" onClick={onRetry} className="font-bold underline">Retry</button>}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "ok"; children: ReactNode }) {
  const t = { info: "border-slate-300 bg-slate-50 text-slate-700", warn: "border-amber-300 bg-amber-50 text-amber-900", ok: "border-emerald-300 bg-emerald-50 text-emerald-800" }[tone];
  return <div className={`p-2.5 border text-xs ${t}`}>{children}</div>;
}

export function Loading({ text = "Loading…" }: { text?: string }) {
  return <div className="py-10 text-center text-xs text-slate-500" role="status">{text}</div>;
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="p-8 text-center border border-dashed border-slate-300 bg-white">
      <div className="text-sm font-bold text-slate-800">{title}</div>
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "amber" | "red" | "green" | "blue" }) {
  const t = {
    slate: "border-slate-200 bg-slate-50 text-slate-700",
    amber: "border-amber-300 bg-amber-50 text-amber-800",
    red: "border-red-300 bg-red-50 text-red-800",
    green: "border-emerald-300 bg-emerald-50 text-emerald-800",
    blue: "border-blue-300 bg-blue-50 text-blue-800",
  }[tone];
  return <span className={`px-1.5 py-0.5 text-[10px] font-bold uppercase border ${t}`}>{children}</span>;
}

export function Stat({ title, value, sub, tone = "default" }: { title: string; value: ReactNode; sub?: ReactNode; tone?: "default" | "amber" }) {
  const amber = tone === "amber";
  return (
    <div className={`p-4 border shadow-sm ${amber ? "border-amber-300 bg-amber-50/50" : "border-slate-200 bg-white"}`}>
      <span className={`text-[11px] font-semibold uppercase tracking-wider ${amber ? "text-amber-800" : "text-slate-500"}`}>{title}</span>
      <div className={`text-2xl font-extrabold mt-1 tabular-nums ${amber ? "text-amber-900" : "text-slate-950"}`}>{value}</div>
      {sub && <div className={`text-[11px] mt-1 ${amber ? "text-amber-700" : "text-slate-500"}`}>{sub}</div>}
    </div>
  );
}

export function ConfirmButton({ onConfirm, children, message = "Are you sure?", className = btnDanger, disabled }: { onConfirm: () => void; children: ReactNode; message?: string; className?: string; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} className={className} onClick={() => { if (window.confirm(message)) onConfirm(); }}>
      {children}
    </button>
  );
}

export { DateInput, DateTimeInput, TimeInput } from "./ui/DateInput";
export type { DateInputProps, DateTimeInputProps, TimeInputProps } from "./ui/DateInput";

