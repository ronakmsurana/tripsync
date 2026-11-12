"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Navbar from "@/components/Navbar";
import { api, ApiClientError, errorMessage, useAuth } from "@/lib/client/api";
import type { UserDTO } from "@/types";

export default function RegisterPage() {
  const router = useRouter();
  const { setSignedIn } = useAuth();
  const [name, setName] = useState("");
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
      const data = await api<{ user: UserDTO }>("/api/auth/register", { method: "POST", body: { name, email, password } });
      setSignedIn(data.user);
      router.push("/dashboard");
    } catch (err) {
      const msgs = err instanceof ApiClientError ? Object.values(err.fields) : [];
      setError(msgs.length ? msgs.join(" · ") : errorMessage(err));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col">
      <Navbar />

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-sm p-6 sm:p-8 bg-white border border-slate-300 shadow-sm">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-slate-950 tracking-tight">Create Account</h1>
            <p className="text-xs text-slate-500 mt-1">Join TripSync to plan and synchronize trips</p>
          </div>

          {error && (
            <div role="alert" className="mb-4 p-2.5 border border-red-300 bg-red-50 text-red-800 text-xs font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ronak Surana"
                required
                autoComplete="name"
                className="input-sharp"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ronak@example.com"
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
                placeholder="At least 8 characters, letters and a number"
                required
                minLength={8}
                maxLength={72}
                autoComplete="new-password"
                className="input-sharp"
              />
            </div>

            <div className="p-3 border border-slate-200 bg-slate-50 text-[11px] text-slate-600 leading-relaxed">
              <span className="font-semibold text-slate-800">Roles are set per trip.</span> You become the{" "}
              <span className="font-semibold">Organizer</span> of every trip you create and can invite others as{" "}
              <span className="font-semibold">Travelers</span> (can edit) or <span className="font-semibold">Viewers</span> (read-only).
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 text-xs font-bold text-white bg-slate-950 hover:bg-slate-800 border border-slate-950 rounded-none transition-colors shadow-sm disabled:opacity-50"
            >
              {loading ? "Creating..." : "Register"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-500">
            Already registered?{" "}
            <Link href="/login" className="text-blue-600 hover:text-blue-800 font-semibold">
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
