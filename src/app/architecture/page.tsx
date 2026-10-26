"use client";

import Link from "next/link";
import Navbar from "@/components/Navbar";

export default function ArchitecturePage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-slate-100 flex flex-col selection:bg-indigo-500 selection:text-white">
      <Navbar />

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10 sm:py-14 space-y-12">
        {/* Title */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-4">
            DBMS Level 3 Capstone Architecture
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            TripSync System Architecture &amp; Database Strategy
          </h1>
          <p className="mt-4 text-sm sm:text-base text-slate-300 leading-relaxed">
            Technical blueprint explaining multi-database partitioning across PostgreSQL, MongoDB, and pgvector, complete with DDL, triggers, views, stored functions, and the cross-DB conflict detection pipeline.
          </p>
        </div>

        {/* Section 1: Multi-Database Paradigm Breakdown */}
        <section className="p-6 sm:p-8 rounded-2xl bg-[#12121c] border border-[#242436] space-y-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span>🗄️</span> 1. Multi-Database Paradigm Justification
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#181826] text-slate-400 border-b border-[#26263a]">
                <tr>
                  <th className="p-3 font-semibold">Database Paradigm</th>
                  <th className="p-3 font-semibold">Technology</th>
                  <th className="p-3 font-semibold">Data Managed</th>
                  <th className="p-3 font-semibold">Engineering Justification</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e1e2d] text-slate-300">
                <tr>
                  <td className="p-3 font-bold text-blue-400">Relational (SQL)</td>
                  <td className="p-3 font-mono text-white">PostgreSQL 16</td>
                  <td className="p-3">Users, Trips, Flights, Hotels, Expenses, Splits, Itinerary Slots</td>
                  <td className="p-3 text-slate-400">Strict foreign key cascades, date integrity checks, ACID transaction guarantees for expense splitting.</td>
                </tr>
                <tr>
                  <td className="p-3 font-bold text-emerald-400">Document (NoSQL)</td>
                  <td className="p-3 font-mono text-white">MongoDB 7</td>
                  <td className="p-3">Dynamic activities, media, tags, custom fields, member notes</td>
                  <td className="p-3 text-slate-400">Highly polymorphic activity documents where schemas change constantly (hiking vs temple visit vs dining).</td>
                </tr>
                <tr>
                  <td className="p-3 font-bold text-purple-400">Vector Search</td>
                  <td className="p-3 font-mono text-white">pgvector (Postgres)</td>
                  <td className="p-3">384-dimensional activity title &amp; description embeddings</td>
                  <td className="p-3 text-slate-400">Fast cosine similarity matching for natural language activity discovery without external vector SaaS latency.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Section 2: Relational Schema & Advanced SQL Features */}
        <section className="p-6 sm:p-8 rounded-2xl bg-[#12121c] border border-[#242436] space-y-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span>⚙️</span> 2. Advanced PostgreSQL Features (Rubric Requirement)
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Views */}
            <div className="p-5 rounded-xl bg-[#161624] border border-[#26263a]">
              <h3 className="font-bold text-indigo-400 text-sm mb-2">1. SQL Views</h3>
              <ul className="text-xs text-slate-300 space-y-2">
                <li>
                  <strong className="text-white font-mono">vw_trip_timeline</strong> — Unifies rigid transports, accommodations, and flexible itinerary slots into a single sorted chronological schedule.
                </li>
                <li>
                  <strong className="text-white font-mono">vw_budget_vs_actual</strong> — Aggregates real-time expense totals grouped by category compared against planned budgets with utilization %.
                </li>
                <li>
                  <strong className="text-white font-mono">vw_member_settlements</strong> — Computes net balance matrix (who paid what minus who owes what) across all members.
                </li>
              </ul>
            </div>

            {/* Triggers */}
            <div className="p-5 rounded-xl bg-[#161624] border border-[#26263a]">
              <h3 className="font-bold text-indigo-400 text-sm mb-2">2. PL/pgSQL Triggers</h3>
              <ul className="text-xs text-slate-300 space-y-2">
                <li>
                  <strong className="text-white font-mono">trg_validate_splits</strong> — Enforces that the sum of <code>expense_splits.share_amount</code> matches the primary <code>expenses.amount</code>.
                </li>
                <li>
                  <strong className="text-white font-mono">trg_transport_overlap_check</strong> — Automatically detects overlapping flight or transit schedules for the same trip on insert.
                </li>
                <li>
                  <strong className="text-white font-mono">trg_users_updated_at</strong> — Auto-updates timestamps on audit changes.
                </li>
              </ul>
            </div>

            {/* Stored Functions */}
            <div className="p-5 rounded-xl bg-[#161624] border border-[#26263a]">
              <h3 className="font-bold text-indigo-400 text-sm mb-2">3. Stored Functions</h3>
              <ul className="text-xs text-slate-300 space-y-2">
                <li>
                  <strong className="text-white font-mono">fn_trip_budget_summary(trip_id)</strong> — Returns planned, spent, and remaining balances per category.
                </li>
                <li>
                  <strong className="text-white font-mono">fn_detect_trip_conflicts(trip_id)</strong> — Queries time overlaps between <code>itinerary_slots</code> and logistics.
                </li>
              </ul>
            </div>

            {/* ACID Transactions */}
            <div className="p-5 rounded-xl bg-[#161624] border border-[#26263a]">
              <h3 className="font-bold text-indigo-400 text-sm mb-2">4. ACID Transactions</h3>
              <ul className="text-xs text-slate-300 space-y-2">
                <li>
                  <strong className="text-white">Expense Creation:</strong> Atomically creates the expense header, calculates equal/custom member splits, and updates balances in a single transaction rollback boundary.
                </li>
                <li>
                  <strong className="text-white">Trip Initialization:</strong> Creates trip record, registers creator as organizer in <code>trip_members</code>, and initializes default budget categories.
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* Section 3: The Cross-Database Bridge (itinerary_slots) */}
        <section className="p-6 sm:p-8 rounded-2xl bg-[#12121c] border border-[#242436] space-y-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span>🌉</span> 3. The Cross-Database Conflict Engine Algorithm
          </h2>

          <div className="p-4 rounded-xl bg-indigo-950/20 border border-indigo-500/30 text-xs text-slate-300 leading-relaxed">
            <strong className="text-indigo-300 block mb-1">Core Innovation: Temporal Skeleton Synchronization</strong>
            When an organizer or member creates or moves an activity in MongoDB, TripSync extracts the temporal boundary (<code>trip_id</code>, <code>start_time</code>, <code>end_time</code>, <code>mongo_doc_id</code>) and upserts it into the PostgreSQL <code>itinerary_slots</code> table.
          </div>

          <div className="p-5 rounded-xl bg-[#0e0e16] border border-[#222232] font-mono text-xs text-slate-300 overflow-x-auto">
            <pre>{`-- SQL Conflict Detection Query (Executed on Activity Creation / Move)
SELECT 'transport' AS conflict_source,
       t.transport_id, t.transport_type, t.departure_time, t.arrival_time
FROM transports t
WHERE t.trip_id = $tripId
  AND t.departure_time < $slotEndTime
  AND t.arrival_time > $slotStartTime

UNION ALL

SELECT 'accommodation' AS conflict_source,
       a.accommodation_id, 'hotel_checkout', a.check_out - INTERVAL '1 hour', a.check_out
FROM accommodations a
WHERE a.trip_id = $tripId
  AND a.check_out - INTERVAL '1 hour' < $slotEndTime
  AND a.check_out > $slotStartTime;`}</pre>
          </div>
        </section>

        {/* Section 4: MongoDB NoSQL Document Schema */}
        <section className="p-6 sm:p-8 rounded-2xl bg-[#12121c] border border-[#242436] space-y-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span>🍃</span> 4. MongoDB Document Schema &amp; Index Strategy
          </h2>

          <div className="p-5 rounded-xl bg-[#0e0e16] border border-[#222232] font-mono text-xs text-slate-300 overflow-x-auto">
            <pre>{`// Collection: activities
{
  "_id": ObjectId("671b..."),
  "trip_id": 1,
  "slot_type": "sightseeing",
  "title": "Sunrise at Matanga Hill Summit",
  "description": "Highest point in central Hampi with panoramic ruins view.",
  "location": {
    "name": "Matanga Hill, Hampi",
    "coordinates": { "type": "Point", "coordinates": [76.4682, 15.3324] }
  },
  "tags": ["sunrise", "trekking", "photography", "panoramic"],
  "estimated_duration_minutes": 120,
  "estimated_cost": { "amount": 300, "currency": "INR" },
  "notes": "Carry torches and good grip shoes for the granite rock steps.",
  "custom_fields": {
    "guide_required": false,
    "entry_fee": 0
  }
}

// Indexes Created:
db.activities.createIndex({ "trip_id": 1, "slot_type": 1 });
db.activities.createIndex({ "tags": 1 }); // Multikey Index for tag filtering
db.activities.createIndex({ "location.coordinates": "2dsphere" }); // Geospatial proximity`}</pre>
          </div>
        </section>

        {/* Bottom CTA */}
        <div className="text-center pt-6">
          <Link
            href="/dashboard/1"
            className="px-6 py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-lg shadow-indigo-600/30 transition-all inline-flex items-center gap-2"
          >
            <span>Test Architecture in Live Hampi Workspace</span>
            <span>→</span>
          </Link>
        </div>
      </main>
    </div>
  );
}
