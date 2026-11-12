"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Navbar from "@/components/Navbar";
import { api, errorMessage, useAuth } from "@/lib/client/api";
import type { UserDTO } from "@/types";

export default function LoginPage() {
  const router = useRouter();
  const { setSignedIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api<{ user: UserDTO }>("/api/auth/login", { method: "POST", body: { email, password } });
      setSignedIn(data.user);
      const next = new URLSearchParams(window.location.search).get("next");
      router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col">
      <Navbar />

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-sm p-6 sm:p-8 bg-white border border-slate-300 shadow-sm">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-slate-950 tracking-tight">Sign In to TripSync</h1>
            <p className="text-xs text-slate-500 mt-1">Coordinate group schedules and travel logistics</p>
          </div>

          {error && (
            <div role="alert" className="mb-4 p-2.5 border border-red-300 bg-red-50 text-red-800 text-xs font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com" autoComplete="email"
                required
                className="input-sharp"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" autoComplete="current-password"
                required
                className="input-sharp"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 text-xs font-bold text-white bg-slate-950 hover:bg-slate-800 border border-slate-950 rounded-none transition-colors shadow-sm disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Continue"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-500">
            Need an account?{" "}
            <Link href="/register" className="text-blue-600 hover:text-blue-800 font-semibold">
              Create account
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
