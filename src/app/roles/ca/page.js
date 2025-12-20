"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearSession, getSession } from "@/app/lib/authClient";
import { ROLE_HOME } from "@/app/lib/roleRoutes";

export default function CAHome() {
  const router = useRouter();
  const [user, setUser] = useState(null);

  useEffect(() => {
    const u = getSession();
    if (!u) return router.replace("/auth/login");

    if (u.role !== "CA")
      return router.replace(ROLE_HOME[u.role] || "/auth/login");

    setUser(u);
  }, [router]);

  if (!user) return null;

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Top Bar */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg sm:text-xl font-semibold text-slate-900">
              CA
            </h1>
            <p className="text-sm text-slate-500">
              Welcome{" "}
              <span className="font-medium text-slate-700">{user.username}</span>{" "}
              <span className="text-slate-400">•</span>{" "}
              <span className="font-medium text-slate-700">{user.role}</span>
            </p>
          </div>

          <button
            onClick={() => {
              clearSession();
              router.push("/auth/login");
            }}
            className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700
                       hover:bg-slate-50 active:bg-slate-100 transition
                       focus:outline-none focus:ring-4 focus:ring-slate-200"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Content */}
      <section className="mx-auto max-w-6xl px-4 py-6">
        {/* Quick Actions */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">
              Trial Balance
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Generate TB and validate totals.
            </p>
            <button
              className="mt-4 w-full rounded-xl bg-slate-900 py-2.5 text-sm font-medium text-white
                         hover:bg-slate-800 active:bg-slate-950 transition
                         focus:outline-none focus:ring-4 focus:ring-slate-300"
              onClick={() => router.push("/ca/trial-balance")}
            >
              Generate
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">P&amp;L</h2>
            <p className="mt-1 text-sm text-slate-500">
              Generate Profit &amp; Loss report.
            </p>
            <button
              className="mt-4 w-full rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-800
                         hover:bg-slate-50 active:bg-slate-100 transition
                         focus:outline-none focus:ring-4 focus:ring-slate-200"
              onClick={() => router.push("/ca/profit-loss")}
            >
              Generate
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">
              Balance Sheet
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Generate Balance Sheet report.
            </p>
            <button
              className="mt-4 w-full rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-800
                         hover:bg-slate-50 active:bg-slate-100 transition
                         focus:outline-none focus:ring-4 focus:ring-slate-200"
              onClick={() => router.push("/ca/balance-sheet")}
            >
              Generate
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">
              Export
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Export JSON / PDF reports.
            </p>
            <button
              className="mt-4 w-full rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-800
                         hover:bg-slate-50 active:bg-slate-100 transition
                         focus:outline-none focus:ring-4 focus:ring-slate-200"
              onClick={() => router.push("/ca/export")}
            >
              Export
            </button>
          </div>
        </div>

        {/* Task List */}
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900">
            Today’s Checklist
          </h3>

          <ul className="mt-4 space-y-3 text-sm">
            {[
              "Generate Trial Balance and validate debit/credit totals",
              "Generate P&L for the selected period",
              "Generate Balance Sheet and cross-check balances",
              "Export JSON / PDF for submission",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="mt-1 h-2.5 w-2.5 rounded-full bg-slate-900" />
                <span className="text-slate-700">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
