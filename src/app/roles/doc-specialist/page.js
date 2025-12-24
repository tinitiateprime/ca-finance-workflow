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
  if (!s) return null;
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

function formatAmountSide(obj) {
  if (!obj || obj.amount == null) return "";
  return obj.side ? `${obj.amount} ${obj.side}` : String(obj.amount);
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
 * ✅ Null-safe cell -> string
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
 * ✅ Capture title/date lines above table WITHOUT repeating merged texts.
 */
function extractHeaderLines(ws, headerRow) {
  const lines = [];
  const maxCols = Math.min(ws.columnCount || 0, 30);

  for (let r = 1; r < headerRow; r++) {
    const row = ws.getRow(r);

    const parts = [];
    const seen = new Set();

    for (let c = 1; c <= maxCols; c++) {
      const raw = cellText(row.getCell(c));
      const txt = raw.replace(/\s+/g, " ").trim();
      if (!txt) continue;

      // prevent "Trial Balance Trial Balance ..." from merged cells
      if (seen.has(txt)) continue;

      seen.add(txt);
      parts.push(txt);
    }

    const line = parts.join(" ").trim();
    if (line) lines.push(line);
  }

  // remove full-line duplicates
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
 * ✅ Detect columns dynamically (because there are blank/merged columns)
 */
function detectTbColumns(ws) {
  const scanRows = Math.min(ws.rowCount || 0, 40);
  const scanCols = Math.min(ws.columnCount || 0, 40);

  let headerRow = -1;

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

    // sometimes the other keywords appear on next rows
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
    return {
      headerRow: 1,
      particularsCol: 1,
      openingCol: 2,
      debitCol: 3,
      creditCol: 4,
      closingCol: 5,
    };
  }

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

  // fallback if Debit/Credit found as "Transactions Debit"
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
 * ✅ Decide where data starts (skip headers)
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

/* -------------------- parse worksheet -> meta + rowsFlat -------------------- */

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
      rowNo: r, // stable key (excel row number)
      ledgerName,
      level,
      opening: parseAmountSide(openingRaw),
      transactions: { debit: toNumberSafe(txDebitRaw), credit: toNumberSafe(txCreditRaw) },
      closing: parseAmountSide(closingRaw),
    });
  }

  return {
    sheetName,
    meta: {
      headerLines,
      headerRow,
      dataStartIdx,
      columns: { particularsCol, openingCol, debitCol, creditCol, closingCol },
    },
    rowsFlat: flatRows,
  };
}

/* -------------------- download excel FROM EDITED TABLE -------------------- */

async function downloadAsExcelFromFlatRows({ headerLines, flatRows, selectedSheet }) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Trial Balance");

  const totalCols = 5; // A..E
  let currentRow = 1;

  // 1) title/date lines
  for (let i = 0; i < (headerLines?.length || 0); i++) {
    ws.getRow(currentRow).getCell(1).value = headerLines[i];
    ws.mergeCells(currentRow, 1, currentRow, totalCols);
    ws.getRow(currentRow).font = i === 0 ? { bold: true, size: 14 } : { bold: true };
    currentRow += 1;
  }

  // blank line
  currentRow += 1;

  // 2) table header (2 rows)
  const headerTop = currentRow;
  const headerBottom = currentRow + 1;

  ws.getRow(headerTop).getCell(1).value = "Particulars";
  ws.getRow(headerTop).getCell(2).value = "Opening Balance";
  ws.getRow(headerTop).getCell(3).value = "Transactions";
  ws.getRow(headerTop).getCell(5).value = "Closing Balance";

  ws.getRow(headerBottom).getCell(3).value = "Debit";
  ws.getRow(headerBottom).getCell(4).value = "Credit";

  ws.mergeCells(headerTop, 1, headerBottom, 1);
  ws.mergeCells(headerTop, 2, headerBottom, 2);
  ws.mergeCells(headerTop, 5, headerBottom, 5);
  ws.mergeCells(headerTop, 3, headerTop, 4);

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

  // 3) DATA FROM EDITED flatRows (preserve level indent)
  for (const r of flatRows || []) {
    const excelRow = ws.getRow(currentRow);

    excelRow.getCell(1).value = r.ledgerName ?? "";
    excelRow.getCell(2).value = formatAmountSide(r.opening);
    excelRow.getCell(3).value = r.transactions?.debit ?? "";
    excelRow.getCell(4).value = r.transactions?.credit ?? "";
    excelRow.getCell(5).value = formatAmountSide(r.closing);

    excelRow.getCell(1).alignment = { indent: r.level || 0, vertical: "middle" };

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

  ws.getColumn(1).width = 45;
  ws.getColumn(2).width = 18;
  ws.getColumn(3).width = 16;
  ws.getColumn(4).width = 16;
  ws.getColumn(5).width = 18;

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
  const originalFlatRowsRef = useRef([]); // ✅ for "Reset changes"

  const [fileName, setFileName] = useState("");
  const [sheetNames, setSheetNames] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState("");

  const [meta, setMeta] = useState(null); // ✅ headerLines + cols info
  const [flatRows, setFlatRows] = useState([]); // ✅ THIS IS YOUR TABLE STATE (editable)
  const [uploadErr, setUploadErr] = useState("");

  const [editMode, setEditMode] = useState(false);
  const [showJson, setShowJson] = useState(false);

  useEffect(() => {
    const u = getSession();
    if (!u) return router.replace("/auth/login");
    if (u.role !== "DOC_SPECIALIST") return router.replace(ROLE_HOME[u.role] || "/auth/login");
    setUser(u);
  }, [router]);

  // Build nested preview from EDITED flatRows
  const treeRows = useMemo(() => buildTreeFromLevels(flatRows), [flatRows]);
  const previewRows = useMemo(() => flattenTreeRows(treeRows).slice(0, 300), [treeRows]);

  function updateRow(rowNo, patch) {
    setFlatRows((prev) => {
      const idx = prev.findIndex((x) => x.rowNo === rowNo);
      if (idx === -1) return prev;

      const updated = [...prev];
      updated[idx] = { ...updated[idx], ...patch };
      return updated;
    });
  }

  function updateOpening(rowNo, field, value) {
    setFlatRows((prev) => {
      const idx = prev.findIndex((x) => x.rowNo === rowNo);
      if (idx === -1) return prev;
      const updated = [...prev];
      const row = updated[idx];

      const next = {
        ...row,
        opening: { ...(row.opening || { amount: null, side: null }) },
      };

      if (field === "amount") next.opening.amount = value === "" ? null : toNumberSafe(value);
      if (field === "side") next.opening.side = value || null;

      updated[idx] = next;
      return updated;
    });
  }

  function updateClosing(rowNo, field, value) {
    setFlatRows((prev) => {
      const idx = prev.findIndex((x) => x.rowNo === rowNo);
      if (idx === -1) return prev;
      const updated = [...prev];
      const row = updated[idx];

      const next = {
        ...row,
        closing: { ...(row.closing || { amount: null, side: null }) },
      };

      if (field === "amount") next.closing.amount = value === "" ? null : toNumberSafe(value);
      if (field === "side") next.closing.side = value || null;

      updated[idx] = next;
      return updated;
    });
  }

  function updateTxn(rowNo, field, value) {
    setFlatRows((prev) => {
      const idx = prev.findIndex((x) => x.rowNo === rowNo);
      if (idx === -1) return prev;

      const updated = [...prev];
      const row = updated[idx];

      const next = {
        ...row,
        transactions: { ...(row.transactions || { debit: null, credit: null }) },
      };

      next.transactions[field] = value === "" ? null : toNumberSafe(value);

      updated[idx] = next;
      return updated;
    });
  }

  async function handleExcelUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadErr("");
    setMeta(null);
    setFlatRows([]);
    setSheetNames([]);
    setSelectedSheet("");
    setFileName(file.name);
    setEditMode(false);

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
        const parsed = parseTrialBalanceWorksheetExcelJS(ws, first);

        setMeta(parsed.meta);
        setFlatRows(parsed.rowsFlat);
        originalFlatRowsRef.current = parsed.rowsFlat.map((x) => JSON.parse(JSON.stringify(x)));

        // optional: store for later steps
        localStorage.setItem("trialbalance_uploaded_filename", file.name);
        localStorage.setItem(
          "trialbalance_uploaded_json",
          JSON.stringify({
            type: "TRIAL_BALANCE",
            sheetName: parsed.sheetName,
            extractedAt: new Date().toISOString(),
            meta: parsed.meta,
            rowsFlat: parsed.rowsFlat,
          })
        );
      }
    } catch (err) {
      setUploadErr(err?.message || "Failed to parse Excel");
    }
  }

  function handleReparse(sheet) {
    const wb = workbookRef.current;
    if (!wb) return;

    setUploadErr("");
    setMeta(null);
    setFlatRows([]);
    setEditMode(false);

    try {
      const ws = wb.getWorksheet(sheet);
      const parsed = parseTrialBalanceWorksheetExcelJS(ws, sheet);

      setMeta(parsed.meta);
      setFlatRows(parsed.rowsFlat);
      originalFlatRowsRef.current = parsed.rowsFlat.map((x) => JSON.parse(JSON.stringify(x)));
    } catch (err) {
      setUploadErr(err?.message || "Failed to parse selected sheet");
    }
  }

  function resetEdits() {
    setFlatRows(originalFlatRowsRef.current.map((x) => JSON.parse(JSON.stringify(x))));
    setEditMode(false);
  }

  async function downloadExcelFromTable() {
    await downloadAsExcelFromFlatRows({
      headerLines: meta?.headerLines || [],
      flatRows, // ✅ edited table values
      selectedSheet,
    });
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
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Upload Excel</h2>
          <p className="mt-1 text-sm text-slate-500">
            Parse TB → Preview → Edit → Download Excel (download uses edited table data)
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
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs font-medium text-slate-600">Sheet</label>
                <select
                  value={selectedSheet}
                  onChange={(e) => {
                    const s = e.target.value;
                    setSelectedSheet(s);
                    handleReparse(s);
                  }}
                  className="flex-1 min-w-[220px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-black
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

            {meta && flatRows.length ? (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                <div className="text-xs text-slate-500">
                  Parsed <span className="font-medium text-slate-700">{flatRows.length}</span> rows
                  <div className="mt-1 text-[11px] text-slate-400">
                    Header lines: {meta.headerLines?.length ?? 0} • Data starts: {meta.dataStartIdx}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditMode((v) => !v)}
                    className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium text-white
                               hover:bg-slate-800 active:bg-slate-950 transition"
                  >
                    {editMode ? "Exit Edit Mode" : "Edit Mode"}
                  </button>

                  <button
                    type="button"
                    onClick={resetEdits}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700
                               hover:bg-slate-50 active:bg-slate-100"
                  >
                    Reset
                  </button>

                  <button
                    type="button"
                    onClick={downloadExcelFromTable}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700
                               hover:bg-slate-50 active:bg-slate-100"
                  >
                    Download Excel (Edited)
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowJson((v) => !v)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700
                               hover:bg-slate-50 active:bg-slate-100"
                  >
                    {showJson ? "Hide JSON" : "Show JSON"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Preview */}
        {meta && flatRows.length ? (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900">Preview (editable)</h3>

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
                        {editMode ? (
                          <input
                            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
                            style={{ paddingLeft: 8 + (r.level || 0) * 16 }}
                            value={r.ledgerName ?? ""}
                            onChange={(e) => updateRow(r.rowNo, { ledgerName: e.target.value })}
                          />
                        ) : (
                          <span className="text-slate-700" style={{ paddingLeft: (r.level || 0) * 16, display: "inline-block" }}>
                            {r.ledgerName}
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-2 border-b border-slate-200 text-slate-700">
                        {editMode ? (
                          <div className="flex items-center gap-2">
                            <input
                              className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
                              value={r.opening?.amount ?? ""}
                              onChange={(e) => updateOpening(r.rowNo, "amount", e.target.value)}
                              placeholder="amount"
                            />
                            <select
                              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
                              value={r.opening?.side ?? ""}
                              onChange={(e) => updateOpening(r.rowNo, "side", e.target.value)}
                            >
                              <option value="">-</option>
                              <option value="Dr">Dr</option>
                              <option value="Cr">Cr</option>
                            </select>
                          </div>
                        ) : (
                          formatAmountSide(r.opening)
                        )}
                      </td>

                      <td className="px-3 py-2 border-b border-slate-200 text-slate-700">
                        {editMode ? (
                          <input
                            className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
                            value={r.transactions?.debit ?? ""}
                            onChange={(e) => updateTxn(r.rowNo, "debit", e.target.value)}
                          />
                        ) : (
                          r.transactions?.debit ?? ""
                        )}
                      </td>

                      <td className="px-3 py-2 border-b border-slate-200 text-slate-700">
                        {editMode ? (
                          <input
                            className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
                            value={r.transactions?.credit ?? ""}
                            onChange={(e) => updateTxn(r.rowNo, "credit", e.target.value)}
                          />
                        ) : (
                          r.transactions?.credit ?? ""
                        )}
                      </td>

                      <td className="px-3 py-2 border-b border-slate-200 text-slate-700">
                        {editMode ? (
                          <div className="flex items-center gap-2">
                            <input
                              className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
                              value={r.closing?.amount ?? ""}
                              onChange={(e) => updateClosing(r.rowNo, "amount", e.target.value)}
                              placeholder="amount"
                            />
                            <select
                              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
                              value={r.closing?.side ?? ""}
                              onChange={(e) => updateClosing(r.rowNo, "side", e.target.value)}
                            >
                              <option value="">-</option>
                              <option value="Dr">Dr</option>
                              <option value="Cr">Cr</option>
                            </select>
                          </div>
                        ) : (
                          formatAmountSide(r.closing)
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {showJson ? (
              <pre className="mt-4 max-h-96 overflow-auto rounded-xl bg-slate-900 p-4 text-xs text-slate-100">
                {JSON.stringify(
                  {
                    meta,
                    // IMPORTANT: download uses flatRows (edited state)
                    rowsFlat: flatRows,
                  },
                  null,
                  2
                )}
              </pre>
            ) : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}
