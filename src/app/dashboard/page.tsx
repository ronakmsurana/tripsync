"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import { MOCK_TRIPS, MockTrip } from "@/lib/data/mockData";

export default function DashboardPage() {
  const [trips, setTrips] = useState<MockTrip[]>(MOCK_TRIPS);
  const [filter, setFilter] = useState<"all" | "planning" | "confirmed" | "completed">("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTripName, setNewTripName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newStartDate, setNewStartDate] = useState("2026-12-01");
  const [newEndDate, setNewEndDate] = useState("2026-12-05");
  const [newCurrency, setNewCurrency] = useState("INR");
  const [newDestination, setNewDestination] = useState("Coorg, Karnataka");
  const [currentUser, setCurrentUser] = useState<{ name: string; role: string }>({
    name: "John Doe",
    role: "organizer",
  });

  useEffect(() => {
    const savedUser = localStorage.getItem("tripsync_user");
    if (savedUser) {
      try {
        setCurrentUser(JSON.parse(savedUser));
      } catch {
        // use default
      }
    }
  }, []);

  const handleCreateTrip = (e: React.FormEvent) => {
    e.preventDefault();
    const newTrip: MockTrip = {
      tripId: trips.length + 1,
      tripName: newTripName,
      description: newDescription,
      startDate: newStartDate,
      endDate: newEndDate,
      currency: newCurrency,
      status: "planning",
      memberRole: "organizer",
      memberCount: 1,
      creatorName: currentUser.name,
      destinations: [
        {
          id: Date.now(),
          name: newDestination,
          location: newDestination,
          arrivalDate: newStartDate,
          departureDate: newEndDate,
        },
      ],
    };

    setTrips([newTrip, ...trips]);
    setIsCreateOpen(false);
    setNewTripName("");
    setNewDescription("");
  };

  const filteredTrips = trips.filter((t) => (filter === "all" ? true : t.status === filter));

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {/* Dashboard Title Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold text-slate-950 tracking-tight">
                Trips &amp; Expeditions
              </h1>
              <span className="px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider bg-slate-100 border border-slate-300 text-slate-700">
                {currentUser.role} View
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Synchronized timelines, travel buffers, bookings, and group split accounting.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="px-4 py-2.5 text-xs font-bold text-white bg-slate-950 hover:bg-slate-800 border border-slate-950 rounded-none transition-colors self-start sm:self-auto flex items-center gap-1.5"
          >
            <span>+</span>
            <span>New Trip</span>
          </button>
        </div>

        {/* Crisp Metrics Bar */}
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 border border-slate-200 bg-white shadow-sm">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Active Trips</span>
            <div className="text-2xl font-extrabold text-slate-950 mt-1">{trips.length}</div>
            <div className="text-[11px] text-slate-500 mt-1">Planning &amp; Confirmed</div>
          </div>

          <div className="p-4 border border-slate-200 bg-white shadow-sm">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Planned Activities</span>
            <div className="text-2xl font-extrabold text-slate-950 mt-1">6</div>
            <div className="text-[11px] text-slate-500 mt-1">Hikes, dining, tours</div>
          </div>

          <div className="p-4 border border-amber-300 bg-amber-50/50 shadow-sm">
            <span className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider">Schedule Alerts</span>
            <div className="text-2xl font-extrabold text-amber-900 mt-1">1 Collision</div>
            <div className="text-[11px] text-amber-700 mt-1">Action required on Day 4</div>
          </div>

          <div className="p-4 border border-slate-200 bg-white shadow-sm">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Group Spend</span>
            <div className="text-2xl font-extrabold text-slate-950 mt-1 tabular-nums">₹49,300</div>
            <div className="text-[11px] text-slate-500 mt-1">82.2% of planned budget</div>
          </div>
        </div>

        {/* Filter Navigation */}
        <div className="mt-8 flex items-center justify-between border-b border-slate-200 pb-2">
          <div className="flex items-center gap-1">
            {(["all", "planning", "confirmed", "completed"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setFilter(tab)}
                className={`px-3 py-1.5 text-xs font-semibold capitalize rounded-none border transition-colors ${
                  filter === tab
                    ? "bg-slate-900 text-white border-slate-900"
                    : "text-slate-600 hover:text-slate-900 bg-white border-transparent hover:border-slate-300"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="text-xs text-slate-500">
            {filteredTrips.length} trip{filteredTrips.length === 1 ? "" : "s"} found
          </div>
        </div>

        {/* Trips Cards Grid */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredTrips.map((t) => {
            const hasConflict = t.tripId === 1;

            return (
              <div
                key={t.tripId}
                className="p-6 border border-slate-200 bg-white hover:border-slate-400 transition-colors shadow-sm flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-slate-500 uppercase">
                          Trip #{t.tripId}
                        </span>
                        <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase border border-slate-200 bg-slate-50 text-slate-700">
                          {t.status}
                        </span>
                        {hasConflict && (
                          <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase border border-amber-300 bg-amber-50 text-amber-800">
                            ⚠️ Schedule Alert
                          </span>
                        )}
                      </div>

                      <h2 className="text-lg font-bold text-slate-950 mt-1.5">
                        {t.tripName}
                      </h2>
                    </div>

                    <span className="text-xs font-mono font-bold px-2 py-0.5 border border-slate-200 bg-slate-50 text-slate-700">
                      {t.currency}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 mt-3 leading-relaxed">
                    {t.description}
                  </p>

                  {/* Trip Details Matrix */}
                  <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-slate-400 text-[11px] block">Dates</span>
                      <span className="text-slate-800 font-mono font-medium">
                        {t.startDate} → {t.endDate}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-400 text-[11px] block">Primary Area</span>
                      <span className="text-slate-800 font-medium truncate block">
                        {t.destinations[0]?.name || "Not specified"}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-400 text-[11px] block">Organizer</span>
                      <span className="text-slate-800 font-medium">{t.creatorName}</span>
                    </div>

                    <div>
                      <span className="text-slate-400 text-[11px] block">Party</span>
                      <span className="text-slate-800 font-medium">{t.memberCount} Travelers</span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-200 flex items-center justify-between">
                  <div className="text-xs">
                    {hasConflict ? (
                      <span className="text-amber-700 font-medium">Review departure day timing</span>
                    ) : (
                      <span className="text-emerald-700 font-medium">✓ All transit &amp; stays synchronized</span>
                    )}
                  </div>

                  <Link
                    href={`/dashboard/${t.tripId}`}
                    className="px-4 py-2 text-xs font-bold text-white bg-slate-950 hover:bg-slate-800 border border-slate-950 rounded-none transition-colors"
                  >
                    Open Itinerary →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Sharp Create Trip Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs">
          <div className="w-full max-w-lg p-6 bg-white border border-slate-300 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-950">Create New Trip</h3>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="text-slate-400 hover:text-slate-900 text-sm font-bold p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTrip} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Trip Name</label>
                <input
                  type="text"
                  value={newTripName}
                  onChange={(e) => setNewTripName(e.target.value)}
                  placeholder="e.g. Kerala Backwaters & Munnar Hills"
                  required
                  className="input-sharp"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Trip Summary</label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Outline trip focus and general itinerary..."
                  rows={2}
                  className="input-sharp"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={newStartDate}
                    onChange={(e) => setNewStartDate(e.target.value)}
                    required
                    className="input-sharp"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={newEndDate}
                    onChange={(e) => setNewEndDate(e.target.value)}
                    required
                    className="input-sharp"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Primary Destination</label>
                  <input
                    type="text"
                    value={newDestination}
                    onChange={(e) => setNewDestination(e.target.value)}
                    placeholder="e.g. Munnar, Kerala"
                    required
                    className="input-sharp"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Currency</label>
                  <select
                    value={newCurrency}
                    onChange={(e) => setNewCurrency(e.target.value)}
                    className="input-sharp"
                  >
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-950 border border-slate-300 bg-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-slate-950 hover:bg-slate-800 border border-slate-950"
                >
                  Save &amp; Open
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
