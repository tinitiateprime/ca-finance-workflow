"use client";

export default function TrialBalanceList({ documents, onOpen }) {
  if (!documents.length) {
    return (
      <div className="text-sm text-slate-500">
        No Trial Balance documents found.
      </div>
    );
  }

  return (
    <div className="mt-4 overflow-auto rounded-xl border border-slate-200">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50">
          <tr className="text-left text-slate-600">
            <th className="px-3 py-2 border-b">Document</th>
            <th className="px-3 py-2 border-b">Sheet</th>
            <th className="px-3 py-2 border-b">Status</th>
            <th className="px-3 py-2 border-b">Updated</th>
            <th className="px-3 py-2 border-b text-right">Action</th>
          </tr>
        </thead>

        <tbody>
          {documents.map((d) => (
            <tr key={d.id} className="odd:bg-white even:bg-slate-50">
              <td className="px-3 py-2 border-b font-medium">
                {d.documentName}
              </td>

              <td className="px-3 py-2 border-b">
                {d.sheetName}
              </td>

              <td className="px-3 py-2 border-b">
                {d.status}
              </td>

              <td className="px-3 py-2 border-b text-slate-500">
                {new Date(d.updatedAt).toLocaleString()}
              </td>

              <td className="px-3 py-2 border-b text-right">
                <button
                  onClick={() => onOpen(d.id)}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white
                             hover:bg-slate-800"
                >
                  Open
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
