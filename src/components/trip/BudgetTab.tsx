"use client";

import { useState } from "react";
import { ConfirmButton, DateInput, EmptyState, ErrorBanner, Field, Loading, Modal, Notice, Stat, btnLink, btnPrimary, btnSecondary } from "@/components/ui";
import { api, useFetch } from "@/lib/client/api";
import { cap, fmtDate, money } from "@/lib/client/format";
import type { BudgetOverview, ExpenseDTO, MemberDTO } from "@/types";
import { TripCtx, useAction } from "./shared";

const CATS = ["transport", "accommodation", "food", "activities", "shopping", "other"];

export default function BudgetTab({ ctx }: { ctx: TripCtx }) {
  const base = `/api/trips/${ctx.trip.tripId}`;
  const cur = ctx.trip.currency;
  const overview = useFetch<BudgetOverview>(`${base}/budget`);
  const expenses = useFetch<ExpenseDTO[]>(`${base}/expenses`);
  const [modal, setModal] = useState<null | { kind: "expense"; item?: ExpenseDTO } | { kind: "budget"; category?: string; amount?: string }>(null);
  const act = useAction();
  const [done, setDone] = useState<string | null>(null);

  const refresh = () => { overview.reload(); expenses.reload(); ctx.onChanged(); };
  const err = overview.error || expenses.error;
  if (err) return <div className="mt-6"><ErrorBanner message={err.message} onRetry={refresh} /></div>;
  if (!overview.data || !expenses.data) return <Loading />;
  const b = overview.data;
  const over = Number(b.totals.remaining) < 0;
  const mayChange = (e: ExpenseDTO) => ctx.isOrganizer || (ctx.canEdit && e.paidBy === ctx.userId);

  const settle = (userId: number) => act.run(async () => {
    const r = await api<{ settledCount: number; totalSettled: string }>(`${base}/settlements`, { method: "POST", body: { paymentMethod: "cash", userId } });
    setDone(r.settledCount ? `Settled ${r.settledCount} share(s) · ${money(r.totalSettled, cur)}` : "Nothing to settle");
    refresh();
  });

  return (
    <div className="mt-6 space-y-6">
      <ErrorBanner message={act.error} />
      {done && <Notice tone="ok">{done}</Notice>}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat title="Total Budget" value={money(b.totals.planned, cur)} sub={b.rows.filter((r) => Number(r.planned) > 0).length + " categories planned"} />
        <Stat title="Spent" value={money(b.totals.spent, cur)} sub={`${expenses.data.length} expense${expenses.data.length === 1 ? "" : "s"} recorded`} />
        <Stat tone={over ? "amber" : "default"} title={over ? "Over Budget" : "Remaining"} value={money(b.totals.remaining, cur)} sub={b.totals.utilizationPct === null ? "No budget set" : `${b.totals.utilizationPct}% used`} />
        <Stat title="Planned Activities" value={money(b.estimatedActivitiesTotal, cur)} sub="estimated cost (from activity documents)" />
      </div>

      {/* Category budgets */}
      <section className="p-5 border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-slate-950">Budget by category</h3>
          {ctx.isOrganizer && <button type="button" className={btnPrimary} onClick={() => setModal({ kind: "budget" })}>+ Set budget</button>}
        </div>
        {b.rows.length === 0 ? (
          <EmptyState title="No budget yet" hint="Set a planned amount per category to track spending against it." />
        ) : (
          <div className="space-y-3">
            {b.rows.map((r) => {
              const pct = Math.min(100, r.utilizationPct ?? (Number(r.spent) > 0 ? 100 : 0));
              const overRow = Number(r.remaining) < 0;
              return (
                <div key={r.category}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold text-slate-800">{cap(r.category)} {Number(r.planned) === 0 && <span className="text-[10px] text-amber-700 font-normal">(not budgeted)</span>}</span>
                    <span className="font-mono text-slate-700 tabular-nums">{money(r.spent, cur)} / {money(r.planned, cur)}</span>
                  </div>
                  <div className="h-2 bg-slate-100 border border-slate-200"><div className={`h-full ${overRow ? "bg-red-500" : "bg-slate-800"}`} style={{ width: `${pct}%` }} /></div>
                  <div className="flex items-center justify-between text-[11px] mt-1">
                    <span className={overRow ? "text-red-700 font-semibold" : "text-slate-500"}>{overRow ? `Over by ${money(Math.abs(Number(r.remaining)), cur)}` : `${money(r.remaining, cur)} left`}</span>
                    {ctx.isOrganizer && (
                      <span className="flex gap-3">
                        <button type="button" className={btnLink} onClick={() => setModal({ kind: "budget", category: r.category, amount: r.planned })}>Edit</button>
                        {Number(r.planned) > 0 && <ConfirmButton disabled={act.busy} message="Remove this category budget?" className="text-xs font-semibold text-red-600" onConfirm={() => void act.run(async () => { await api(`${base}/budget/${r.category}`, { method: "DELETE" }); refresh(); })}>Remove</ConfirmButton>}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Expenses */}
      <section className="p-5 border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-slate-950">Expenses</h3>
          {ctx.canEdit && <button type="button" className={btnPrimary} onClick={() => setModal({ kind: "expense" })}>+ Add Expense</button>}
        </div>
        {expenses.data.length === 0 ? (
          <EmptyState title="No expenses recorded" hint="Record what you pay for; each expense is split between travelers." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-3">Date</th><th className="py-2 pr-3">Category</th><th className="py-2 pr-3">Description</th><th className="py-2 pr-3">Paid by</th><th className="py-2 pr-3">Split</th><th className="py-2 pr-3 text-right">Amount</th><th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {expenses.data.map((e) => (
                  <tr key={e.expenseId} className="border-b border-slate-100 align-top">
                    <td className="py-2 pr-3 font-mono whitespace-nowrap">{fmtDate(e.expenseDate, { day: "numeric", month: "short" })}</td>
                    <td className="py-2 pr-3">{cap(e.category)}</td>
                    <td className="py-2 pr-3 text-slate-700">{e.description || "—"}</td>
                    <td className="py-2 pr-3">{e.payer.name}</td>
                    <td className="py-2 pr-3 text-slate-500">{e.splits.map((s) => `${s.name.split(" ")[0]} ${money(s.shareAmount, cur)}`).join(", ")}</td>
                    <td className="py-2 pr-3 text-right font-mono font-bold tabular-nums">{money(e.amount, cur)}</td>
                    <td className="py-2 text-right whitespace-nowrap">
                      {mayChange(e) && (
                        <span className="flex gap-3 justify-end">
                          <button type="button" className={btnLink} onClick={() => setModal({ kind: "expense", item: e })}>Edit</button>
                          <ConfirmButton disabled={act.busy} message="Delete this expense?" className="text-xs font-semibold text-red-600" onConfirm={() => void act.run(async () => { await api(`${base}/expenses/${e.expenseId}`, { method: "DELETE" }); refresh(); })}>Delete</ConfirmButton>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Balances */}
      <section className="p-5 border border-slate-200 bg-white shadow-sm">
        <h3 className="text-base font-bold text-slate-950 mb-1">Traveler balances</h3>
        <p className="text-xs text-slate-500 mb-3">Net = paid − own share + settlements made − settlements received. Positive means the group owes that traveler.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <th className="py-2 pr-3">Traveler</th><th className="py-2 pr-3 text-right">Paid</th><th className="py-2 pr-3 text-right">Share</th><th className="py-2 pr-3 text-right">Net</th><th className="py-2 pr-3 text-right">To pay</th><th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {b.balances.map((m) => {
                const net = Number(m.netBalance);
                const due = Number(m.duesOutstanding);
                const canSettle = due > 0 && (m.userId === ctx.userId || ctx.isOrganizer) && ctx.canEdit;
                return (
                  <tr key={m.userId} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-semibold text-slate-900">{m.name} <span className="text-[10px] font-normal text-slate-400">{m.memberRole}</span></td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums">{money(m.totalPaid, cur)}</td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums">{money(m.totalShare, cur)}</td>
                    <td className={`py-2 pr-3 text-right font-mono font-bold tabular-nums ${net > 0 ? "text-emerald-700" : net < 0 ? "text-red-700" : "text-slate-500"}`}>{money(m.netBalance, cur, true)}</td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums">{due > 0 ? money(m.duesOutstanding, cur) : "—"}</td>
                    <td className="py-2 text-right">{canSettle && <button type="button" disabled={act.busy} onClick={() => void settle(m.userId)} className="px-2.5 py-1 text-[11px] font-bold border border-slate-300 bg-white hover:bg-slate-50 rounded-none disabled:opacity-50">Settle share</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {modal?.kind === "expense" && <ExpenseForm ctx={ctx} item={modal.item} onClose={() => setModal(null)} onSaved={() => { setModal(null); refresh(); }} />}
      {modal?.kind === "budget" && <BudgetForm ctx={ctx} category={modal.category} amount={modal.amount} onClose={() => setModal(null)} onSaved={() => { setModal(null); refresh(); }} />}
    </div>
  );
}

function BudgetForm({ ctx, category, amount, onClose, onSaved }: { ctx: TripCtx; category?: string; amount?: string; onClose: () => void; onSaved: () => void }) {
  const [cat, setCat] = useState(category ?? "food");
  const [amt, setAmt] = useState(amount && Number(amount) > 0 ? amount : "");
  const a = useAction();
  return (
    <Modal title={category ? "Edit Budget" : "Set Budget"} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); void a.run(async () => { await api(`/api/trips/${ctx.trip.tripId}/budget`, { method: "POST", body: { category: cat, plannedAmount: amt } }); onSaved(); }); }} className="space-y-4">
        <ErrorBanner message={a.error} />
        <Field text="Category" error={a.fields.category}><select className="input-sharp" value={cat} disabled={!!category} onChange={(e) => setCat(e.target.value)}>{CATS.map((c) => <option key={c} value={c}>{cap(c)}</option>)}</select></Field>
        <Field text={`Planned amount (${ctx.trip.currency})`} error={a.fields.plannedAmount}><input className="input-sharp" required inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="0.00" /></Field>
        <div className="pt-4 flex justify-end gap-2 border-t border-slate-200"><button type="button" className={btnSecondary} onClick={onClose} disabled={a.busy}>Cancel</button><button type="submit" className={btnPrimary} disabled={a.busy}>{a.busy ? "Saving…" : "Save"}</button></div>
      </form>
    </Modal>
  );
}

function ExpenseForm({ ctx, item, onClose, onSaved }: { ctx: TripCtx; item?: ExpenseDTO; onClose: () => void; onSaved: () => void }) {
  const members = useFetch<MemberDTO[]>(`/api/trips/${ctx.trip.tripId}/members`);
  const [f, setF] = useState({ category: item?.category ?? "food", amount: item?.amount ?? "", description: item?.description ?? "", expenseDate: item?.expenseDate ?? ctx.trip.startDate, paidBy: String(item?.paidBy ?? ctx.userId) });
  const [split, setSplit] = useState<Set<number> | null>(item ? new Set(item.splits.map((s) => s.userId)) : null); // null = everyone
  const a = useAction();
  const list = members.data ?? [];
  const chosen = split ?? new Set(list.map((m) => m.userId));
  const toggle = (id: number) => { const n = new Set(chosen); if (n.has(id)) n.delete(id); else n.add(id); setSplit(n); };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void a.run(async () => {
      const body = { category: f.category, amount: f.amount, description: f.description || undefined, expenseDate: f.expenseDate, paidBy: Number(f.paidBy), splitWith: [...chosen] };
      const base = `/api/trips/${ctx.trip.tripId}/expenses`;
      await api(item ? `${base}/${item.expenseId}` : base, { method: item ? "PUT" : "POST", body });
      onSaved();
    });
  };

  return (
    <Modal title={item ? "Edit Expense" : "Add Expense"} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <ErrorBanner message={a.error} />
        <div className="grid grid-cols-2 gap-3">
          <Field text={`Amount (${ctx.trip.currency})`} error={a.fields.amount}><input className="input-sharp" required inputMode="decimal" value={f.amount} onChange={set("amount")} placeholder="0.00" /></Field>
          <Field text="Category" error={a.fields.category}><select className="input-sharp" value={f.category} onChange={set("category")}>{CATS.map((c) => <option key={c} value={c}>{cap(c)}</option>)}</select></Field>
        </div>
        <Field text="Description" error={a.fields.description}><input className="input-sharp" maxLength={500} value={f.description} onChange={set("description")} placeholder="Dinner at Mango Tree" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field text="Date (DD/MM/YYYY)" error={a.fields.expenseDate}><DateInput required value={f.expenseDate} onChange={set("expenseDate")} /></Field>
          <Field text="Paid by">
            <select className="input-sharp" value={f.paidBy} onChange={set("paidBy")} disabled={!ctx.isOrganizer}>
              {list.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
            </select>
          </Field>
        </div>
        <div>
          <span className="block text-xs font-semibold text-slate-700 mb-1">Split equally between</span>
          <div className="flex flex-wrap gap-2">
            {list.map((m) => (
              <label key={m.userId} className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs border cursor-pointer ${chosen.has(m.userId) ? "border-slate-900 bg-slate-50 font-semibold" : "border-slate-200 text-slate-500"}`}>
                <input type="checkbox" checked={chosen.has(m.userId)} onChange={() => toggle(m.userId)} /> {m.name}
              </label>
            ))}
          </div>
          {a.fields.splitWith && <p className="mt-1 text-[11px] text-red-700">{a.fields.splitWith}</p>}
          <p className="mt-1 text-[11px] text-slate-500">Shares are calculated in whole paise; any remainder is given to the first travelers so the total is always exact.</p>
        </div>
        <div className="pt-4 flex justify-end gap-2 border-t border-slate-200"><button type="button" className={btnSecondary} onClick={onClose} disabled={a.busy}>Cancel</button><button type="submit" className={btnPrimary} disabled={a.busy || chosen.size === 0 || members.loading}>{a.busy ? "Saving…" : item ? "Save changes" : "Add Expense"}</button></div>
      </form>
    </Modal>
  );
}
