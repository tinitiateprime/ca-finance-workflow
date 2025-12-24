// ca-finance-workflow-main/src/app/roles/doc-specialist/page.js
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ExcelJS from "exceljs/dist/exceljs.min.js";

import { clearSession, getSession } from "@/app/lib/authClient";
import { ROLE_HOME } from "@/app/lib/roleRoutes";

/* -------------------- helpers -------------------- */

function toNumberSafe(val) {
  const s = String(val ?? "").replace(/,/g, "").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function stripIndent(name) {
  return String(name ?? "").replace(/^[\s\u00A0]+/, "").trim();
}

function countLeadingWhitespace(name) {
  const s = String(name ?? "");
  const m = s.match(/^[\s\u00A0]+/);
  return m ? m[0].length : 0;
}

function parseAmountSide(input) {
  if (input == null) return { amount: null, side: null };

  const s = String(input).trim();
  if (!s) return { amount: null, side: null };

  const cleaned = s.replace(/,/g, "");
  const m = cleaned.match(/^(-?\d+(?:\.\d+)?)\s*(Dr|Cr)?$/i);

  if (!m) {
    const n = toNumberSafe(cleaned);
    return { amount: n, side: null };
  }

  const amount = toNumberSafe(m[1]);
  const side = m[2] ? (m[2].toUpperCase() === "DR" ? "Dr" : "Cr") : null;
  return { amount, side };
}

function buildTreeFromLevels(flatRows) {
  const roots = [];
  const stack = [];

  for (const row of flatRows) {
    const lvl = Math.max(0, Number(row.level) || 0);
    const node = { ...row, children: [] };

    stack[lvl] = node;
    stack.length = lvl + 1;

    if (lvl === 0) roots.push(node);
    else {
      const parent = stack[lvl - 1];
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
  }

  const cleanup = (arr) =>
    arr.map((n) => {
      if (!n.children?.length) delete n.children;
      else n.children = cleanup(n.children);
      return n;
    });

  return cleanup(roots);
}

function flattenTreeRows(treeRows) {
  const out = [];
  const walk = (nodes) => {
    for (const n of nodes || []) {
      out.push(n);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(treeRows || []);
  return out;
}

/**
 * ✅ Null-safe cell -> string (merged blanks + formula safe)
 */
function cellText(cell) {
  try {
    if (!cell) return "";

    const t = cell.text;
    if (t !== null && t !== undefined) {
      const ts = String(t);
      if (ts.trim() !== "") return ts;
    }

    const v = cell.value;
    if (v === null || v === undefined) return "";

    if (typeof v === "object") {
      if (v.richText) return v.richText.map((x) => String(x?.text ?? "")).join("");
      if (v.text != null) return String(v.text);
      if (v.result != null) return String(v.result);
      if (v.formula != null) return String(v.formula);
    }

    return String(v);
  } catch {
    return "";
  }
}

/**
 * ✅ Capture top header rows ABOVE the table (Trial Balance, date range, etc.)
 * We take rows 1..(headerRow-1) and build readable lines.
 */
function extractHeaderLines(ws, headerRow) {
  const lines = [];
  const maxCols = Math.min(ws.columnCount || 0, 30);

  for (let r = 1; r < headerRow; r++) {
    const row = ws.getRow(r);

    // collect texts but dedupe within the same row
    const parts = [];
    const seen = new Set();

    for (let c = 1; c <= maxCols; c++) {
      const raw = cellText(row.getCell(c));
      const txt = raw.replace(/\s+/g, " ").trim();
      if (!txt) continue;

      // ✅ if the same text repeats across merged cells, keep only once
      if (seen.has(txt)) continue;

      seen.add(txt);
      parts.push(txt);
    }

    // final line for this row
    const line = parts.join(" ").trim();
    if (line) lines.push(line);
  }

  // ✅ remove duplicate full lines too (just in case)
  const uniq = [];
  const lineSeen = new Set();
  for (const l of lines) {
    if (lineSeen.has(l)) continue;
    lineSeen.add(l);
    uniq.push(l);
  }

  return uniq;
}

/**
 * ✅ Find where "Particulars / Opening / Debit / Credit / Closing" columns are.
 */
function detectTbColumns(ws) {
  const scanRows = Math.min(ws.rowCount || 0, 40);
  const scanCols = Math.min(ws.columnCount || 0, 40);

  let headerRow = -1;

  // 1) find a header row near "Particulars"
  for (let r = 1; r <= scanRows; r++) {
    const row = ws.getRow(r);

    let hasPart = false;
    let hasOther = false;

    for (let c = 1; c <= scanCols; c++) {
      const txt = cellText(row.getCell(c)).toLowerCase().trim();
      if (!txt) continue;

      if (txt.includes("particular")) hasPart = true;
      if (
        txt.includes("opening") ||
        txt.includes("closing") ||
        txt.includes("debit") ||
        txt.includes("credit") ||
        txt.includes("transaction")
      ) {
        hasOther = true;
      }
    }

    // Particulars may appear before opening/closing row
    if (hasPart && !hasOther) {
      for (let rr = r; rr <= Math.min(r + 2, scanRows); rr++) {
        const rrow = ws.getRow(rr);
        for (let c = 1; c <= scanCols; c++) {
          const txt = cellText(rrow.getCell(c)).toLowerCase().trim();
          if (
            txt.includes("opening") ||
            txt.includes("closing") ||
            txt.includes("debit") ||
            txt.includes("credit") ||
            txt.includes("transaction")
          ) {
            hasOther = true;
            break;
          }
        }
        if (hasOther) break;
      }
    }

    if (hasPart && hasOther) {
      headerRow = r;
      break;
    }
  }

  if (headerRow === -1) {
    // fallback
    return {
      headerRow: 1,
      particularsCol: 1,
      openingCol: 2,
      debitCol: 3,
      creditCol: 4,
      closingCol: 5,
    };
  }

  // 2) within headerRow..headerRow+2 find columns
  let particularsCol = null;
  let openingCol = null;
  let debitCol = null;
  let creditCol = null;
  let closingCol = null;

  const searchRows = [headerRow, headerRow + 1, headerRow + 2].filter((x) => x <= scanRows);

  for (const r of searchRows) {
    const row = ws.getRow(r);
    for (let c = 1; c <= scanCols; c++) {
      const txt = cellText(row.getCell(c)).toLowerCase().trim();
      if (!txt) continue;

      if (particularsCol == null && txt.includes("particular")) particularsCol = c;
      if (openingCol == null && txt.includes("opening")) openingCol = c;
      if (debitCol == null && txt === "debit") debitCol = c;
      if (creditCol == null && txt === "credit") creditCol = c;
      if (closingCol == null && txt.includes("closing")) closingCol = c;
    }
  }

  // fallback if Debit/Credit appear like "Transactions Debit"
  if (debitCol == null || creditCol == null) {
    for (const r of searchRows) {
      const row = ws.getRow(r);
      for (let c = 1; c <= scanCols; c++) {
        const txt = cellText(row.getCell(c)).toLowerCase().trim();
        if (!txt) continue;

        if (debitCol == null && txt.includes("debit")) debitCol = c;
        if (creditCol == null && txt.includes("credit")) creditCol = c;
      }
    }
  }

  particularsCol = particularsCol ?? 1;
  openingCol = openingCol ?? particularsCol + 1;
  debitCol = debitCol ?? openingCol + 1;
  creditCol = creditCol ?? debitCol + 1;
  closingCol = closingCol ?? creditCol + 1;

  return { headerRow, particularsCol, openingCol, debitCol, creditCol, closingCol };
}

/**
 * ✅ Decide where the actual data starts (below headers)
 */
function detectDataStartRow(ws, headerRow, particularsCol) {
  const scanLimit = Math.min(ws.rowCount || 0, headerRow + 25);

  for (let r = headerRow; r <= scanLimit; r++) {
    const txt = cellText(ws.getRow(r).getCell(particularsCol)).toLowerCase().trim();
    if (!txt) continue;

    if (
      txt.includes("trial balance") ||
      txt.includes("particular") ||
      txt.includes("opening") ||
      txt.includes("closing") ||
      txt.includes("transaction") ||
      txt === "debit" ||
      txt === "credit"
    ) {
      continue;
    }

    return r;
  }

  return headerRow + 1;
}

/* -------------------- main parser -------------------- */

function parseTrialBalanceWorksheetExcelJS(ws, sheetName) {
  const { headerRow, particularsCol, openingCol, debitCol, creditCol, closingCol } =
    detectTbColumns(ws);

  const headerLines = extractHeaderLines(ws, headerRow);
  const dataStartIdx = detectDataStartRow(ws, headerRow, particularsCol);

  const flatRows = [];
  const SPACES_PER_LEVEL = 2;

  for (let r = dataStartIdx; r <= (ws.rowCount || 0); r++) {
    const row = ws.getRow(r);

    const nameCell = row.getCell(particularsCol);
    const nameStrRaw = cellText(nameCell);
    const ledgerName = stripIndent(nameStrRaw);

    const openingRaw = cellText(row.getCell(openingCol));
    const txDebitRaw = cellText(row.getCell(debitCol));
    const txCreditRaw = cellText(row.getCell(creditCol));
    const closingRaw = cellText(row.getCell(closingCol));

    const isRowEmpty =
      ledgerName === "" &&
      [openingRaw, txDebitRaw, txCreditRaw, closingRaw].every((x) => String(x).trim() === "");

    if (isRowEmpty) continue;
    if (!ledgerName) continue;

    const indentFromStyle = Number.isFinite(nameCell?.alignment?.indent)
      ? nameCell.alignment.indent
      : null;

    const leadingSpaces = countLeadingWhitespace(nameStrRaw);

    const level =
      indentFromStyle != null ? indentFromStyle : Math.floor(leadingSpaces / SPACES_PER_LEVEL);

    flatRows.push({
      ledgerName,
      level,
      opening: parseAmountSide(openingRaw),
      transactions: { debit: toNumberSafe(txDebitRaw), credit: toNumberSafe(txCreditRaw) },
      closing: parseAmountSide(closingRaw),
      rowNo: r,
    });
  }

  return {
    type: "TRIAL_BALANCE",
    sheetName,
    extractedAt: new Date().toISOString(),
    meta: {
      headerLines, // ✅ captured top section (Trial Balance + date range + anything above table)
      headerRow,
      dataStartIdx,
      columns: { particularsCol, openingCol, debitCol, creditCol, closingCol },
    },
    rows: buildTreeFromLevels(flatRows),
    rowsFlat: flatRows,
  };
}

/* -------------------- export to excel -------------------- */

function formatAmountSide(obj) {
  if (!obj || obj.amount == null) return "";
  return obj.side ? `${obj.amount} ${obj.side}` : String(obj.amount);
}

async function downloadAsExcel(tbJson, selectedSheet) {
  if (!tbJson) return;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Trial Balance");

  // ✅ 1) Write captured header lines (Trial Balance, date range etc.)
  const headerLines = tbJson?.meta?.headerLines || [];
  const totalCols = 5; // A..E

  let currentRow = 1;

  for (let i = 0; i < headerLines.length; i++) {
    const line = headerLines[i];
    ws.getRow(currentRow).getCell(1).value = line;

    // Merge A..E for title lines
    ws.mergeCells(currentRow, 1, currentRow, totalCols);

    // Style: first line bold & bigger
    if (i === 0) {
      ws.getRow(currentRow).font = { bold: true, size: 14 };
    } else {
      ws.getRow(currentRow).font = { bold: true };
    }

    currentRow += 1;
  }

  // Add one blank row after header
  currentRow += 1;

  // ✅ 2) Create a 2-row table header like the source sheet
  const headerTop = currentRow;
  const headerBottom = currentRow + 1;

  // Row 1
  ws.getRow(headerTop).getCell(1).value = "Particulars";
  ws.getRow(headerTop).getCell(2).value = "Opening Balance";
  ws.getRow(headerTop).getCell(3).value = "Transactions";
  ws.getRow(headerTop).getCell(5).value = "Closing Balance";

  // Row 2
  ws.getRow(headerBottom).getCell(3).value = "Debit";
  ws.getRow(headerBottom).getCell(4).value = "Credit";

  // Merges for header layout
  ws.mergeCells(headerTop, 1, headerBottom, 1); // Particulars vertical
  ws.mergeCells(headerTop, 2, headerBottom, 2); // Opening Balance vertical
  ws.mergeCells(headerTop, 5, headerBottom, 5); // Closing Balance vertical
  ws.mergeCells(headerTop, 3, headerTop, 4); // Transactions spans Debit+Credit

  // Style header rows
  for (let r = headerTop; r <= headerBottom; r++) {
    const row = ws.getRow(r);
    row.font = { bold: true };
    row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });
  }

  currentRow = headerBottom + 1;

  // ✅ 3) Add data rows (flatten nested)
  const flat = flattenTreeRows(tbJson.rows);

  for (const r of flat) {
    const excelRow = ws.getRow(currentRow);

    excelRow.getCell(1).value = r.ledgerName;
    excelRow.getCell(2).value = formatAmountSide(r.opening);
    excelRow.getCell(3).value = r.transactions?.debit ?? "";
    excelRow.getCell(4).value = r.transactions?.credit ?? "";
    excelRow.getCell(5).value = formatAmountSide(r.closing);

    // keep nesting indentation in Excel
    excelRow.getCell(1).alignment = { indent: r.level || 0, vertical: "middle" };

    // borders for data rows (optional but looks clean)
    excelRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
      if (!cell.alignment) cell.alignment = {};
      cell.alignment.vertical = "middle";
    });

    currentRow += 1;
  }

  // ✅ 4) Column widths
  ws.getColumn(1).width = 45; // Particulars
  ws.getColumn(2).width = 18;
  ws.getColumn(3).width = 16;
  ws.getColumn(4).width = 16;
  ws.getColumn(5).width = 18;

  // ✅ 5) Download
  const buffer = await wb.xlsx.writeBuffer();

  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `trialbalance_${selectedSheet || "sheet"}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

/* -------------------- component -------------------- */

export default function DocSpecialistHome() {
  const router = useRouter();
  const [user, setUser] = useState(null);

  const workbookRef = useRef(null);

  const [fileName, setFileName] = useState("");
  const [sheetNames, setSheetNames] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState("");

  const [tbJson, setTbJson] = useState(null);
  const [uploadErr, setUploadErr] = useState("");
  const [showJson, setShowJson] = useState(true);

  useEffect(() => {
    const u = getSession();
    if (!u) return router.replace("/auth/login");
    if (u.role !== "DOC_SPECIALIST") return router.replace(ROLE_HOME[u.role] || "/auth/login");
    setUser(u);
  }, [router]);

  const previewRows = useMemo(() => {
    const tree = tbJson?.rows || [];
    return flattenTreeRows(tree).slice(0, 300);
  }, [tbJson]);

  async function handleExcelUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadErr("");
    setTbJson(null);
    setSheetNames([]);
    setSelectedSheet("");
    setFileName(file.name);

    try {
      const buf = await file.arrayBuffer();

      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf);

      workbookRef.current = wb;

      const names = wb.worksheets.map((w) => w.name);
      setSheetNames(names);

      const first = names[0] || "";
      setSelectedSheet(first);

      if (first) {
        const ws = wb.getWorksheet(first);
        const json = parseTrialBalanceWorksheetExcelJS(ws, first);
        setTbJson(json);

        localStorage.setItem("trialbalance_uploaded_filename", file.name);
        localStorage.setItem("trialbalance_uploaded_json", JSON.stringify(json));
      }
    } catch (err) {
      setUploadErr(err?.message || "Failed to parse Excel");
    }
  }

  function handleReparse(sheet) {
    const wb = workbookRef.current;
    if (!wb) return;

    setUploadErr("");
    setTbJson(null);

    try {
      const ws = wb.getWorksheet(sheet);
      const json = parseTrialBalanceWorksheetExcelJS(ws, sheet);
      setTbJson(json);
      localStorage.setItem("trialbalance_uploaded_json", JSON.stringify(json));
    } catch (err) {
      setUploadErr(err?.message || "Failed to parse selected sheet");
    }
  }

  function downloadJson() {
    if (!tbJson) return;
    const blob = new Blob([JSON.stringify(tbJson, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trialbalance_${selectedSheet || "sheet"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!user) return null;

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg sm:text-xl font-semibold text-slate-900">Doc Specialist</h1>
            <p className="text-sm text-slate-500">
              Welcome <span className="font-medium text-slate-700">{user.username}</span>{" "}
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

      <section className="mx-auto max-w-6xl px-4 py-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Upload Excel</h2>
            <p className="mt-1 text-sm text-slate-500">
              Upload TB sheet and convert it to JSON (auto mapping + nesting + captures top header).
            </p>

            <div className="mt-4 space-y-3">
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleExcelUpload}
                className="block w-full text-sm text-slate-700
                           file:mr-4 file:rounded-xl file:border-0
                           file:bg-slate-900 file:px-4 file:py-2.5
                           file:text-sm file:font-medium file:text-white
                           hover:file:bg-slate-800"
              />

              {fileName ? (
                <p className="text-xs text-slate-500">
                  Selected: <span className="font-medium text-slate-700">{fileName}</span>
                </p>
              ) : null}

              {sheetNames.length ? (
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-slate-600">Sheet</label>
                  <select
                    value={selectedSheet}
                    onChange={(e) => {
                      const s = e.target.value;
                      setSelectedSheet(s);
                      handleReparse(s);
                    }}
                    className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-black
                               focus:outline-none focus:ring-4 focus:ring-slate-200"
                  >
                    {sheetNames.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => handleReparse(selectedSheet)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700
                               hover:bg-slate-50 active:bg-slate-100"
                  >
                    Re-parse
                  </button>
                </div>
              ) : null}

              {uploadErr ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {uploadErr}
                </div>
              ) : null}

              {tbJson ? (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                  <div className="text-xs text-slate-500">
                    Parsed{" "}
                    <span className="font-medium text-slate-700">{tbJson.rowsFlat?.length ?? 0}</span>{" "}
                    rows
                    <div className="mt-1 text-[11px] text-slate-400">
                      Cols: P={tbJson.meta.columns.particularsCol}, O={tbJson.meta.columns.openingCol}, D=
                      {tbJson.meta.columns.debitCol}, C={tbJson.meta.columns.creditCol}, CL=
                      {tbJson.meta.columns.closingCol}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400">
                      Header lines captured: {tbJson.meta.headerLines?.length ?? 0}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={downloadJson}
                      className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium text-white
                                 hover:bg-slate-800 active:bg-slate-950 transition"
                    >
                      Download JSON
                    </button>

                    <button
                      type="button"
                      onClick={() => downloadAsExcel(tbJson, selectedSheet)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700
                                 hover:bg-slate-50 active:bg-slate-100"
                    >
                      Download Excel
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {tbJson ? (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Preview</h3>
                <p className="text-xs text-slate-500">
                  Sheet: <span className="font-medium text-slate-700">{selectedSheet}</span>
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowJson((v) => !v)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700
                           hover:bg-slate-50 active:bg-slate-100"
              >
                {showJson ? "Hide JSON" : "Show JSON"}
              </button>
            </div>

            <div className="mt-4 overflow-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left text-slate-600">
                    <th className="px-3 py-2 border-b border-slate-200">Ledger</th>
                    <th className="px-3 py-2 border-b border-slate-200">Opening</th>
                    <th className="px-3 py-2 border-b border-slate-200">Debit</th>
                    <th className="px-3 py-2 border-b border-slate-200">Credit</th>
                    <th className="px-3 py-2 border-b border-slate-200">Closing</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r) => (
                    <tr key={r.rowNo} className="odd:bg-white even:bg-slate-50">
                      <td className="px-3 py-2 border-b border-slate-200">
                        <span className="text-slate-700">
                          {r.level > 0 ? "— ".repeat(r.level) : ""}
                          {r.ledgerName}
                        </span>
                      </td>
                      <td className="px-3 py-2 border-b border-slate-200 text-slate-700">
                        {r.opening.amount ?? ""} {r.opening.side ?? ""}
                      </td>
                      <td className="px-3 py-2 border-b border-slate-200 text-slate-700">
                        {r.transactions.debit ?? ""}
                      </td>
                      <td className="px-3 py-2 border-b border-slate-200 text-slate-700">
                        {r.transactions.credit ?? ""}
                      </td>
                      <td className="px-3 py-2 border-b border-slate-200 text-slate-700">
                        {r.closing.amount ?? ""} {r.closing.side ?? ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {showJson ? (
              <pre className="mt-4 max-h-96 overflow-auto rounded-xl bg-slate-900 p-4 text-xs text-slate-100">
                {JSON.stringify(tbJson, null, 2)}
              </pre>
            ) : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}
