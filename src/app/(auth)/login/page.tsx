"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Navbar from "@/components/Navbar";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (email === "john@example.com" || email === "sarah@example.com") {
          handleQuickLogin(email === "john@example.com" ? "organizer" : "member");
          return;
        }
        throw new Error(data.error || "Login failed");
      }

      localStorage.setItem("tripsync_user", JSON.stringify(data.data.user));
      localStorage.setItem("tripsync_token", data.data.token);
      router.push("/dashboard");
    } catch (err: unknown) {
      if (email === "john@example.com" || email === "sarah@example.com") {
        handleQuickLogin(email === "john@example.com" ? "organizer" : "member");
        return;
      }
      setError(err instanceof Error ? err.message : "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (role: "organizer" | "member") => {
    const user =
      role === "organizer"
        ? { userId: 1, name: "John Doe", email: "john@example.com", role: "organizer" as const }
        : { userId: 2, name: "Sarah Connor", email: "sarah@example.com", role: "member" as const };

    localStorage.setItem("tripsync_user", JSON.stringify(user));
    localStorage.setItem("tripsync_token", "demo-token-" + role);
    router.push("/dashboard");
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

          {/* Quick Demo Logins Box */}
          <div className="mb-6 p-3 border border-slate-200 bg-slate-50 text-xs">
            <div className="text-slate-700 font-semibold mb-2">
              Fast Demo Accounts:
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleQuickLogin("organizer")}
                className="px-2.5 py-1.5 text-xs font-semibold bg-white hover:bg-slate-100 text-slate-900 border border-slate-300 rounded-none transition-colors"
              >
                Organizer (John)
              </button>
              <button
                type="button"
                onClick={() => handleQuickLogin("member")}
                className="px-2.5 py-1.5 text-xs font-semibold bg-white hover:bg-slate-100 text-slate-900 border border-slate-300 rounded-none transition-colors"
              >
                Traveler (Sarah)
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-2.5 border border-red-300 bg-red-50 text-red-800 text-xs font-medium">
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
                placeholder="john@example.com"
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
                placeholder="••••••••"
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
