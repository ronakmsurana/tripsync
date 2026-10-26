"use client";

import Link from "next/link";
import Navbar from "@/components/Navbar";
import { useState } from "react";

export default function HomePage() {
  const [conflictResolved, setConflictResolved] = useState(false);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col">
      <Navbar />

      {/* Hero Section */}
      <section className="border-b border-slate-200 bg-white py-16 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            {/* Category Tag */}
            <div className="inline-flex items-center gap-2 px-2.5 py-1 border border-slate-300 bg-slate-50 text-slate-800 text-[11px] font-bold uppercase tracking-wider mb-6">
              <span className="w-1.5 h-1.5 bg-blue-600 rounded-none" />
              <span>Real-Time Group Travel Platform</span>
            </div>

            <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-slate-950 leading-[1.1]">
              Travel without schedule collisions.
            </h1>

            <p className="mt-5 text-base sm:text-lg text-slate-600 leading-relaxed max-w-2xl">
              Strict travel bookings (flights, trains, hotel check-ins) rarely play nice with flexible vacation plans.
              TripSync bridges rigid logistics and daily adventures with live overlap detection, unified visual schedules, and transparent group expense sharing.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/dashboard/1"
                className="px-5 py-3 text-xs sm:text-sm font-bold bg-slate-950 hover:bg-slate-800 text-white border border-slate-950 rounded-none transition-colors shadow-sm flex items-center gap-2"
              >
                <span>Launch Hampi Trip Demo</span>
                <span>→</span>
              </Link>

              <Link
                href="/dashboard"
                className="px-5 py-3 text-xs sm:text-sm font-bold bg-white hover:bg-slate-50 text-slate-900 border border-slate-300 rounded-none transition-colors shadow-sm"
              >
                <span>All Trips</span>
              </Link>
            </div>

            {/* Sharp Stats Bar */}
            <div className="mt-12 pt-8 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-3 border border-slate-200 bg-slate-50">
                <div className="text-xl font-bold text-slate-950">100%</div>
                <div className="text-[11px] font-medium text-slate-500 mt-0.5">Automated Clash Detection</div>
              </div>
              <div className="p-3 border border-slate-200 bg-slate-50">
                <div className="text-xl font-bold text-blue-600">&lt; 10ms</div>
                <div className="text-[11px] font-medium text-slate-500 mt-0.5">Timeline Sync Speed</div>
              </div>
              <div className="p-3 border border-slate-200 bg-slate-50">
                <div className="text-xl font-bold text-slate-950">Real-Time</div>
                <div className="text-[11px] font-medium text-slate-500 mt-0.5">Group Expense Splits</div>
              </div>
              <div className="p-3 border border-slate-200 bg-slate-50">
                <div className="text-xl font-bold text-emerald-600">Smart AI</div>
                <div className="text-[11px] font-medium text-slate-500 mt-0.5">Vibe &amp; Activity Search</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Live Interactive Conflict Simulator */}
      <section className="py-16 bg-[#f8fafc] border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mb-8">
            <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">
              Interactive Feature Preview
            </span>
            <h2 className="text-2xl font-bold text-slate-950 mt-1">
              How TripSync Protects Your Itinerary
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-1">
              Try auto-resolving a schedule collision where a morning temple walk overlaps with mandatory hotel checkout.
            </p>
          </div>

          <div className="max-w-4xl border border-slate-300 bg-white p-6 sm:p-8 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200">
              <div>
                <span className="text-[11px] font-mono font-bold uppercase text-slate-500">
                  Day 4 Schedule • Departure Morning
                </span>
                <h3 className="text-base font-bold text-slate-950 mt-0.5">
                  Hotel Check-out vs. Royal Enclosure Walk
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setConflictResolved(!conflictResolved)}
                className={`px-4 py-2 text-xs font-bold rounded-none border transition-colors ${
                  conflictResolved
                    ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                    : "bg-blue-600 hover:bg-blue-700 text-white border-blue-600"
                }`}
              >
                {conflictResolved ? "✓ Resolved (Slot Shifted)" : "Auto-Resolve Schedule Conflict"}
              </button>
            </div>

            <div className="mt-6 space-y-3">
              {/* Hotel checkout */}
              <div className="p-4 border border-slate-300 bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-lg">🏨</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-950">
                        Heritage Resort Hampi — Room Check-Out
                      </span>
                      <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase border border-slate-300 bg-white text-slate-700">
                        Fixed Booking
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Rooms must be vacated, bills settled, and luggage stored before departure.
                    </p>
                  </div>
                </div>
                <span className="text-xs font-mono font-bold text-slate-800">11:00 AM</span>
              </div>

              {/* Activity */}
              <div
                className={`p-4 border transition-colors ${
                  conflictResolved
                    ? "border-emerald-300 bg-emerald-50/50"
                    : "border-red-300 bg-red-50/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">🏛️</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-950">
                          Lotus Mahal &amp; Elephant Stables Walk
                        </span>
                        <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase border border-slate-300 bg-white text-slate-700">
                          Daily Plan
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Guided walk through Zenana royal monuments and manicured lawns.
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold text-slate-800">
                    {conflictResolved ? "08:30 AM – 10:15 AM" : "10:15 AM – 12:00 PM"}
                  </span>
                </div>

                {!conflictResolved ? (
                  <div className="mt-3 pt-3 border-t border-red-200 flex items-start gap-2 text-xs text-red-700 font-medium">
                    <span>⚠️</span>
                    <span>
                      <strong>Schedule Clash:</strong> Activity runs until 12:00 PM, meaning travelers cannot vacate rooms or transfer luggage for checkout at 11:00 AM.
                    </span>
                  </div>
                ) : (
                  <div className="mt-3 pt-3 border-t border-emerald-200 flex items-start gap-2 text-xs text-emerald-800 font-medium">
                    <span>✓</span>
                    <span>
                      <strong>Schedule Optimized:</strong> Shifted to early morning (08:30 – 10:15 AM), leaving a safe 45-minute packing window before 11:00 AM checkout.
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Capabilities Grid */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mb-12">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Engineered For Effortless Group Travel
            </span>
            <h2 className="text-2xl font-bold text-slate-950 mt-1">
              Everything in one unified workspace
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 border border-slate-200 bg-slate-50">
              <div className="w-10 h-10 border border-slate-300 bg-white flex items-center justify-center text-lg mb-4">
                ✈️
              </div>
              <h3 className="text-base font-bold text-slate-950 mb-2">Transit &amp; Stays Ledger</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Record flights, trains, car shuttles, and hotels with confirmation codes, check-in windows, and exact departure times.
              </p>
            </div>

            <div className="p-6 border border-slate-200 bg-slate-50">
              <div className="w-10 h-10 border border-slate-300 bg-white flex items-center justify-center text-lg mb-4">
                🧭
              </div>
              <h3 className="text-base font-bold text-slate-950 mb-2">Smart Vibe Discovery</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Find activities by mood or keyword (&quot;peaceful temple sunrise&quot;, &quot;river rapids&quot;) with real-time relevance matching.
              </p>
            </div>

            <div className="p-6 border border-slate-200 bg-slate-50">
              <div className="w-10 h-10 border border-slate-300 bg-white flex items-center justify-center text-lg mb-4">
                💳
              </div>
              <h3 className="text-base font-bold text-slate-950 mb-2">Split &amp; Settle Instantly</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Log shared bills, track who paid what, and settle balances transparently without confusing spreadsheet formulas.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-8 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-900">TripSync</span>
            <span>—</span>
            <span>Synchronized Group Travel Planning</span>
          </div>

          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="text-slate-600 hover:text-slate-950 transition-colors">
              Trips
            </Link>
            <Link href="/dashboard/1" className="text-slate-600 hover:text-slate-950 transition-colors">
              Hampi Demo
            </Link>
            <Link href="/architecture" className="text-slate-400 hover:text-slate-600 transition-colors">
              Developer Architecture
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
