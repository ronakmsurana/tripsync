"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/client/api";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();

  const handleLogout = async () => {
    await signOut();
    router.push("/login");
  };

  const navLinks = user
    ? [
        { href: "/dashboard", label: "All Trips", active: pathname === "/dashboard" || pathname.startsWith("/dashboard/") },
        ...(user.role === "admin" ? [{ href: "/admin", label: "Admin", active: pathname === "/admin" }] : []),
      ]
    : [];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/95 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        {/* Brand Logo - Sharp Monogram */}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-8 h-8 rounded-none bg-slate-950 text-white flex items-center justify-center font-bold text-xs tracking-wider border border-slate-950 group-hover:bg-blue-600 group-hover:border-blue-600 transition-colors">
            TS
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-base text-slate-950 tracking-tight">
              Trip<span className="text-blue-600">Sync</span>
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 border border-slate-200 text-slate-600 bg-slate-50">
              Planner
            </span>
          </div>
        </Link>

        {/* Center Nav Links */}
        <nav className="hidden md:flex items-center space-x-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`px-3 py-1.5 text-xs font-semibold rounded-none border transition-colors ${
                link.active
                  ? "bg-slate-100 text-slate-950 border-slate-300"
                  : "text-slate-600 hover:text-slate-950 border-transparent hover:bg-slate-50"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Right Controls: User */}
        <div className="flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 pl-1">
                <div className="w-7 h-7 rounded-none bg-slate-200 border border-slate-300 text-slate-800 flex items-center justify-center text-[11px] font-bold">
                  {user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div className="hidden lg:block text-left leading-tight">
                  <div className="text-xs font-bold text-slate-900">{user.name}</div>
                  <div className="text-[10px] text-slate-500 capitalize">{user.role === "admin" ? "Administrator" : "Traveler"}</div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="text-xs text-slate-500 hover:text-red-600 p-1 rounded-none hover:bg-slate-100 transition-colors"
                title="Sign out"
                aria-label="Sign out"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
              </button>
            </div>
          ) : user === null ? (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-950 border border-slate-300 rounded-none bg-white hover:bg-slate-50 transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 border border-slate-900 rounded-none transition-colors"
              >
                Get Started
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
