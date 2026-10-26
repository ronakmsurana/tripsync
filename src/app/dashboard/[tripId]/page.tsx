"use client";

import { use, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import {
  MOCK_TRIPS,
  MOCK_TIMELINE_ITEMS,
  MOCK_BUDGET_DATA,
  MOCK_SEARCH_ACTIVITIES,
  MockTimelineItem,
} from "@/lib/data/mockData";

export default function TripDetailPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const resolvedParams = use(params);
  const tripId = parseInt(resolvedParams.tripId) || 1;
  const trip = MOCK_TRIPS.find((t) => t.tripId === tripId) || MOCK_TRIPS[0];

  const [activeTab, setActiveTab] = useState<
    "timeline" | "logistics" | "activities" | "budget" | "conflicts"
  >("timeline");

  const [items, setItems] = useState<MockTimelineItem[]>(MOCK_TIMELINE_ITEMS);
  const [categoryFilter, setCategoryFilter] = useState<"all" | "transit" | "stay" | "experience">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState(MOCK_SEARCH_ACTIVITIES);
  const [isSearching, setIsSearching] = useState(false);
  const [isAddActivityOpen, setIsAddActivityOpen] = useState(false);

  // New activity form states
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState("sightseeing");
  const [newStartTime, setNewStartTime] = useState("2026-11-03T14:00");
  const [newEndTime, setNewEndTime] = useState("2026-11-03T16:00");
  const [newTags, setNewTags] = useState("heritage, unesco, sunset");
  const [newCost, setNewCost] = useState("500");
  const [newNotes, setNewNotes] = useState("Bring water and wear comfortable walking shoes.");

  // Budget settlements
  const [memberBalances, setMemberBalances] = useState(MOCK_BUDGET_DATA.memberBalances);

  // Active conflicts check
  const activeConflicts = items.filter((item) => item.conflict);

  // Filter items based on category tab
  const filteredTimeline = items.filter((item) => {
    if (categoryFilter === "transit") return item.category === "transit";
    if (categoryFilter === "stay") return item.category === "stay";
    if (categoryFilter === "experience") return item.category === "experience";
    return true;
  });

  // Resolve schedule collision
  const handleResolveConflict = (itemId: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          return {
            ...item,
            startTime: "2026-11-04T08:30:00Z",
            endTime: "2026-11-04T10:15:00Z",
            conflict: undefined,
          };
        }
        return item;
      })
    );
  };

  // Add new activity
  const handleAddActivity = (e: React.FormEvent) => {
    e.preventDefault();
    const newDocId = "act-" + Date.now();
    const tagsArray = newTags.split(",").map((t) => t.trim().toLowerCase());

    const newItem: MockTimelineItem = {
      id: newDocId,
      category: "experience",
      type: newType,
      title: newTitle,
      startTime: new Date(newStartTime).toISOString(),
      endTime: new Date(newEndTime).toISOString(),
      cost: parseFloat(newCost) || 0,
      currency: "INR",
      isFixed: false,
      tags: tagsArray,
      description: "Custom traveler activity added to group schedule.",
      notes: newNotes,
    };

    // Check collision against hotel checkout
    const start = new Date(newItem.startTime).getTime();
    const end = new Date(newItem.endTime).getTime();
    const checkoutTime = new Date("2026-11-04T11:00:00Z").getTime();

    if (start < checkoutTime && end > checkoutTime) {
      newItem.conflict = {
        severity: "critical",
        message: "Activity overlaps with Hotel Checkout at 11:00 AM.",
        conflictingWith: "Heritage Resort Hampi (Checkout: 11:00 AM)",
      };
    }

    setItems([...items, newItem]);
    setIsAddActivityOpen(false);
    setNewTitle("");
    setActiveTab("timeline");
  };

  // Vibe / Vector search simulation
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSearching(true);

    setTimeout(() => {
      const q = searchQuery.toLowerCase();
      if (!q) {
        setSearchResults(MOCK_SEARCH_ACTIVITIES);
      } else {
        const filtered = MOCK_SEARCH_ACTIVITIES.map((act) => {
          let score = 0.65;
          if (act.tags.some((t) => q.includes(t) || t.includes(q))) score += 0.2;
          if (act.title.toLowerCase().includes(q)) score += 0.15;
          if (act.description.toLowerCase().includes(q)) score += 0.1;
          return {
            ...act,
            similarity: Math.min(0.98, parseFloat(score.toFixed(2))),
          };
        }).sort((a, b) => b.similarity - a.similarity);

        setSearchResults(filtered);
      }
      setIsSearching(false);
    }, 150);
  };

  // Settle debt
  const handleSettle = (userId: number) => {
    setMemberBalances((prev) =>
      prev.map((m) =>
        m.userId === userId
          ? { ...m, netBalance: 0, status: "settled" }
          : m
      )
    );
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-3">
          <Link href="/dashboard" className="hover:text-slate-900 transition-colors">
            All Trips
          </Link>
          <span>/</span>
          <span className="text-slate-900 font-medium">{trip.tripName}</span>
        </div>

        {/* Trip Header Banner */}
        <div className="p-6 border border-slate-300 bg-white shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase border border-slate-300 bg-slate-50 text-slate-700">
                  {trip.status}
                </span>
                <span className="text-xs text-slate-600 font-mono font-semibold">
                  {trip.startDate} → {trip.endDate}
                </span>
                <span className="text-slate-300">•</span>
                <span className="text-xs text-slate-700 font-medium">
                  {trip.destinations[0]?.name}
                </span>
                {activeConflicts.length > 0 && (
                  <span className="px-2 py-0.5 text-[10px] font-bold uppercase border border-amber-300 bg-amber-50 text-amber-800 flex items-center gap-1">
                    <span>⚠️</span> {activeConflicts.length} Collision Detected
                  </span>
                )}
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-950 tracking-tight">
                {trip.tripName}
              </h1>

              <p className="text-xs sm:text-sm text-slate-600 mt-2 max-w-3xl leading-relaxed">
                {trip.description}
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setIsAddActivityOpen(true)}
                className="px-4 py-2.5 text-xs font-bold text-white bg-slate-950 hover:bg-slate-800 border border-slate-950 rounded-none transition-colors shadow-sm flex items-center gap-1.5"
              >
                <span>+</span>
                <span>Add Activity</span>
              </button>
            </div>
          </div>

          {/* Quick Collision Alert Box */}
          {activeConflicts.length > 0 && (
            <div className="mt-5 p-3.5 border border-amber-300 bg-amber-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-amber-900 font-medium">
                <span className="text-base">⚠️</span>
                <span>
                  <strong>Schedule Collision:</strong> &quot;{activeConflicts[0].title}&quot; on Nov 4 overlaps with Hotel Checkout at 11:00 AM.
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleResolveConflict(activeConflicts[0].id)}
                className="px-3 py-1.5 text-xs font-bold text-black bg-amber-400 hover:bg-amber-300 border border-amber-500 rounded-none transition-colors self-start sm:self-auto"
              >
                Adjust Slot to 08:30 AM
              </button>
            </div>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="mt-6 border-b border-slate-200 flex items-center gap-1 overflow-x-auto">
          {[
            { id: "timeline", label: "Unified Timeline", badge: items.length },
            { id: "logistics", label: "Transit & Stays", badge: 3 },
            { id: "activities", label: "Experiences & AI Search", badge: items.filter(i => i.category === "experience").length },
            { id: "budget", label: "Expenses & Splits", badge: "Live" },
            {
              id: "conflicts",
              label: "Schedule Assistant",
              badge: activeConflicts.length,
              badgeAlert: activeConflicts.length > 0,
            },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-colors border-b-2 flex items-center gap-1.5 ${
                activeTab === tab.id
                  ? "border-slate-950 text-slate-950 bg-white"
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`px-1.5 py-0.2 text-[10px] font-mono ${
                  tab.badgeAlert
                    ? "bg-amber-100 text-amber-900 font-bold border border-amber-300"
                    : "bg-slate-100 text-slate-600 border border-slate-200"
                }`}
              >
                {tab.badge}
              </span>
            </button>
          ))}
        </div>

        {/* ========================================================= */}
        {/* TAB 1: UNIFIED TIMELINE */}
        {/* ========================================================= */}
        {activeTab === "timeline" && (
          <div className="mt-6 space-y-5">
            {/* Filter Pills */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-1">
                <span className="text-xs text-slate-500 font-semibold mr-1">View:</span>
                {(["all", "transit", "stay", "experience"] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-2.5 py-1 text-xs font-semibold capitalize rounded-none border transition-colors ${
                      categoryFilter === cat
                        ? "bg-slate-900 text-white border-slate-900"
                        : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                    }`}
                  >
                    {cat === "all" ? "All Entries" : cat === "transit" ? "Flights & Transit" : cat === "stay" ? "Hotels & Stays" : "Experiences"}
                  </button>
                ))}
              </div>

              <span className="text-xs text-slate-500">
                {filteredTimeline.length} scheduled events
              </span>
            </div>

            {/* Timeline Stream */}
            <div className="space-y-3">
              {filteredTimeline.map((item) => {
                const hasConflict = !!item.conflict;

                return (
                  <div
                    key={item.id}
                    className={`p-4 border transition-colors ${
                      hasConflict
                        ? "border-amber-400 bg-amber-50/40"
                        : "border-slate-200 bg-white hover:border-slate-400"
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-2.5 border-b border-slate-100">
                      <div className="flex items-start gap-3">
                        <span className="text-xl mt-0.5">
                          {item.type === "flight"
                            ? "✈️"
                            : item.type === "hotel"
                            ? "🏨"
                            : item.type === "transfer"
                            ? "🚖"
                            : item.type === "dining"
                            ? "🍽️"
                            : item.type === "adventure"
                            ? "🛶"
                            : "🏛️"}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-950">
                              {item.title}
                            </span>
                            <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase border border-slate-200 bg-slate-50 text-slate-700">
                              {item.category.toUpperCase()}
                            </span>
                            {item.bookingRef && (
                              <span className="text-[11px] font-mono text-slate-500">
                                Ref: {item.bookingRef}
                              </span>
                            )}
                          </div>

                          <div className="text-xs text-slate-500 mt-0.5 font-medium">
                            {item.location}
                          </div>
                        </div>
                      </div>

                      <div className="text-left sm:text-right whitespace-nowrap">
                        <div className="text-xs font-mono font-bold text-slate-900">
                          {new Date(item.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          {" → "}
                          {new Date(item.endTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500">
                          {new Date(item.startTime).toLocaleDateString("en-US", {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="mt-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                      <p className="text-slate-600 leading-relaxed">
                        {item.description}
                      </p>
                      {item.cost !== undefined && (
                        <div className="whitespace-nowrap font-mono font-bold text-slate-900">
                          ₹{item.cost.toLocaleString()}
                        </div>
                      )}
                    </div>

                    {/* Notes & Tags */}
                    {item.notes && (
                      <div className="mt-2 text-[11px] text-slate-600 bg-slate-50 p-2 border border-slate-200">
                        <strong>Traveler Tip:</strong> {item.notes}
                      </div>
                    )}

                    {/* Collision banner */}
                    {hasConflict && (
                      <div className="mt-3 p-3 border border-amber-300 bg-amber-50 flex items-start justify-between gap-3 text-xs">
                        <div className="text-amber-900">
                          <strong>⚠️ Schedule Clash:</strong> {item.conflict?.message}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleResolveConflict(item.id)}
                          className="px-3 py-1 text-xs font-bold text-black bg-amber-400 hover:bg-amber-300 border border-amber-500 rounded-none whitespace-nowrap"
                        >
                          Shift to 08:30 AM
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: TRANSIT & STAYS */}
        {/* ========================================================= */}
        {activeTab === "logistics" && (
          <div className="mt-6 space-y-6">
            <div>
              <h3 className="text-base font-bold text-slate-950 mb-3 flex items-center gap-2">
                <span>✈️</span> Fixed Flights &amp; Ground Transit
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {items
                  .filter((i) => i.category === "transit")
                  .map((t) => (
                    <div key={t.id} className="p-5 border border-slate-300 bg-white shadow-sm flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="font-mono font-bold text-slate-700 uppercase">
                            {t.type}
                          </span>
                          <span className="font-mono text-slate-500 font-semibold">
                            Ref: {t.bookingRef}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-slate-950">{t.title}</h4>
                        <p className="text-xs text-slate-600 mt-1">{t.location}</p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                        <span className="font-mono font-semibold text-slate-700">
                          {new Date(t.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} →{" "}
                          {new Date(t.endTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <span className="font-mono font-bold text-slate-950">₹{t.cost?.toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            <div>
              <h3 className="text-base font-bold text-slate-950 mb-3 flex items-center gap-2">
                <span>🏨</span> Stays &amp; Accommodations
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {items
                  .filter((i) => i.category === "stay")
                  .map((h) => (
                    <div key={h.id} className="p-5 border border-slate-300 bg-white shadow-sm flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="font-mono font-bold text-slate-700 uppercase">
                            HOTEL
                          </span>
                          <span className="font-mono text-slate-500 font-semibold">
                            Booking: {h.bookingRef}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-slate-950">{h.title}</h4>
                        <p className="text-xs text-slate-600 mt-1">{h.location}</p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                        <span className="font-mono font-semibold text-slate-700">Check-out: Nov 4, 11:00 AM</span>
                        <span className="font-mono font-bold text-slate-950">₹{h.cost?.toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: EXPERIENCES & AI VIBE DISCOVERY */}
        {/* ========================================================= */}
        {activeTab === "activities" && (
          <div className="mt-6 space-y-6">
            {/* Vibe Search Bar */}
            <div className="p-5 border border-slate-300 bg-white shadow-sm">
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700 block mb-1">
                Smart Activity Discovery
              </span>
              <h3 className="text-sm font-bold text-slate-950 mb-3">
                Find Activities by Vibe, Mood, or Keyword
              </h3>

              <form onSubmit={handleSearch} className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="e.g. peaceful sunrise temple walk or rapids river boat"
                  className="input-sharp flex-1"
                />
                <button
                  type="submit"
                  disabled={isSearching}
                  className="px-4 py-2 text-xs font-bold text-white bg-slate-950 hover:bg-slate-800 border border-slate-950 rounded-none transition-colors"
                >
                  {isSearching ? "Searching..." : "Search"}
                </button>
              </form>

              {/* Relevance list */}
              <div className="mt-4 space-y-2">
                {searchResults.map((res) => (
                  <div
                    key={res.id}
                    className="p-3 border border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-950">{res.title}</span>
                        <span className="px-1.5 py-0.2 text-[10px] font-mono border border-slate-300 bg-white text-slate-700">
                          {res.category}
                        </span>
                      </div>
                      <p className="text-slate-600 mt-0.5">{res.description}</p>
                    </div>

                    <div className="text-right whitespace-nowrap self-end sm:self-center">
                      <span className="px-2 py-0.5 text-xs font-mono font-bold bg-blue-50 text-blue-800 border border-blue-200">
                        {(res.similarity * 100).toFixed(0)}% Relevance
                      </span>
                      <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                        {res.duration} mins • ₹{res.cost}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* All Activities Grid */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-bold text-slate-950">
                  Planned Itinerary Experiences ({items.filter((i) => i.category === "experience").length})
                </h3>
                <button
                  type="button"
                  onClick={() => setIsAddActivityOpen(true)}
                  className="px-3 py-1.5 text-xs font-bold text-white bg-slate-950 hover:bg-slate-800 border border-slate-950 rounded-none"
                >
                  + Add Experience
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {items
                  .filter((i) => i.category === "experience")
                  .map((act) => (
                    <div key={act.id} className="p-5 border border-slate-300 bg-white shadow-sm flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="font-mono font-bold text-slate-700 uppercase">
                            {act.type}
                          </span>
                          <span className="font-mono text-slate-400 text-[11px]">{act.id}</span>
                        </div>
                        <h4 className="text-sm font-bold text-slate-950">{act.title}</h4>
                        <p className="text-xs text-slate-600 mt-1 leading-relaxed">{act.description}</p>

                        {act.notes && (
                          <div className="mt-3 p-2 bg-slate-50 border border-slate-200 text-xs text-slate-700">
                            <strong>Note:</strong> {act.notes}
                          </div>
                        )}
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                        <div className="flex flex-wrap gap-1">
                          {act.tags?.map((t) => (
                            <span key={t} className="text-[10px] font-mono text-slate-500">
                              #{t}
                            </span>
                          ))}
                        </div>
                        <span className="font-mono font-bold text-slate-950">
                          ₹{act.cost?.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 4: EXPENSES & SPLITS */}
        {/* ========================================================= */}
        {activeTab === "budget" && (
          <div className="mt-6 space-y-6">
            {/* Top Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 border border-slate-200 bg-white shadow-sm">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Planned Budget</span>
                <div className="text-2xl font-extrabold text-slate-950 mt-1 font-mono">
                  ₹{MOCK_BUDGET_DATA.totalPlanned.toLocaleString()}
                </div>
              </div>

              <div className="p-4 border border-slate-200 bg-white shadow-sm">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Spent</span>
                <div className="text-2xl font-extrabold text-slate-950 mt-1 font-mono">
                  ₹{MOCK_BUDGET_DATA.totalSpent.toLocaleString()}
                </div>
              </div>

              <div className="p-4 border border-slate-200 bg-white shadow-sm">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Remaining Buffer</span>
                <div className="text-2xl font-extrabold text-emerald-700 mt-1 font-mono">
                  ₹{MOCK_BUDGET_DATA.remaining.toLocaleString()}
                </div>
              </div>

              <div className="p-4 border border-slate-200 bg-white shadow-sm">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Budget Spent</span>
                <div className="text-2xl font-extrabold text-blue-700 mt-1 font-mono">
                  {MOCK_BUDGET_DATA.utilizationPct}%
                </div>
              </div>
            </div>

            {/* Category Bars */}
            <div className="p-5 border border-slate-200 bg-white shadow-sm">
              <h3 className="text-sm font-bold text-slate-950 mb-4">
                Category Spending Breakdown
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {MOCK_BUDGET_DATA.categories.map((cat) => (
                  <div key={cat.category} className="p-3 border border-slate-200 bg-slate-50 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-950">
                      <span>{cat.category}</span>
                      <span className="font-mono">{cat.utilizationPct}%</span>
                    </div>

                    <div className="w-full h-1.5 bg-slate-200 rounded-none overflow-hidden">
                      <div
                        className="h-full bg-slate-900 rounded-none"
                        style={{ width: `${Math.min(100, cat.utilizationPct)}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 pt-0.5">
                      <span>Spent: ₹{cat.spent.toLocaleString()}</span>
                      <span>Budget: ₹{cat.planned.toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Settlements Table */}
            <div className="border border-slate-200 bg-white shadow-sm">
              <div className="p-4 border-b border-slate-200">
                <h3 className="text-sm font-bold text-slate-950">
                  Traveler Balances &amp; Debt Settlements
                </h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
                    <tr>
                      <th className="p-3">Traveler</th>
                      <th className="p-3">Role</th>
                      <th className="p-3">Paid Out</th>
                      <th className="p-3">Share Owed</th>
                      <th className="p-3">Net Balance</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {memberBalances.map((m) => (
                      <tr key={m.userId} className="hover:bg-slate-50/50">
                        <td className="p-3 font-sans font-medium text-slate-950">{m.name}</td>
                        <td className="p-3 uppercase text-[10px] text-slate-600">{m.role}</td>
                        <td className="p-3 text-slate-900">₹{m.paid.toLocaleString()}</td>
                        <td className="p-3 text-slate-600">₹{m.owes.toLocaleString()}</td>
                        <td className="p-3 font-bold">
                          {m.netBalance > 0 ? (
                            <span className="text-emerald-700">+₹{m.netBalance.toLocaleString()} (gets back)</span>
                          ) : m.netBalance < 0 ? (
                            <span className="text-red-700">-₹{Math.abs(m.netBalance).toLocaleString()} (owes group)</span>
                          ) : (
                            <span className="text-slate-400">Settled ✓</span>
                          )}
                        </td>
                        <td className="p-3 text-right font-sans">
                          {m.netBalance < 0 && (
                            <button
                              type="button"
                              onClick={() => handleSettle(m.userId)}
                              className="px-2.5 py-1 text-[11px] font-bold text-white bg-slate-900 hover:bg-slate-800 border border-slate-900 rounded-none transition-colors"
                            >
                              Settle Share
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 5: SCHEDULE ASSISTANT / CONFLICT RESOLUTION */}
        {/* ========================================================= */}
        {activeTab === "conflicts" && (
          <div className="mt-6 space-y-4">
            <div className="p-5 border border-slate-200 bg-white shadow-sm">
              <h3 className="text-base font-bold text-slate-950 mb-1">Schedule Collision Center</h3>
              <p className="text-xs text-slate-600">
                TripSync continuously audits daily activities against flight departure schedules, car transfer times, and hotel checkout hours.
              </p>

              <div className="mt-4 space-y-3">
                {activeConflicts.length > 0 ? (
                  activeConflicts.map((c) => (
                    <div key={c.id} className="p-4 border border-amber-400 bg-amber-50/50">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2.5 border-b border-amber-200">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-950">{c.title}</span>
                            <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase border border-red-300 bg-red-100 text-red-900">
                              Schedule Collision
                            </span>
                          </div>
                          <p className="text-xs text-slate-700 mt-1">{c.conflict?.message}</p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleResolveConflict(c.id)}
                          className="px-3 py-1.5 text-xs font-bold text-black bg-amber-400 hover:bg-amber-300 border border-amber-500 rounded-none whitespace-nowrap self-start sm:self-auto"
                        >
                          Auto-Adjust Time
                        </button>
                      </div>

                      <div className="mt-2 text-[11px] font-mono text-slate-600">
                        Target overlap: {c.conflict?.conflictingWith} • Recommended slot: 08:30 – 10:15 AM
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-6 border border-emerald-300 bg-emerald-50/40 text-center">
                    <span className="text-2xl">✓</span>
                    <h4 className="text-sm font-bold text-slate-950 mt-1">Schedule Clear</h4>
                    <p className="text-xs text-slate-600 mt-0.5">
                      All flights, stays, transfers, and daily plans have safe travel buffers with zero time overlaps.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Sharp Modal: Add Activity */}
      {isAddActivityOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs">
          <div className="w-full max-w-lg p-6 bg-white border border-slate-300 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-950">Add Itinerary Activity</h3>
              <button
                type="button"
                onClick={() => setIsAddActivityOpen(false)}
                className="text-slate-400 hover:text-slate-900 text-sm font-bold p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddActivity} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Activity Title</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Bouldering Workshop at Sanapur Lake"
                  required
                  className="input-sharp"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Type</label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value)}
                    className="input-sharp"
                  >
                    <option value="sightseeing">Sightseeing</option>
                    <option value="dining">Dining &amp; Food</option>
                    <option value="adventure">Adventure</option>
                    <option value="leisure">Leisure &amp; Relaxation</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Est. Cost (₹)</label>
                  <input
                    type="number"
                    value={newCost}
                    onChange={(e) => setNewCost(e.target.value)}
                    className="input-sharp"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Start Time</label>
                  <input
                    type="datetime-local"
                    value={newStartTime}
                    onChange={(e) => setNewStartTime(e.target.value)}
                    required
                    className="input-sharp"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">End Time</label>
                  <input
                    type="datetime-local"
                    value={newEndTime}
                    onChange={(e) => setNewEndTime(e.target.value)}
                    required
                    className="input-sharp"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tags (Comma-separated)</label>
                <input
                  type="text"
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                  placeholder="outdoor, rocks, lake, sunset"
                  className="input-sharp"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Traveler Notes</label>
                <textarea
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  rows={2}
                  className="input-sharp"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsAddActivityOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-950 border border-slate-300 bg-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-slate-950 hover:bg-slate-800 border border-slate-950"
                >
                  Save to Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
