import Link from "next/link";
import Navbar from "@/components/Navbar";

const stores = [
  { name: "PostgreSQL 16", role: "Source of truth", data: "Users, trips, members, destinations, transport, stays, expenses, splits, payments, budgets, itinerary time slots", why: "Strongly relational data with money and permissions: needs foreign keys, CHECK constraints, triggers and ACID transactions." },
  { name: "MongoDB", role: "Activity documents", data: "Description, tags, location, notes, estimated cost and per-type custom fields of every activity", why: "Semi-structured and different per activity type; a JSON-schema validator keeps it safe while $facet aggregations summarise it." },
  { name: "pgvector (in PostgreSQL)", role: "Semantic search", data: "384-d all-MiniLM-L6-v2 embeddings of each activity, plus a tsvector for full-text search", why: "Meaning-based retrieval by cosine similarity (HNSW index) next to the rows it describes — no extra service to keep in sync." },
];

const features = [
  ["Transactions", "Trip + organizer + destination, expense + splits, activity slot + index row are each atomic."],
  ["Triggers & functions", "Trip-window, last-organizer, same-trip destination, member checks, and a deferred trigger that forces splits to equal the expense amount."],
  ["Views", "vw_trip_timeline, vw_budget_vs_actual, vw_member_balances — read by the API."],
  ["Indexing", "B-tree composites for itinerary/budget queries, GIN for full-text, HNSW for vectors."],
  ["Full-text search", "Generated weighted tsvector, ranked with ts_rank_cd."],
  ["NoSQL aggregation", "MongoDB $group and $facet pipelines for cost and tag summaries."],
  ["Vector similarity", "Cosine distance (<=>) over pgvector with honest keyword fallback when the model is unavailable."],
];

export default function ArchitecturePage() {
  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10 space-y-10">
        <header className="pb-6 border-b border-slate-200">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Developer Architecture</span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-950 tracking-tight mt-1">One application, three data models</h1>
          <p className="text-sm text-slate-600 mt-2 max-w-3xl leading-relaxed">
            Each kind of data lives where it is strongest. PostgreSQL is always the source of truth; the other stores are linked by the activity&apos;s ObjectId and can be repaired from PostgreSQL at any time.
          </p>
        </header>

        <section>
          <h2 className="text-base font-bold text-slate-950 mb-3">Where data lives</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {stores.map((s) => (
              <div key={s.name} className="p-4 border border-slate-300 bg-white shadow-sm">
                <div className="text-[10px] font-mono font-bold uppercase text-slate-500">{s.role}</div>
                <h3 className="text-sm font-bold text-slate-950 mt-0.5">{s.name}</h3>
                <p className="text-xs text-slate-700 mt-2"><strong>Holds:</strong> {s.data}</p>
                <p className="text-xs text-slate-600 mt-2"><strong>Why:</strong> {s.why}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-base font-bold text-slate-950 mb-3">Request flow</h2>
          <div className="p-4 border border-slate-300 bg-white shadow-sm text-xs font-mono text-slate-700 leading-relaxed">
            Browser (Next.js UI) → Route Handler (session cookie, role + membership check, zod validation) → service layer → PostgreSQL / MongoDB → JSON envelope → UI state update
          </div>
          <ul className="mt-3 text-xs text-slate-600 space-y-1.5 list-disc pl-5">
            <li><strong>Create activity:</strong> PostgreSQL transaction (slot + search row) → MongoDB insert (rolled back in PostgreSQL if it fails) → embedding generated and stored, or left &quot;pending&quot;.</li>
            <li><strong>Delete activity:</strong> PostgreSQL first; MongoDB delete is best-effort and any leftover document is removed by the admin reconcile job.</li>
            <li><strong>Search:</strong> query embedded locally → cosine similarity in pgvector. If the model cannot load, full-text search is used and the UI says so.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-bold text-slate-950 mb-3">Advanced database features in use</h2>
          <div className="border border-slate-300 bg-white shadow-sm divide-y divide-slate-100">
            {features.map(([name, text]) => (
              <div key={name} className="p-3 grid grid-cols-1 sm:grid-cols-[11rem_1fr] gap-1 text-xs">
                <span className="font-bold text-slate-950">{name}</span>
                <span className="text-slate-600">{text}</span>
              </div>
            ))}
          </div>
        </section>

        <div className="pt-4 border-t border-slate-200 text-xs text-slate-500">
          Full documentation, ER diagram and test results live in the repository&apos;s <span className="font-mono">docs/</span> folder. <Link href="/" className="text-blue-600 hover:text-blue-800 font-semibold">← Back to home</Link>
        </div>
      </main>
    </div>
  );
}
