// ============================================
// Browser-side API helper
// ============================================
// One place that speaks the API envelope { success, data | error }.
// Throws ApiClientError (code, message, field details) and sends the user to
// /login when the session has expired.
// ============================================
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { UserDTO } from "@/types";

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
  /** Field-level messages from server validation, keyed by field name. */
  get fields(): Record<string, string> {
    const out: Record<string, string> = {};
    if (Array.isArray(this.details)) {
      for (const d of this.details as { field?: string; message?: string }[]) {
        if (d?.field && d.message && !out[d.field]) out[d.field] = d.message;
      }
    }
    return out;
  }
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? "GET",
      headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      credentials: "same-origin",
    });
  } catch {
    throw new ApiClientError(0, "NETWORK", "Can't reach the server. Check your connection and try again.");
  }
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    const e = json?.error;
    if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth/")) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      // Full reload on purpose: drops all cached client state of the expired session.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = `/login?next=${next}`;
    }
    throw new ApiClientError(res.status, e?.code ?? "ERROR", e?.message ?? "Something went wrong. Please try again.", e?.details);
  }
  return json.data as T;
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

/** GET + loading/error state + manual reload (keeps showing current data while reloading). */
export function useFetch<T>(path: string | null) {
  const [state, setState] = useState<{ path: string | null; data: T | null; error: ApiClientError | null }>({ path: null, data: null, error: null });
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (path === null) return;
    const mine = ++seq.current;
    try {
      const d = await api<T>(path);
      if (mine === seq.current) setState({ path, data: d, error: null });
    } catch (e) {
      if (mine === seq.current) setState((s) => ({ path, data: s.data, error: e as ApiClientError }));
    }
  }, [path]);

  useEffect(() => { void load(); }, [load]);

  const setData = useCallback((d: T | null) => setState((s) => ({ ...s, data: d })), []);
  return {
    data: state.data,
    error: state.path === path ? state.error : null,
    loading: path !== null && state.path !== path,
    reload: load,
    setData,
  };
}

/** Current user (null = signed out, undefined = still loading). Shared between components. */
let cachedUser: UserDTO | null | undefined;
const listeners = new Set<(u: UserDTO | null | undefined) => void>();
const publish = (u: UserDTO | null | undefined) => { cachedUser = u; listeners.forEach((l) => l(u)); };

export function useAuth() {
  const [user, setUser] = useState<UserDTO | null | undefined>(cachedUser);
  useEffect(() => {
    listeners.add(setUser);
    if (cachedUser === undefined) {
      api<{ user: UserDTO }>("/api/auth/me").then((d) => publish(d.user)).catch(() => publish(null));
    }
    return () => { listeners.delete(setUser); };
  }, []);
  const signOut = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST", body: {} }).catch(() => undefined);
    publish(null);
  }, []);
  const setSignedIn = useCallback((u: UserDTO) => publish(u), []);
  return { user, signOut, setSignedIn };
}
