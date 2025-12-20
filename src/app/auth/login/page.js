"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import users from "../../../app/data/users.json";
import { setSession } from "../../../app/lib/authClient";
import { ROLE_HOME } from "../../../app/lib/roleRoutes";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  function onSubmit(e) {
    e.preventDefault();
    setErr("");

    const u = users.find(
      (x) => x.username.toLowerCase() === username.trim().toLowerCase()
    );

    if (!u) return setErr("User not found");
    if (u.password !== password) return setErr("Invalid password");

    setSession({ id: u.id, username: u.username, role: u.role });

    router.push(ROLE_HOME[u.role] || "/auth/login");
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6 sm:p-8">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-slate-900">
              Sign in
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Trial Balance • P&L • Balance Sheet
            </p>
          </div>

          {err ? (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {err}
            </div>
          ) : null}

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Username
              </label>
              <input
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 outline-none
                           focus:ring-4 focus:ring-slate-200 focus:border-slate-300"
                placeholder="doc1 / lead1 / mgr1 / ca1"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Password
              </label>
              <input
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 outline-none
                           focus:ring-4 focus:ring-slate-200 focus:border-slate-300"
                placeholder="Enter password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-xl bg-slate-900 text-white py-2.5 font-medium
                         hover:bg-slate-800 active:bg-slate-950 transition
                         focus:outline-none focus:ring-4 focus:ring-slate-300"
            >
              Sign In
            </button>

            <div className="pt-2 text-xs text-slate-500">
              Tip: Use <span className="font-medium text-slate-700">doc1</span>,{" "}
              <span className="font-medium text-slate-700">lead1</span>,{" "}
              <span className="font-medium text-slate-700">mgr1</span>,{" "}
              <span className="font-medium text-slate-700">ca1</span>
            </div>
          </form>
        </div>

        <div className="mt-4 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} Trial Balance System
        </div>
      </div>
    </main>
  );
}
