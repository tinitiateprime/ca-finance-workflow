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
 * ✅ Detect columns dynamically
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
      rowNo: r,
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

/* -------------------- audit store (localStorage) -------------------- */

const AUDIT_KEY = "tb_audit_logs_v1";

function safeJsonParse(s, fallback) {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

function readAuditLogs() {
  if (typeof window === "undefined") return [];
  return safeJsonParse(localStorage.getItem(AUDIT_KEY) || "[]", []);
}

function writeAuditLogs(logs) {
  if (typeof window === "undefined") return;
  localStorage.setItem(AUDIT_KEY, JSON.stringify(logs));
}

/** add one audit log entry */
function addAuditLog(entry) {
  const logs = readAuditLogs();
  logs.push(entry);
  writeAuditLogs(logs);
}

function makeAuditEntry({ sheetName, rowNo, field, oldValue, newValue, user }) {
  return {
    id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
    sheetName,
    rowNo,
    field, // e.g. "transactions.debit"
    oldValue,
    newValue,
    editedBy: {
      userId: user?.id ?? user?.userId ?? null,
      username: user?.username ?? "Unknown",
      role: user?.role ?? null,
    },
    editedAt: new Date().toISOString(),
  };
}

/** helpers for UI queries */
function getLatestEditForCell(logs, { sheetName, rowNo, field }) {
  const filtered = logs
    .filter((l) => l.sheetName === sheetName && l.rowNo === rowNo && l.field === field)
    .sort((a, b) => new Date(b.editedAt) - new Date(a.editedAt));
  return filtered[0] || null;
}

function getEditsForCell(logs, { sheetName, rowNo, field }) {
  return logs
    .filter((l) => l.sheetName === sheetName && l.rowNo === rowNo && l.field === field)
    .sort((a, b) => new Date(b.editedAt) - new Date(a.editedAt));
}

function getEditsForRow(logs, { sheetName, rowNo }) {
  return logs
    .filter((l) => l.sheetName === sheetName && l.rowNo === rowNo)
    .sort((a, b) => new Date(b.editedAt) - new Date(a.editedAt));
}

/* -------------------- download excel FROM EDITED TABLE -------------------- */

async function downloadAsExcelFromFlatRows({ headerLines, flatRows, selectedSheet }) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Trial Balance");

  const totalCols = 5;
  let currentRow = 1;

  // title/date lines
  for (let i = 0; i < (headerLines?.length || 0); i++) {
    ws.getRow(currentRow).getCell(1).value = headerLines[i];
    ws.mergeCells(currentRow, 1, currentRow, totalCols);
    ws.getRow(currentRow).font = i === 0 ? { bold: true, size: 14 } : { bold: true };
    currentRow += 1;
  }

  currentRow += 1;

  // table header (2 rows)
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

/* -------------------- modal ui -------------------- */

function Modal({ open, title, onClose, children }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-3xl rounded-2xl bg-white shadow-xl border border-slate-200">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
            <div>
              <div className="text-sm font-semibold text-slate-900">{title}</div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
          </div>
          <div className="p-5">{children}</div>
        </div>
      </div>
    </div>
  );
}

function formatDateTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

/* -------------------- component -------------------- */

export default function DocSpecialistHome() {
  const router = useRouter();
  const [user, setUser] = useState(null);

  const workbookRef = useRef(null);
  const originalFlatRowsRef = useRef([]);

  const [fileName, setFileName] = useState("");
  const [sheetNames, setSheetNames] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState("");

  const [meta, setMeta] = useState(null);
  const [flatRows, setFlatRows] = useState([]);
  const [uploadErr, setUploadErr] = useState("");

  const [editMode, setEditMode] = useState(false);

  // audit UI state
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [auditModalTitle, setAuditModalTitle] = useState("");
  const [auditModalLogs, setAuditModalLogs] = useState([]);

  useEffect(() => {
    const u = getSession();
    if (!u) return router.replace("/auth/login");
    // You said A/B/C/D can edit, Y monitors. For now allow all to load page.
    // Gate edit mode by role if you want (example below).
    setUser(u);

    // load audit logs
    setAuditLogs(readAuditLogs());
  }, [router]);

  // Build nested preview from EDITED flatRows
  const treeRows = useMemo(() => buildTreeFromLevels(flatRows), [flatRows]);
  const previewRows = useMemo(() => flattenTreeRows(treeRows).slice(0, 300), [treeRows]);

  // OPTIONAL: gate editMode button
  const canEdit = useMemo(() => {
    const role = user?.role;
    return ["A", "B", "C", "D", "DOC_SPECIALIST"].includes(role);
  }, [user]);

  function openRowAudit(rowNo) {
    const logs = readAuditLogs();
    setAuditLogs(logs);

    const rowLogs = getEditsForRow(logs, { sheetName: selectedSheet, rowNo });
    setAuditModalTitle(`Row Audit • Sheet "${selectedSheet}" • rowNo ${rowNo}`);
    setAuditModalLogs(rowLogs);
    setAuditModalOpen(true);
  }

  function openCellAudit(rowNo, field) {
    const logs = readAuditLogs();
    setAuditLogs(logs);

    const cellLogs = getEditsForCell(logs, { sheetName: selectedSheet, rowNo, field });
    setAuditModalTitle(`Cell Audit • ${field} • rowNo ${rowNo}`);
    setAuditModalLogs(cellLogs);
    setAuditModalOpen(true);
  }

  function logChange(rowNo, field, oldValue, newValue) {
    // don’t log if not changed
    const oldS = JSON.stringify(oldValue ?? null);
    const newS = JSON.stringify(newValue ?? null);
    if (oldS === newS) return;

    const entry = makeAuditEntry({
      sheetName: selectedSheet,
      rowNo,
      field,
      oldValue,
      newValue,
      user,
    });

    addAuditLog(entry);
    // refresh local state
    const logs = readAuditLogs();
    setAuditLogs(logs);
  }

  function updateRow(rowNo, patch) {
    setFlatRows((prev) => {
      const idx = prev.findIndex((x) => x.rowNo === rowNo);
      if (idx === -1) return prev;

      const current = prev[idx];
      // log ledgerName changes if present
      if (Object.prototype.hasOwnProperty.call(patch, "ledgerName")) {
        logChange(rowNo, "ledgerName", current.ledgerName, patch.ledgerName);
      }

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

      if (field === "amount") {
        const newAmt = value === "" ? null : toNumberSafe(value);
        logChange(rowNo, "opening.amount", row.opening?.amount ?? null, newAmt);
        next.opening.amount = newAmt;
      }

      if (field === "side") {
        const newSide = value || null;
        logChange(rowNo, "opening.side", row.opening?.side ?? null, newSide);
        next.opening.side = newSide;
      }

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

      if (field === "amount") {
        const newAmt = value === "" ? null : toNumberSafe(value);
        logChange(rowNo, "closing.amount", row.closing?.amount ?? null, newAmt);
        next.closing.amount = newAmt;
      }

      if (field === "side") {
        const newSide = value || null;
        logChange(rowNo, "closing.side", row.closing?.side ?? null, newSide);
        next.closing.side = newSide;
      }

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

      const newVal = value === "" ? null : toNumberSafe(value);

      if (field === "debit") {
        logChange(rowNo, "transactions.debit", row.transactions?.debit ?? null, newVal);
        next.transactions.debit = newVal;
      }

      if (field === "credit") {
        logChange(rowNo, "transactions.credit", row.transactions?.credit ?? null, newVal);
        next.transactions.credit = newVal;
      }

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
      flatRows,
      selectedSheet,
    });
  }

  // For each cell, show an ⓘ badge if edited at least once
  function CellInfoButton({ rowNo, field }) {
    const latest = getLatestEditForCell(auditLogs, { sheetName: selectedSheet, rowNo, field });
    if (!latest) return <span className="inline-block w-5" />;

    return (
      <button
        type="button"
        title={`Last edited by ${latest.editedBy?.username || "Unknown"} at ${formatDateTime(latest.editedAt)}`}
        onClick={() => openCellAudit(rowNo, field)}
        className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-[11px] text-slate-700 hover:bg-slate-50"
      >
        i
      </button>
    );
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
                  Parsed <span className="font-medium text-slate-700">{flatRows.length}</span> rows • Audit logs:{" "}
                  <span className="font-medium text-slate-700">{auditLogs.length}</span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => setEditMode((v) => !v)}
                      className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium text-white
                                 hover:bg-slate-800 active:bg-slate-950 transition"
                    >
                      {editMode ? "Exit Edit Mode" : "Edit Mode"}
                    </button>
                  ) : null}

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
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Preview */}
        {meta && flatRows.length ? (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900">Preview</h3>

            <div className="mt-4 overflow-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left text-slate-600">
                    <th className="px-3 py-2 border-b border-slate-200">Ledger</th>
                    <th className="px-3 py-2 border-b border-slate-200">Opening</th>
                    <th className="px-3 py-2 border-b border-slate-200">Debit</th>
                    <th className="px-3 py-2 border-b border-slate-200">Credit</th>
                    <th className="px-3 py-2 border-b border-slate-200">Closing</th>
                    <th className="px-3 py-2 border-b border-slate-200 text-right">Audit</th>
                  </tr>
                </thead>

                <tbody>
                  {previewRows.map((r) => (
                    <tr key={r.rowNo} className="odd:bg-white even:bg-slate-50">
                      {/* Ledger */}
                      <td className="px-3 py-2 border-b border-slate-200">
                        <div className="flex items-center">
                          {editMode ? (
                            <input
                              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-black"
                              style={{ paddingLeft: 8 + (r.level || 0) * 16 }}
                              value={r.ledgerName ?? ""}
                              onChange={(e) => updateRow(r.rowNo, { ledgerName: e.target.value })}
                            />
                          ) : (
                            <span
                              className="text-slate-700"
                              style={{ paddingLeft: (r.level || 0) * 16, display: "inline-block" }}
                            >
                              {r.ledgerName}
                            </span>
                          )}
                          <CellInfoButton rowNo={r.rowNo} field="ledgerName" />
                        </div>
                      </td>

                      {/* Opening */}
                      <td className="px-3 py-2 border-b border-slate-200 text-slate-700">
                        <div className="flex items-center">
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
                          <CellInfoButton rowNo={r.rowNo} field="opening.amount" />
                        </div>
                      </td>

                      {/* Debit */}
                      <td className="px-3 py-2 border-b border-slate-200 text-slate-700">
                        <div className="flex items-center">
                          {editMode ? (
                            <input
                              className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
                              value={r.transactions?.debit ?? ""}
                              onChange={(e) => updateTxn(r.rowNo, "debit", e.target.value)}
                            />
                          ) : (
                            r.transactions?.debit ?? ""
                          )}
                          <CellInfoButton rowNo={r.rowNo} field="transactions.debit" />
                        </div>
                      </td>

                      {/* Credit */}
                      <td className="px-3 py-2 border-b border-slate-200 text-slate-700">
                        <div className="flex items-center">
                          {editMode ? (
                            <input
                              className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
                              value={r.transactions?.credit ?? ""}
                              onChange={(e) => updateTxn(r.rowNo, "credit", e.target.value)}
                            />
                          ) : (
                            r.transactions?.credit ?? ""
                          )}
                          <CellInfoButton rowNo={r.rowNo} field="transactions.credit" />
                        </div>
                      </td>

                      {/* Closing */}
                      <td className="px-3 py-2 border-b border-slate-200 text-slate-700">
                        <div className="flex items-center">
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
                          <CellInfoButton rowNo={r.rowNo} field="closing.amount" />
                        </div>
                      </td>

                      {/* Row audit */}
                      <td className="px-3 py-2 border-b border-slate-200 text-right">
                        <button
                          type="button"
                          onClick={() => openRowAudit(r.rowNo)}
                          className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          title="View row audit"
                        >
                          👁
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>

      {/* Audit modal */}
      <Modal
        open={auditModalOpen}
        title={auditModalTitle}
        onClose={() => setAuditModalOpen(false)}
      >
        {auditModalLogs.length === 0 ? (
          <div className="text-sm text-slate-600">No edits recorded for this selection.</div>
        ) : (
          <div className="overflow-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-slate-600">
                  <th className="px-3 py-2 border-b border-slate-200">When</th>
                  <th className="px-3 py-2 border-b border-slate-200">User</th>
                  <th className="px-3 py-2 border-b border-slate-200">Role</th>
                  <th className="px-3 py-2 border-b border-slate-200">Field</th>
                  <th className="px-3 py-2 border-b border-slate-200">Old</th>
                  <th className="px-3 py-2 border-b border-slate-200">New</th>
                </tr>
              </thead>
              <tbody>
                {auditModalLogs.map((l) => (
                  <tr key={l.id} className="odd:bg-white even:bg-slate-50 text-black">
                    <td className="px-3 py-2 border-b  border-slate-200">{formatDateTime(l.editedAt)}</td>
                    <td className="px-3 py-2 border-b border-slate-200">{l.editedBy?.username || "Unknown"}</td>
                    <td className="px-3 py-2 border-b border-slate-200">{l.editedBy?.role || "-"}</td>
                    <td className="px-3 py-2 border-b border-slate-200">{l.field}</td>
                    <td className="px-3 py-2 border-b border-slate-200 text-slate-600">
                      {String(l.oldValue ?? "")}
                    </td>
                    <td className="px-3 py-2 border-b border-slate-200 font-medium text-slate-900">
                      {String(l.newValue ?? "")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 text-xs text-slate-500">
          Note: this demo uses <span className="font-medium">localStorage</span>. In production, store audit logs in DB so Y can see edits from all users/devices.
        </div>
      </Modal>
    </main>
  );
}
