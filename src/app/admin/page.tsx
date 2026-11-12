"use client";

import { useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { Badge, EmptyState, ErrorBanner, Loading, Notice, Stat, btnLink, btnPrimary } from "@/components/ui";
import { api, useAuth, useFetch } from "@/lib/client/api";
import { useAction } from "@/components/trip/shared";

interface Overview {
  counts: { users: number; trips: number; slots: number; mongoDocuments: number; embeddingsSynced: number; embeddingsPending: number };
  drift: { slotsWithoutDocument: number; documentsWithoutSlot: number };
  users: { userId: number; name: string; email: string; role: string; status: string; trips: number; createdAt: string }[];
  embedding: { enabled: boolean; model: string; lastError?: string };
}

export default function AdminPage() {
  const { user } = useAuth();
  const ov = useFetch<Overview>(user?.role === "admin" ? "/api/admin/overview" : null);
  const act = useAction();
  const [report, setReport] = useState<string | null>(null);

  if (user === undefined) return <div className="min-h-screen bg-[#f8fafc]"><Navbar /><Loading /></div>;
  if (user?.role !== "admin") {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex flex-col"><Navbar />
        <main className="max-w-3xl mx-auto w-full px-4 py-16"><EmptyState title="Administrator access required" hint="This page is only available to administrator accounts." action={<Link href="/dashboard" className={btnPrimary}>← Back to trips</Link>} /></main>
      </div>
    );
  }

  const reconcile = () => act.run(async () => {
    const r = await api<Record<string, unknown> & { embeddings: { attempted: number; synced: number; modelAvailable: boolean } }>("/api/admin/reconcile", { method: "POST", body: {} });
    setReport(`Recreated ${r.recreatedDocuments} missing document(s), removed ${r.deletedOrphanDocuments} orphan document(s), created ${r.createdIndexRows} index row(s), removed ${r.deletedOrphanIndexRows} orphan index row(s). Embeddings: ${r.embeddings.synced}/${r.embeddings.attempted} generated${r.embeddings.modelAvailable ? "" : " (model unavailable)"}.`);
    await ov.reload();
  });
  const patch = (id: number, body: { role?: string; status?: string }) => act.run(async () => { await api(`/api/admin/users/${id}`, { method: "PATCH", body }); await ov.reload(); });

  const d = ov.data;
  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="pb-4 border-b border-slate-200">
          <h1 className="text-2xl font-bold text-slate-950 tracking-tight">System Administration</h1>
          <p className="text-xs text-slate-500 mt-1">Health of the three data stores and account management. Administrators cannot read users&apos; private trip content.</p>
        </div>

        {ov.error && <ErrorBanner message={ov.error.message} onRetry={ov.reload} />}
        <ErrorBanner message={act.error} />
        {!d && !ov.error && <Loading />}

        {d && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat title="Users" value={d.counts.users} />
              <Stat title="Trips" value={d.counts.trips} />
              <Stat title="Activities (PostgreSQL)" value={d.counts.slots} sub={`${d.counts.mongoDocuments} documents in MongoDB`} />
              <Stat tone={d.counts.embeddingsPending > 0 ? "amber" : "default"} title="Vector index" value={`${d.counts.embeddingsSynced} / ${d.counts.embeddingsSynced + d.counts.embeddingsPending}`} sub={d.counts.embeddingsPending > 0 ? `${d.counts.embeddingsPending} pending embedding(s)` : "all embedded"} />
            </div>

            <section className="p-5 border border-slate-200 bg-white shadow-sm space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-950">Cross-database consistency</h2>
                  <p className="text-xs text-slate-600">PostgreSQL is the source of truth. Reconcile repairs MongoDB documents and the search index, and generates any missing embeddings. It is safe to run repeatedly.</p>
                </div>
                <button type="button" disabled={act.busy} onClick={() => void reconcile()} className={btnPrimary}>{act.busy ? "Working…" : "Run reconcile"}</button>
              </div>
              {(d.drift.slotsWithoutDocument > 0 || d.drift.documentsWithoutSlot > 0) && <Notice tone="warn">Counts differ: {d.drift.slotsWithoutDocument} activities lack a document, {d.drift.documentsWithoutSlot} documents lack an activity. Run reconcile.</Notice>}
              {report && <Notice tone="ok">{report}</Notice>}
              <div className="text-xs text-slate-600">
                Embedding model: <span className="font-mono">{d.embedding.model}</span> · {d.embedding.enabled ? (d.embedding.lastError ? <Badge tone="red">failed to load</Badge> : <Badge tone="green">enabled</Badge>) : <Badge>disabled</Badge>}
                {d.embedding.lastError && <div className="mt-1 text-red-700">{d.embedding.lastError}</div>}
              </div>
            </section>

            <section className="p-5 border border-slate-200 bg-white shadow-sm">
              <h2 className="text-base font-bold text-slate-950 mb-3">Users</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200"><th className="py-2 pr-3">Name</th><th className="py-2 pr-3">Email</th><th className="py-2 pr-3">Role</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3 text-right">Trips</th><th className="py-2" /></tr></thead>
                  <tbody>
                    {d.users.map((u) => (
                      <tr key={u.userId} className="border-b border-slate-100">
                        <td className="py-2 pr-3 font-semibold">{u.name}</td>
                        <td className="py-2 pr-3 text-slate-600">{u.email}</td>
                        <td className="py-2 pr-3">{u.role === "admin" ? <Badge tone="blue">admin</Badge> : <Badge>user</Badge>}</td>
                        <td className="py-2 pr-3">{u.status === "active" ? <Badge tone="green">active</Badge> : <Badge tone="red">suspended</Badge>}</td>
                        <td className="py-2 pr-3 text-right font-mono">{u.trips}</td>
                        <td className="py-2 text-right whitespace-nowrap">
                          {u.userId !== user.userId && (
                            <span className="flex gap-3 justify-end">
                              <button type="button" className={btnLink} disabled={act.busy} onClick={() => void patch(u.userId, { status: u.status === "active" ? "suspended" : "active" })}>{u.status === "active" ? "Suspend" : "Reactivate"}</button>
                              <button type="button" className={btnLink} disabled={act.busy} onClick={() => void patch(u.userId, { role: u.role === "admin" ? "user" : "admin" })}>{u.role === "admin" ? "Remove admin" : "Make admin"}</button>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
