"use client";

import { useCallback, useState } from "react";
import { errorMessage, ApiClientError } from "@/lib/client/api";
import type { TripDetail, TripRole } from "@/types";

export interface TripCtx {
  trip: TripDetail;
  userId: number;
  role: TripRole;
  canEdit: boolean;
  isOrganizer: boolean;
  /** Call after any change so the header, badges and other tabs refresh. */
  onChanged: () => void;
  goToTab: (id: string) => void;
}

/** Runs an async action with busy / error state and prevents double submits. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (busy) return undefined;
    setBusy(true);
    setError(null);
    setFields({});
    try {
      return await fn();
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof ApiClientError) setFields(e.fields);
      return undefined;
    } finally {
      setBusy(false);
    }
  }, [busy]);
  return { busy, error, fields, run, setError };
}

export const SLOT_ICON: Record<string, string> = { dining: "🍽️", adventure: "🛶", sightseeing: "🏛️", leisure: "🌅", festival: "🎉", custom: "📌" };
export const slotIcon = (type?: string | null) => (type && SLOT_ICON[type.toLowerCase()]) ?? "📌";
export const transportIcon = (type: string) => ({ flight: "✈️", train: "🚆", bus: "🚌", car: "🚖", ferry: "⛴️" } as Record<string, string>)[type] ?? "🧭";
