"use client";

export default function ClientSelector({ clients, value, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs font-medium text-slate-600">
        Client
      </label>

      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-black
                   focus:outline-none focus:ring-4 focus:ring-slate-200"
      >
        <option value="">Select Client</option>
        {clients.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </div>
  );
}
