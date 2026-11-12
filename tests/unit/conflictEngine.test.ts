import { describe, expect, it } from "vitest";
import {
  AccommodationLike, SlotLike, TransportLike, buildBlocks, findConflictsForWindow, findTripConflicts, suggestFreeWindow,
} from "@/lib/services/conflictEngine";
import { parseLocalDateTime as T } from "@/lib/utils/time";

const slot = (id: number, title: string, s: string, e: string): SlotLike => ({ slotId: id, mongoDocId: String(id).padStart(24, "0"), title, startTime: T(s), endTime: T(e) });
const bus = (id: number, dep: string, arr: string, type = "bus", status = "confirmed"): TransportLike => ({ transportId: id, transportType: type, provider: "KSRTC", departureTime: T(dep), arrivalTime: T(arr), status });
const hotel = (ci: string, co: string, status = "confirmed"): AccommodationLike => ({ accommodationId: 1, name: "Guest House", checkIn: T(ci), checkOut: T(co), status });

const window = { start: T("2026-12-20T00:00"), end: T("2026-12-25T00:00") };

describe("conflict engine rules", () => {
  const stay = hotel("2026-12-21T06:00", "2026-12-23T11:00");

  it("flags an activity that runs through the hotel check-out (hard)", () => {
    const s = slot(1, "Lotus Mahal", "2026-12-23T10:15", "2026-12-23T12:00");
    const c = findTripConflicts([s], [], [stay], window);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ severity: "hard", kind: "activity_check_out" });
    expect(c[0].suggestion).toEqual({ startTime: "2026-12-23T11:00", endTime: "2026-12-23T12:45" });
  });

  it("does NOT treat the middle of a multi-day stay as a conflict", () => {
    const s = slot(1, "Coracle ride", "2026-12-22T08:00", "2026-12-22T10:00");
    expect(findTripConflicts([s], [], [stay], window)).toHaveLength(0);
  });

  it("flags an activity inside the check-in hour but not right after it", () => {
    expect(findTripConflicts([slot(1, "x", "2026-12-21T06:30", "2026-12-21T07:30")], [], [stay], window)).toHaveLength(1);
    expect(findTripConflicts([slot(1, "x", "2026-12-21T07:00", "2026-12-21T08:00")], [], [stay], window)).toHaveLength(0);
  });

  it("uses a boarding buffer that depends on the transport mode", () => {
    const flight = bus(1, "2026-12-21T12:00", "2026-12-21T14:00", "flight");
    const train = bus(2, "2026-12-21T12:00", "2026-12-21T14:00", "train");
    const act = slot(9, "Lunch", "2026-12-21T10:00", "2026-12-21T11:00"); // ends 60 min before departure
    expect(findConflictsForWindow({ id: 9, title: "Lunch", start: act.startTime, end: act.endTime }, buildBlocks([flight], []), [])).toHaveLength(1); // 2 h flight buffer
    expect(findConflictsForWindow({ id: 9, title: "Lunch", start: act.startTime, end: act.endTime }, buildBlocks([train], []), [])).toHaveLength(0); // 45 min train buffer starts 11:15
  });

  it("touching windows are not conflicts (end == start)", () => {
    const a = slot(1, "A", "2026-12-21T10:00", "2026-12-21T11:00");
    const b = slot(2, "B", "2026-12-21T11:00", "2026-12-21T12:00");
    expect(findTripConflicts([a, b], [], [], window)).toHaveLength(0);
  });

  it("reports overlapping activities once, as a soft conflict", () => {
    const a = slot(1, "A", "2026-12-21T10:00", "2026-12-21T12:00");
    const b = slot(2, "B", "2026-12-21T11:00", "2026-12-21T13:00");
    const c = findTripConflicts([a, b], [], [], window);
    expect(c).toHaveLength(1);
    expect(c[0].severity).toBe("soft");
  });

  it("flags overlapping transports and ignores cancelled bookings", () => {
    const t1 = bus(1, "2026-12-21T08:00", "2026-12-21T12:00");
    const t2 = bus(2, "2026-12-21T11:00", "2026-12-21T15:00");
    expect(findTripConflicts([], [t1, t2], [], window)[0]).toMatchObject({ kind: "transport_transport", severity: "hard" });
    expect(findTripConflicts([], [t1, { ...t2, status: "cancelled" }], [], window)).toHaveLength(0);
    const act = slot(1, "x", "2026-12-21T09:00", "2026-12-21T10:00");
    expect(findTripConflicts([act], [{ ...t1, status: "cancelled" }], [hotel("2026-12-21T06:00", "2026-12-23T11:00", "cancelled")], window)).toHaveLength(0);
  });

  it("sorts hard conflicts before soft ones", () => {
    const a = slot(1, "A", "2026-12-21T10:00", "2026-12-21T12:00");
    const b = slot(2, "B", "2026-12-21T11:00", "2026-12-21T13:00");
    const t = bus(1, "2026-12-21T22:00", "2026-12-22T05:00");
    const c = slot(3, "C", "2026-12-21T21:00", "2026-12-21T22:30");
    const res = findTripConflicts([a, b, c], [t], [], window);
    expect(res.map((r) => r.severity)).toEqual(["hard", "soft"]);
  });
});

describe("suggestFreeWindow", () => {
  it("finds the earliest free window of the same length after the original", () => {
    const blocks = buildBlocks([], [hotel("2026-12-21T06:00", "2026-12-23T11:00")]);
    const subject = { id: 1, start: T("2026-12-23T10:15"), end: T("2026-12-23T12:00") };
    const s = suggestFreeWindow(subject, blocks, [], window.start, window.end)!;
    expect(s.start).toEqual(T("2026-12-23T11:00"));
    expect(s.end.getTime() - s.start.getTime()).toBe(subject.end.getTime() - subject.start.getTime());
  });
  it("avoids other activities and never leaves the trip window", () => {
    const others = [slot(2, "Busy", "2026-12-24T00:00", "2026-12-24T23:30")];
    const subject = { id: 1, start: T("2026-12-24T10:00"), end: T("2026-12-24T11:00") };
    const s = suggestFreeWindow(subject, [], others, window.start, window.end)!;
    expect(s.start >= window.start && s.end <= window.end).toBe(true);
    expect(s.start < T("2026-12-24T00:00") || s.start >= T("2026-12-24T23:30")).toBe(true);
  });
  it("returns null when there is no room", () => {
    const others = [slot(2, "All", "2026-12-20T00:00", "2026-12-25T00:00")];
    expect(suggestFreeWindow({ id: 1, start: T("2026-12-21T10:00"), end: T("2026-12-21T11:00") }, [], others, window.start, window.end)).toBeNull();
  });
});
