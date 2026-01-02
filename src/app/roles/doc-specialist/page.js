// // ca-finance-workflow-main/src/app/roles/doc-specialist/page.js
// "use client";

// import { useEffect, useMemo, useRef, useState } from "react";
// import { useRouter } from "next/navigation";
// import ExcelJS from "exceljs/dist/exceljs.min.js";

// import { clearSession, getSession } from "@/app/lib/authClient";
// import { ROLE_HOME } from "@/app/lib/roleRoutes";

// /* -------------------- helpers -------------------- */

// function toNumberSafe(val) {
//   const s = String(val ?? "").replace(/,/g, "").trim();
//   if (!s) return null;
//   const n = Number(s);
//   return Number.isFinite(n) ? n : null;
// }

// function stripIndent(name) {
//   return String(name ?? "").replace(/^[\s\u00A0]+/, "").trim();
// }

// function countLeadingWhitespace(name) {
//   const s = String(name ?? "");
//   const m = s.match(/^[\s\u00A0]+/);
//   return m ? m[0].length : 0;
// }

// function parseAmountSide(input) {
//   if (input == null) return { amount: null, side: null };

//   const s = String(input).trim();
//   if (!s) return { amount: null, side: null };

//   const cleaned = s.replace(/,/g, "");
//   const m = cleaned.match(/^(-?\d+(?:\.\d+)?)\s*(Dr|Cr)?$/i);

//   if (!m) {
//     const n = toNumberSafe(cleaned);
//     return { amount: n, side: null };
//   }

//   const amount = toNumberSafe(m[1]);
//   const side = m[2] ? (m[2].toUpperCase() === "DR" ? "Dr" : "Cr") : null;
//   return { amount, side };
// }

// function formatAmountSide(obj) {
//   if (!obj || obj.amount == null) return "";
//   return obj.side ? `${obj.amount} ${obj.side}` : String(obj.amount);
// }

// function buildTreeFromLevels(flatRows) {
//   const roots = [];
//   const stack = [];

//   for (const row of flatRows) {
//     const lvl = Math.max(0, Number(row.level) || 0);
//     const node = { ...row, children: [] };

//     stack[lvl] = node;
//     stack.length = lvl + 1;

//     if (lvl === 0) roots.push(node);
//     else {
//       const parent = stack[lvl - 1];
//       if (parent) parent.children.push(node);
//       else roots.push(node);
//     }
//   }

//   const cleanup = (arr) =>
//     arr.map((n) => {
//       if (!n.children?.length) delete n.children;
//       else n.children = cleanup(n.children);
//       return n;
//     });

//   return cleanup(roots);
// }

// function flattenTreeRows(treeRows) {
//   const out = [];
//   const walk = (nodes) => {
//     for (const n of nodes || []) {
//       out.push(n);
//       if (n.children?.length) walk(n.children);
//     }
//   };
//   walk(treeRows || []);
//   return out;
// }

// /**
//  * ✅ Null-safe cell -> string
//  */
// function cellText(cell) {
//   try {
//     if (!cell) return "";

//     const t = cell.text;
//     if (t !== null && t !== undefined) {
//       const ts = String(t);
//       if (ts.trim() !== "") return ts;
//     }

//     const v = cell.value;
//     if (v === null || v === undefined) return "";

//     if (typeof v === "object") {
//       if (v.richText) return v.richText.map((x) => String(x?.text ?? "")).join("");
//       if (v.text != null) return String(v.text);
//       if (v.result != null) return String(v.result);
//       if (v.formula != null) return String(v.formula);
//     }

//     return String(v);
//   } catch {
//     return "";
//   }
// }

// /**
//  * ✅ Capture title/date lines above table WITHOUT repeating merged texts.
//  */
// function extractHeaderLines(ws, headerRow) {
//   const lines = [];
//   const maxCols = Math.min(ws.columnCount || 0, 30);

//   for (let r = 1; r < headerRow; r++) {
//     const row = ws.getRow(r);

//     const parts = [];
//     const seen = new Set();

//     for (let c = 1; c <= maxCols; c++) {
//       const raw = cellText(row.getCell(c));
//       const txt = raw.replace(/\s+/g, " ").trim();
//       if (!txt) continue;

//       if (seen.has(txt)) continue; // prevent merge repeats
//       seen.add(txt);
//       parts.push(txt);
//     }

//     const line = parts.join(" ").trim();
//     if (line) lines.push(line);
//   }

//   // remove full-line duplicates
//   const uniq = [];
//   const lineSeen = new Set();
//   for (const l of lines) {
//     if (lineSeen.has(l)) continue;
//     lineSeen.add(l);
//     uniq.push(l);
//   }

//   return uniq;
// }

// /**
//  * ✅ Detect columns dynamically
//  */
// function detectTbColumns(ws) {
//   const scanRows = Math.min(ws.rowCount || 0, 40);
//   const scanCols = Math.min(ws.columnCount || 0, 40);

//   let headerRow = -1;

//   for (let r = 1; r <= scanRows; r++) {
//     const row = ws.getRow(r);

//     let hasPart = false;
//     let hasOther = false;

//     for (let c = 1; c <= scanCols; c++) {
//       const txt = cellText(row.getCell(c)).toLowerCase().trim();
//       if (!txt) continue;

//       if (txt.includes("particular")) hasPart = true;
//       if (
//         txt.includes("opening") ||
//         txt.includes("closing") ||
//         txt.includes("debit") ||
//         txt.includes("credit") ||
//         txt.includes("transaction")
//       ) {
//         hasOther = true;
//       }
//     }

//     // sometimes other keywords appear in next rows
//     if (hasPart && !hasOther) {
//       for (let rr = r; rr <= Math.min(r + 2, scanRows); rr++) {
//         const rrow = ws.getRow(rr);
//         for (let c = 1; c <= scanCols; c++) {
//           const txt = cellText(rrow.getCell(c)).toLowerCase().trim();
//           if (
//             txt.includes("opening") ||
//             txt.includes("closing") ||
//             txt.includes("debit") ||
//             txt.includes("credit") ||
//             txt.includes("transaction")
//           ) {
//             hasOther = true;
//             break;
//           }
//         }
//         if (hasOther) break;
//       }
//     }

//     if (hasPart && hasOther) {
//       headerRow = r;
//       break;
//     }
//   }

//   if (headerRow === -1) {
//     return { headerRow: 1, particularsCol: 1, openingCol: 2, debitCol: 3, creditCol: 4, closingCol: 5 };
//   }

//   let particularsCol = null;
//   let openingCol = null;
//   let debitCol = null;
//   let creditCol = null;
//   let closingCol = null;

//   const searchRows = [headerRow, headerRow + 1, headerRow + 2].filter((x) => x <= scanRows);

//   for (const r of searchRows) {
//     const row = ws.getRow(r);
//     for (let c = 1; c <= scanCols; c++) {
//       const txt = cellText(row.getCell(c)).toLowerCase().trim();
//       if (!txt) continue;

//       if (particularsCol == null && txt.includes("particular")) particularsCol = c;
//       if (openingCol == null && txt.includes("opening")) openingCol = c;
//       if (debitCol == null && txt === "debit") debitCol = c;
//       if (creditCol == null && txt === "credit") creditCol = c;
//       if (closingCol == null && txt.includes("closing")) closingCol = c;
//     }
//   }

//   // fallback if found as "Transactions Debit"
//   if (debitCol == null || creditCol == null) {
//     for (const r of searchRows) {
//       const row = ws.getRow(r);
//       for (let c = 1; c <= scanCols; c++) {
//         const txt = cellText(row.getCell(c)).toLowerCase().trim();
//         if (!txt) continue;

//         if (debitCol == null && txt.includes("debit")) debitCol = c;
//         if (creditCol == null && txt.includes("credit")) creditCol = c;
//       }
//     }
//   }

//   particularsCol = particularsCol ?? 1;
//   openingCol = openingCol ?? particularsCol + 1;
//   debitCol = debitCol ?? openingCol + 1;
//   creditCol = creditCol ?? debitCol + 1;
//   closingCol = closingCol ?? creditCol + 1;

//   return { headerRow, particularsCol, openingCol, debitCol, creditCol, closingCol };
// }

// /**
//  * ✅ Decide where data starts (skip headers)
//  */
// function detectDataStartRow(ws, headerRow, particularsCol) {
//   const scanLimit = Math.min(ws.rowCount || 0, headerRow + 25);

//   for (let r = headerRow; r <= scanLimit; r++) {
//     const txt = cellText(ws.getRow(r).getCell(particularsCol)).toLowerCase().trim();
//     if (!txt) continue;

//     if (
//       txt.includes("trial balance") ||
//       txt.includes("particular") ||
//       txt.includes("opening") ||
//       txt.includes("closing") ||
//       txt.includes("transaction") ||
//       txt === "debit" ||
//       txt === "credit"
//     ) {
//       continue;
//     }

//     return r;
//   }

//   return headerRow + 1;
// }

// /* -------------------- parse worksheet -> meta + rowsFlat -------------------- */

// function parseTrialBalanceWorksheetExcelJS(ws, sheetName) {
//   const { headerRow, particularsCol, openingCol, debitCol, creditCol, closingCol } = detectTbColumns(ws);

//   const headerLines = extractHeaderLines(ws, headerRow);
//   const dataStartIdx = detectDataStartRow(ws, headerRow, particularsCol);

//   const flatRows = [];
//   const SPACES_PER_LEVEL = 2;

//   for (let r = dataStartIdx; r <= (ws.rowCount || 0); r++) {
//     const row = ws.getRow(r);

//     const nameCell = row.getCell(particularsCol);
//     const nameStrRaw = cellText(nameCell);
//     const ledgerName = stripIndent(nameStrRaw);

//     const openingRaw = cellText(row.getCell(openingCol));
//     const txDebitRaw = cellText(row.getCell(debitCol));
//     const txCreditRaw = cellText(row.getCell(creditCol));
//     const closingRaw = cellText(row.getCell(closingCol));

//     const isRowEmpty =
//       ledgerName === "" && [openingRaw, txDebitRaw, txCreditRaw, closingRaw].every((x) => String(x).trim() === "");

//     if (isRowEmpty) continue;
//     if (!ledgerName) continue;

//     const indentFromStyle = Number.isFinite(nameCell?.alignment?.indent) ? nameCell.alignment.indent : null;
//     const leadingSpaces = countLeadingWhitespace(nameStrRaw);

//     const level = indentFromStyle != null ? indentFromStyle : Math.floor(leadingSpaces / SPACES_PER_LEVEL);

//     flatRows.push({
//       rowNo: r,
//       ledgerName,
//       level,
//       opening: parseAmountSide(openingRaw),
//       transactions: { debit: toNumberSafe(txDebitRaw), credit: toNumberSafe(txCreditRaw) },
//       closing: parseAmountSide(closingRaw),
//     });
//   }

//   return {
//     sheetName,
//     meta: {
//       headerLines,
//       headerRow,
//       dataStartIdx,
//       columns: { particularsCol, openingCol, debitCol, creditCol, closingCol },
//     },
//     rowsFlat: flatRows,
//   };
// }

// /* -------------------- audit store (localStorage) -------------------- */

// function safeJsonParse(s, fallback) {
//   try {
//     return JSON.parse(s);
//   } catch {
//     return fallback;
//   }
// }

// // Each file+sheet gets its own audit bucket.
// function auditKeyFor(fileId, sheetName) {
//   return `tb_audit_v2::${fileId || "nofile"}::${sheetName || "nosheet"}`;
// }

// function readAuditBucket(auditKey) {
//   if (typeof window === "undefined") return { fileId: null, fileName: null, sheetName: null, auditLogs: [] };
//   return safeJsonParse(localStorage.getItem(auditKey) || "null", null) || {
//     type: "TRIAL_BALANCE_AUDIT_BUCKET",
//     fileId: null,
//     fileName: null,
//     sheetName: null,
//     auditLogs: [],
//     updatedAt: null,
//   };
// }

// function writeAuditBucket(auditKey, bucket) {
//   if (typeof window === "undefined") return;
//   localStorage.setItem(auditKey, JSON.stringify(bucket));
// }

// // Append-only; returns updated logs
// function appendAuditLog(auditKey, { fileId, fileName, sheetName, entry }) {
//   const bucket = readAuditBucket(auditKey);
//   const next = {
//     type: "TRIAL_BALANCE_AUDIT_BUCKET",
//     fileId,
//     fileName,
//     sheetName,
//     auditLogs: [...(bucket.auditLogs || []), entry],
//     updatedAt: new Date().toISOString(),
//   };
//   writeAuditBucket(auditKey, next);
//   return next.auditLogs;
// }

// function makeAuditEntry({ fileId, fileName, sheetName, rowNo, field, oldValue, newValue, user }) {
//   return {
//     id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
//     fileId,
//     fileName,
//     sheetName,
//     rowNo,
//     field, // e.g. "transactions.debit"
//     oldValue,
//     newValue,
//     editedBy: {
//       userId: user?.id ?? user?.userId ?? null,
//       username: user?.username ?? "Unknown",
//       role: user?.role ?? null,
//     },
//     editedAt: new Date().toISOString(),
//   };
// }

// function getLatestEditForCell(logs, { rowNo, field }) {
//   const filtered = (logs || [])
//     .filter((l) => l.rowNo === rowNo && l.field === field)
//     .sort((a, b) => new Date(b.editedAt) - new Date(a.editedAt));
//   return filtered[0] || null;
// }

// function getEditsForCell(logs, { rowNo, field }) {
//   return (logs || [])
//     .filter((l) => l.rowNo === rowNo && l.field === field)
//     .sort((a, b) => new Date(b.editedAt) - new Date(a.editedAt));
// }

// function getEditsForRow(logs, { rowNo }) {
//   return (logs || [])
//     .filter((l) => l.rowNo === rowNo)
//     .sort((a, b) => new Date(b.editedAt) - new Date(a.editedAt));
// }

// /* -------------------- download excel FROM EDITED TABLE -------------------- */

// async function downloadAsExcelFromFlatRows({ headerLines, flatRows, selectedSheet }) {
//   const wb = new ExcelJS.Workbook();
//   const ws = wb.addWorksheet("Trial Balance");

//   const totalCols = 5;
//   let currentRow = 1;

//   // title/date lines
//   for (let i = 0; i < (headerLines?.length || 0); i++) {
//     ws.getRow(currentRow).getCell(1).value = headerLines[i];
//     ws.mergeCells(currentRow, 1, currentRow, totalCols);
//     ws.getRow(currentRow).font = i === 0 ? { bold: true, size: 14 } : { bold: true };
//     currentRow += 1;
//   }

//   currentRow += 1;

//   // table header (2 rows)
//   const headerTop = currentRow;
//   const headerBottom = currentRow + 1;

//   ws.getRow(headerTop).getCell(1).value = "Particulars";
//   ws.getRow(headerTop).getCell(2).value = "Opening Balance";
//   ws.getRow(headerTop).getCell(3).value = "Transactions";
//   ws.getRow(headerTop).getCell(5).value = "Closing Balance";

//   ws.getRow(headerBottom).getCell(3).value = "Debit";
//   ws.getRow(headerBottom).getCell(4).value = "Credit";

//   ws.mergeCells(headerTop, 1, headerBottom, 1);
//   ws.mergeCells(headerTop, 2, headerBottom, 2);
//   ws.mergeCells(headerTop, 5, headerBottom, 5);
//   ws.mergeCells(headerTop, 3, headerTop, 4);

//   for (let r = headerTop; r <= headerBottom; r++) {
//     const row = ws.getRow(r);
//     row.font = { bold: true };
//     row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
//     row.eachCell({ includeEmpty: true }, (cell) => {
//       cell.border = {
//         top: { style: "thin" },
//         left: { style: "thin" },
//         bottom: { style: "thin" },
//         right: { style: "thin" },
//       };
//     });
//   }

//   currentRow = headerBottom + 1;

//   for (const r of flatRows || []) {
//     const excelRow = ws.getRow(currentRow);

//     excelRow.getCell(1).value = r.ledgerName ?? "";
//     excelRow.getCell(2).value = formatAmountSide(r.opening);
//     excelRow.getCell(3).value = r.transactions?.debit ?? "";
//     excelRow.getCell(4).value = r.transactions?.credit ?? "";
//     excelRow.getCell(5).value = formatAmountSide(r.closing);

//     excelRow.getCell(1).alignment = { indent: r.level || 0, vertical: "middle" };

//     excelRow.eachCell({ includeEmpty: true }, (cell) => {
//       cell.border = {
//         top: { style: "thin" },
//         left: { style: "thin" },
//         bottom: { style: "thin" },
//         right: { style: "thin" },
//       };
//       if (!cell.alignment) cell.alignment = {};
//       cell.alignment.vertical = "middle";
//     });

//     currentRow += 1;
//   }

//   ws.getColumn(1).width = 45;
//   ws.getColumn(2).width = 18;
//   ws.getColumn(3).width = 16;
//   ws.getColumn(4).width = 16;
//   ws.getColumn(5).width = 18;

//   const buffer = await wb.xlsx.writeBuffer();
//   const blob = new Blob([buffer], {
//     type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
//   });

//   const url = URL.createObjectURL(blob);
//   const a = document.createElement("a");
//   a.href = url;
//   a.download = `trialbalance_${selectedSheet || "sheet"}.xlsx`;
//   a.click();
//   URL.revokeObjectURL(url);
// }

// /* -------------------- download AUDIT JSON -------------------- */

// function downloadAuditJson({ fileId, fileName, sheetName, auditLogs }) {
//   const payload = {
//     type: "TRIAL_BALANCE_AUDIT",
//     fileId,
//     fileName,
//     sheetName,
//     auditLogs: auditLogs || [],
//     downloadedAt: new Date().toISOString(),
//   };

//   const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
//   const url = URL.createObjectURL(blob);
//   const a = document.createElement("a");
//   a.href = url;
//   a.download = `trialbalance_audit_${sheetName || "sheet"}.json`;
//   a.click();
//   URL.revokeObjectURL(url);
// }

// /* -------------------- modal ui -------------------- */

// function Modal({ open, title, onClose, children }) {
//   if (!open) return null;

//   return (
//     <div className="fixed inset-0 z-[100]">
//       <div className="absolute inset-0 bg-black/40" onClick={onClose} />
//       <div className="absolute inset-0 flex items-center justify-center p-4">
//         <div className="w-full max-w-3xl rounded-2xl bg-white shadow-xl border border-slate-200">
//           <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
//             <div className="text-sm font-semibold text-slate-900">{title}</div>
//             <button
//               onClick={onClose}
//               className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
//             >
//               Close
//             </button>
//           </div>
//           <div className="p-5">{children}</div>
//         </div>
//       </div>
//     </div>
//   );
// }

// function formatDateTime(iso) {
//   try {
//     const d = new Date(iso);
//     return d.toLocaleString();
//   } catch {
//     return iso;
//   }
// }

// /* -------------------- component -------------------- */

// export default function DocSpecialistHome() {
//   const router = useRouter();
//   const [user, setUser] = useState(null);

//   const workbookRef = useRef(null);
//   const originalFlatRowsRef = useRef([]);

//   const [fileId, setFileId] = useState("");
//   const [fileName, setFileName] = useState("");

//   const [sheetNames, setSheetNames] = useState([]);
//   const [selectedSheet, setSelectedSheet] = useState("");

//   const [meta, setMeta] = useState(null);
//   const [flatRows, setFlatRows] = useState([]);
//   const [uploadErr, setUploadErr] = useState("");

//   const [editMode, setEditMode] = useState(false);

//   // audit state (for CURRENT fileId+sheetName)
//   const [auditKey, setAuditKey] = useState("");
//   const [auditLogs, setAuditLogs] = useState([]);

//   // modal state
//   const [auditModalOpen, setAuditModalOpen] = useState(false);
//   const [auditModalTitle, setAuditModalTitle] = useState("");
//   const [auditModalLogs, setAuditModalLogs] = useState([]);

//   // ✅ fixes duplicates:
//   // 1) do NOT log in setState updaters
//   // 2) log only on COMMIT (blur / select change)
//   // 3) dedupe guard for identical event fired twice
//   const editStartRef = useRef(new Map()); // key => startValue
//   const lastAuditSigRef = useRef({ sig: "", ts: 0 });

//   useEffect(() => {
//     const u = getSession();
//     if (!u) return router.replace("/auth/login");
//     setUser(u);
//   }, [router]);

//   // Build nested preview from EDITED flatRows
//   const treeRows = useMemo(() => buildTreeFromLevels(flatRows), [flatRows]);
//   const previewRows = useMemo(() => flattenTreeRows(treeRows).slice(0, 300), [treeRows]);

//   // Roles: A/B/C/D can edit, Y monitors
//   const canEdit = useMemo(() => {
//     const role = user?.role;
//     return ["A", "B", "C", "D", "DOC_SPECIALIST"].includes(role);
//   }, [user]);

//   // whenever fileId+sheet changes, load that audit bucket
//   useEffect(() => {
//     if (!fileId || !selectedSheet) return;
//     const k = auditKeyFor(fileId, selectedSheet);
//     setAuditKey(k);
//     const bucket = readAuditBucket(k);
//     setAuditLogs(bucket.auditLogs || []);
//   }, [fileId, selectedSheet]);

//   function openRowAudit(rowNo) {
//     const logs = readAuditBucket(auditKey).auditLogs || [];
//     setAuditLogs(logs);
//     const rowLogs = getEditsForRow(logs, { rowNo });
//     setAuditModalTitle(`Row Audit • Sheet "${selectedSheet}" • rowNo ${rowNo}`);
//     setAuditModalLogs(rowLogs);
//     setAuditModalOpen(true);
//   }

//   function openCellAudit(rowNo, field) {
//     const logs = readAuditBucket(auditKey).auditLogs || [];
//     setAuditLogs(logs);
//     const cellLogs = getEditsForCell(logs, { rowNo, field });
//     setAuditModalTitle(`Cell Audit • ${field} • rowNo ${rowNo}`);
//     setAuditModalLogs(cellLogs);
//     setAuditModalOpen(true);
//   }

//   function setEditStart(rowNo, field, startValue) {
//     editStartRef.current.set(`${rowNo}::${field}`, startValue ?? null);
//   }

//   function getEditStart(rowNo, field) {
//     return editStartRef.current.get(`${rowNo}::${field}`);
//   }

//   function clearEditStart(rowNo, field) {
//     editStartRef.current.delete(`${rowNo}::${field}`);
//   }

//   function logCommit({ rowNo, field, oldValue, newValue }) {
//     // only log true changes
//     const oldS = JSON.stringify(oldValue ?? null);
//     const newS = JSON.stringify(newValue ?? null);
//     if (oldS === newS) return;

//     // ✅ dedupe identical events fired twice in short window
//     const sig = `${fileId}::${selectedSheet}::${rowNo}::${field}::${oldS}=>${newS}`;
//     const now = Date.now();
//     if (lastAuditSigRef.current.sig === sig && now - lastAuditSigRef.current.ts < 600) return;
//     lastAuditSigRef.current = { sig, ts: now };

//     const entry = makeAuditEntry({
//       fileId,
//       fileName,
//       sheetName: selectedSheet,
//       rowNo,
//       field,
//       oldValue,
//       newValue,
//       user,
//     });

//     const nextLogs = appendAuditLog(auditKey, {
//       fileId,
//       fileName,
//       sheetName: selectedSheet,
//       entry,
//     });

//     setAuditLogs(nextLogs);
//   }

//   // --- state updates (NO logging inside these) ---
//   function updateRowOnly(rowNo, patch) {
//     setFlatRows((prev) => {
//       const idx = prev.findIndex((x) => x.rowNo === rowNo);
//       if (idx === -1) return prev;
//       const updated = [...prev];
//       updated[idx] = { ...updated[idx], ...patch };
//       return updated;
//     });
//   }

//   function updateOpeningOnly(rowNo, field, value) {
//     setFlatRows((prev) => {
//       const idx = prev.findIndex((x) => x.rowNo === rowNo);
//       if (idx === -1) return prev;
//       const updated = [...prev];
//       const row = updated[idx];
//       const next = { ...row, opening: { ...(row.opening || { amount: null, side: null }) } };

//       if (field === "amount") next.opening.amount = value === "" ? null : toNumberSafe(value);
//       if (field === "side") next.opening.side = value || null;

//       updated[idx] = next;
//       return updated;
//     });
//   }

//   function updateClosingOnly(rowNo, field, value) {
//     setFlatRows((prev) => {
//       const idx = prev.findIndex((x) => x.rowNo === rowNo);
//       if (idx === -1) return prev;
//       const updated = [...prev];
//       const row = updated[idx];
//       const next = { ...row, closing: { ...(row.closing || { amount: null, side: null }) } };

//       if (field === "amount") next.closing.amount = value === "" ? null : toNumberSafe(value);
//       if (field === "side") next.closing.side = value || null;

//       updated[idx] = next;
//       return updated;
//     });
//   }

//   function updateTxnOnly(rowNo, field, value) {
//     setFlatRows((prev) => {
//       const idx = prev.findIndex((x) => x.rowNo === rowNo);
//       if (idx === -1) return prev;
//       const updated = [...prev];
//       const row = updated[idx];
//       const next = { ...row, transactions: { ...(row.transactions || { debit: null, credit: null }) } };

//       next.transactions[field] = value === "" ? null : toNumberSafe(value);

//       updated[idx] = next;
//       return updated;
//     });
//   }

//   // --- commit handlers (logging happens here only) ---
//   function commitLedgerName(rowNo, finalValue) {
//     const start = getEditStart(rowNo, "ledgerName");
//     clearEditStart(rowNo, "ledgerName");
//     logCommit({ rowNo, field: "ledgerName", oldValue: start ?? null, newValue: finalValue ?? null });
//   }

//   function commitOpeningAmount(rowNo, finalAmt) {
//     const start = getEditStart(rowNo, "opening.amount");
//     clearEditStart(rowNo, "opening.amount");
//     logCommit({ rowNo, field: "opening.amount", oldValue: start ?? null, newValue: finalAmt ?? null });
//   }

//   function commitOpeningSide(rowNo, finalSide) {
//     const start = getEditStart(rowNo, "opening.side");
//     clearEditStart(rowNo, "opening.side");
//     logCommit({ rowNo, field: "opening.side", oldValue: start ?? null, newValue: finalSide ?? null });
//   }

//   function commitDebit(rowNo, finalDebit) {
//     const start = getEditStart(rowNo, "transactions.debit");
//     clearEditStart(rowNo, "transactions.debit");
//     logCommit({ rowNo, field: "transactions.debit", oldValue: start ?? null, newValue: finalDebit ?? null });
//   }

//   function commitCredit(rowNo, finalCredit) {
//     const start = getEditStart(rowNo, "transactions.credit");
//     clearEditStart(rowNo, "transactions.credit");
//     logCommit({ rowNo, field: "transactions.credit", oldValue: start ?? null, newValue: finalCredit ?? null });
//   }

//   function commitClosingAmount(rowNo, finalAmt) {
//     const start = getEditStart(rowNo, "closing.amount");
//     clearEditStart(rowNo, "closing.amount");
//     logCommit({ rowNo, field: "closing.amount", oldValue: start ?? null, newValue: finalAmt ?? null });
//   }

//   function commitClosingSide(rowNo, finalSide) {
//     const start = getEditStart(rowNo, "closing.side");
//     clearEditStart(rowNo, "closing.side");
//     logCommit({ rowNo, field: "closing.side", oldValue: start ?? null, newValue: finalSide ?? null });
//   }

//   async function handleExcelUpload(e) {
//     const file = e.target.files?.[0];
//     if (!file) return;

//     setUploadErr("");
//     setMeta(null);
//     setFlatRows([]);
//     setSheetNames([]);
//     setSelectedSheet("");
//     setEditMode(false);

//     const newFileId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
//     setFileId(newFileId);
//     setFileName(file.name);

//     try {
//       const buf = await file.arrayBuffer();

//       const wb = new ExcelJS.Workbook();
//       await wb.xlsx.load(buf);

//       workbookRef.current = wb;

//       const names = wb.worksheets.map((w) => w.name);
//       setSheetNames(names);

//       const first = names[0] || "";
//       setSelectedSheet(first);

//       if (first) {
//         const ws = wb.getWorksheet(first);
//         const parsed = parseTrialBalanceWorksheetExcelJS(ws, first);

//         setMeta(parsed.meta);
//         setFlatRows(parsed.rowsFlat);
//         originalFlatRowsRef.current = parsed.rowsFlat.map((x) => JSON.parse(JSON.stringify(x)));

//         // init audit bucket (no overwrite if already exists)
//         const k = auditKeyFor(newFileId, first);
//         const existing = readAuditBucket(k);
//         if (!existing.fileId) {
//           writeAuditBucket(k, {
//             type: "TRIAL_BALANCE_AUDIT_BUCKET",
//             fileId: newFileId,
//             fileName: file.name,
//             sheetName: first,
//             auditLogs: [],
//             updatedAt: new Date().toISOString(),
//           });
//         }
//       }
//     } catch (err) {
//       setUploadErr(err?.message || "Failed to parse Excel");
//     }
//   }

//   function handleReparse(sheet) {
//     const wb = workbookRef.current;
//     if (!wb) return;

//     setUploadErr("");
//     setMeta(null);
//     setFlatRows([]);
//     setEditMode(false);

//     try {
//       const ws = wb.getWorksheet(sheet);
//       const parsed = parseTrialBalanceWorksheetExcelJS(ws, sheet);

//       setMeta(parsed.meta);
//       setFlatRows(parsed.rowsFlat);
//       originalFlatRowsRef.current = parsed.rowsFlat.map((x) => JSON.parse(JSON.stringify(x)));

//       // load audit for this sheet
//       const k = auditKeyFor(fileId, sheet);
//       setAuditKey(k);
//       const bucket = readAuditBucket(k);
//       setAuditLogs(bucket.auditLogs || []);
//     } catch (err) {
//       setUploadErr(err?.message || "Failed to parse selected sheet");
//     }
//   }

//   function resetEdits() {
//     setFlatRows(originalFlatRowsRef.current.map((x) => JSON.parse(JSON.stringify(x))));
//     setEditMode(false);
//   }

//   async function downloadExcelFromTable() {
//     await downloadAsExcelFromFlatRows({
//       headerLines: meta?.headerLines || [],
//       flatRows,
//       selectedSheet,
//     });
//   }

//   // For each cell, show an ⓘ badge if edited at least once
//   function CellInfoButton({ rowNo, field }) {
//     const latest = getLatestEditForCell(auditLogs, { rowNo, field });
//     if (!latest) return <span className="inline-block w-5" />;

//     return (
//       <button
//         type="button"
//         title={`Last edited by ${latest.editedBy?.username || "Unknown"} at ${formatDateTime(latest.editedAt)}`}
//         onClick={() => openCellAudit(rowNo, field)}
//         className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-[11px] text-slate-700 hover:bg-slate-50"
//       >
//         i
//       </button>
//     );
//   }

//   if (!user) return null;

//   return (
//     <main className="min-h-screen bg-slate-50">
//       <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-slate-200">
//         <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
//           <div>
//             <h1 className="text-lg sm:text-xl font-semibold text-slate-900">Doc Specialist</h1>
//             <p className="text-sm text-slate-500">
//               Welcome <span className="font-medium text-slate-700">{user.username}</span>{" "}
//               <span className="text-slate-400">•</span>{" "}
//               <span className="font-medium text-slate-700">{user.role}</span>
//             </p>
//           </div>

//           <button
//             onClick={() => {
//               clearSession();
//               router.push("/auth/login");
//             }}
//             className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700
//                        hover:bg-slate-50 active:bg-slate-100 transition
//                        focus:outline-none focus:ring-4 focus:ring-slate-200"
//           >
//             Logout
//           </button>
//         </div>
//       </header>

//       <section className="mx-auto max-w-6xl px-4 py-6">
//         <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
//           <h2 className="text-base font-semibold text-slate-900">Upload Excel</h2>

//           <div className="mt-4 space-y-3">
//             <input
//               type="file"
//               accept=".xlsx,.xls"
//               onChange={handleExcelUpload}
//               className="block w-full text-sm text-slate-700
//                          file:mr-4 file:rounded-xl file:border-0
//                          file:bg-slate-900 file:px-4 file:py-2.5
//                          file:text-sm file:font-medium file:text-white
//                          hover:file:bg-slate-800"
//             />

//             {sheetNames.length ? (
//               <div className="flex flex-wrap items-center gap-2">
//                 <label className="text-xs font-medium text-slate-600">Sheet</label>
//                 <select
//                   value={selectedSheet}
//                   onChange={(e) => {
//                     const s = e.target.value;
//                     setSelectedSheet(s);
//                     handleReparse(s);
//                   }}
//                   className="flex-1 min-w-[220px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-black
//                              focus:outline-none focus:ring-4 focus:ring-slate-200"
//                 >
//                   {sheetNames.map((s) => (
//                     <option key={s} value={s}>
//                       {s}
//                     </option>
//                   ))}
//                 </select>

//                 <button
//                   type="button"
//                   onClick={() => handleReparse(selectedSheet)}
//                   className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700
//                              hover:bg-slate-50 active:bg-slate-100"
//                 >
//                   Re-parse
//                 </button>
//               </div>
//             ) : null}

//             {uploadErr ? (
//               <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{uploadErr}</div>
//             ) : null}

//             {meta && flatRows.length ? (
//               <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
//                 <div className="text-xs text-slate-500">
//                   File: <span className="font-medium text-slate-700">{fileName}</span> • Parsed{" "}
//                   <span className="font-medium text-slate-700">{flatRows.length}</span> rows • Audit logs:{" "}
//                   <span className="font-medium text-slate-700">{auditLogs.length}</span>
//                 </div>

//                 <div className="flex flex-wrap items-center gap-2">
//                   {canEdit ? (
//                     <button
//                       type="button"
//                       onClick={() => setEditMode((v) => !v)}
//                       className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium text-white
//                                  hover:bg-slate-800 active:bg-slate-950 transition"
//                     >
//                       {editMode ? "Exit Edit Mode" : "Edit Mode"}
//                     </button>
//                   ) : null}

//                   <button
//                     type="button"
//                     onClick={resetEdits}
//                     className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700
//                                hover:bg-slate-50 active:bg-slate-100"
//                   >
//                     Reset
//                   </button>

//                   <button
//                     type="button"
//                     onClick={downloadExcelFromTable}
//                     className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700
//                                hover:bg-slate-50 active:bg-slate-100"
//                   >
//                     Download Excel (Edited)
//                   </button>

//                   <button
//                     type="button"
//                     onClick={() =>
//                       downloadAuditJson({
//                         fileId,
//                         fileName,
//                         sheetName: selectedSheet,
//                         auditLogs: readAuditBucket(auditKey).auditLogs || [],
//                       })
//                     }
//                     className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700
//                                hover:bg-slate-50 active:bg-slate-100"
//                   >
//                     Download Audit JSON
//                   </button>
//                 </div>
//               </div>
//             ) : null}
//           </div>
//         </div>

//         {/* Preview */}
//         {meta && flatRows.length ? (
//           <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
//             <h3 className="text-base font-semibold text-slate-900">Preview</h3>

//             <div className="mt-4 overflow-auto rounded-xl border border-slate-200">
//               <table className="min-w-full text-sm">
//                 <thead className="bg-slate-50">
//                   <tr className="text-left text-slate-600">
//                     <th className="px-3 py-2 border-b border-slate-200">Ledger</th>
//                     <th className="px-3 py-2 border-b border-slate-200">Opening</th>
//                     <th className="px-3 py-2 border-b border-slate-200">Debit</th>
//                     <th className="px-3 py-2 border-b border-slate-200">Credit</th>
//                     <th className="px-3 py-2 border-b border-slate-200">Closing</th>
//                     <th className="px-3 py-2 border-b border-slate-200 text-right">Audit</th>
//                   </tr>
//                 </thead>

//                 <tbody>
//                   {previewRows.map((r) => (
//                     <tr key={r.rowNo} className="odd:bg-white even:bg-slate-50">
//                       {/* Ledger */}
//                       <td className="px-3 py-2 border-b border-slate-200">
//                         <div className="flex items-center">
//                           {editMode ? (
//                             <input
//                               className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-black"
//                               style={{ paddingLeft: 8 + (r.level || 0) * 16 }}
//                               value={r.ledgerName ?? ""}
//                               onFocus={() => setEditStart(r.rowNo, "ledgerName", r.ledgerName ?? null)}
//                               onChange={(e) => updateRowOnly(r.rowNo, { ledgerName: e.target.value })}
//                               onBlur={(e) => {
//                                 e.stopPropagation();
//                                 commitLedgerName(r.rowNo, e.target.value);
//                               }}
//                             />
//                           ) : (
//                             <span
//                               className="text-slate-700"
//                               style={{ paddingLeft: (r.level || 0) * 16, display: "inline-block" }}
//                             >
//                               {r.ledgerName}
//                             </span>
//                           )}
//                           <CellInfoButton rowNo={r.rowNo} field="ledgerName" />
//                         </div>
//                       </td>

//                       {/* Opening */}
//                       <td className="px-3 py-2 border-b border-slate-200 text-slate-700">
//                         <div className="flex items-center">
//                           {editMode ? (
//                             <div className="flex items-center gap-2">
//                               <input
//                                 className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
//                                 value={r.opening?.amount ?? ""}
//                                 placeholder="amount"
//                                 onFocus={() => setEditStart(r.rowNo, "opening.amount", r.opening?.amount ?? null)}
//                                 onChange={(e) => updateOpeningOnly(r.rowNo, "amount", e.target.value)}
//                                 onBlur={(e) => {
//                                   e.stopPropagation();
//                                   commitOpeningAmount(r.rowNo, e.target.value === "" ? null : toNumberSafe(e.target.value));
//                                 }}
//                               />
//                               <select
//                                 className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
//                                 value={r.opening?.side ?? ""}
//                                 onFocus={() => setEditStart(r.rowNo, "opening.side", r.opening?.side ?? null)}
//                                 onChange={(e) => {
//                                   // select: commit on change
//                                   const v = e.target.value || null;
//                                   updateOpeningOnly(r.rowNo, "side", e.target.value);
//                                   commitOpeningSide(r.rowNo, v);
//                                 }}
//                               >
//                                 <option value="">-</option>
//                                 <option value="Dr">Dr</option>
//                                 <option value="Cr">Cr</option>
//                               </select>
//                             </div>
//                           ) : (
//                             formatAmountSide(r.opening)
//                           )}
//                           <CellInfoButton rowNo={r.rowNo} field="opening.amount" />
//                         </div>
//                       </td>

//                       {/* Debit */}
//                       <td className="px-3 py-2 border-b border-slate-200 text-slate-700">
//                         <div className="flex items-center">
//                           {editMode ? (
//                             <input
//                               className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
//                               value={r.transactions?.debit ?? ""}
//                               onFocus={() =>
//                                 setEditStart(r.rowNo, "transactions.debit", r.transactions?.debit ?? null)
//                               }
//                               onChange={(e) => updateTxnOnly(r.rowNo, "debit", e.target.value)}
//                               onBlur={(e) => {
//                                 e.stopPropagation();
//                                 commitDebit(r.rowNo, e.target.value === "" ? null : toNumberSafe(e.target.value));
//                               }}
//                             />
//                           ) : (
//                             r.transactions?.debit ?? ""
//                           )}
//                           <CellInfoButton rowNo={r.rowNo} field="transactions.debit" />
//                         </div>
//                       </td>

//                       {/* Credit */}
//                       <td className="px-3 py-2 border-b border-slate-200 text-slate-700">
//                         <div className="flex items-center">
//                           {editMode ? (
//                             <input
//                               className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
//                               value={r.transactions?.credit ?? ""}
//                               onFocus={() =>
//                                 setEditStart(r.rowNo, "transactions.credit", r.transactions?.credit ?? null)
//                               }
//                               onChange={(e) => updateTxnOnly(r.rowNo, "credit", e.target.value)}
//                               onBlur={(e) => {
//                                 e.stopPropagation();
//                                 commitCredit(r.rowNo, e.target.value === "" ? null : toNumberSafe(e.target.value));
//                               }}
//                             />
//                           ) : (
//                             r.transactions?.credit ?? ""
//                           )}
//                           <CellInfoButton rowNo={r.rowNo} field="transactions.credit" />
//                         </div>
//                       </td>

//                       {/* Closing */}
//                       <td className="px-3 py-2 border-b border-slate-200 text-slate-700">
//                         <div className="flex items-center">
//                           {editMode ? (
//                             <div className="flex items-center gap-2">
//                               <input
//                                 className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
//                                 value={r.closing?.amount ?? ""}
//                                 placeholder="amount"
//                                 onFocus={() => setEditStart(r.rowNo, "closing.amount", r.closing?.amount ?? null)}
//                                 onChange={(e) => updateClosingOnly(r.rowNo, "amount", e.target.value)}
//                                 onBlur={(e) => {
//                                   e.stopPropagation();
//                                   commitClosingAmount(r.rowNo, e.target.value === "" ? null : toNumberSafe(e.target.value));
//                                 }}
//                               />
//                               <select
//                                 className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
//                                 value={r.closing?.side ?? ""}
//                                 onFocus={() => setEditStart(r.rowNo, "closing.side", r.closing?.side ?? null)}
//                                 onChange={(e) => {
//                                   const v = e.target.value || null;
//                                   updateClosingOnly(r.rowNo, "side", e.target.value);
//                                   commitClosingSide(r.rowNo, v);
//                                 }}
//                               >
//                                 <option value="">-</option>
//                                 <option value="Dr">Dr</option>
//                                 <option value="Cr">Cr</option>
//                               </select>
//                             </div>
//                           ) : (
//                             formatAmountSide(r.closing)
//                           )}
//                           <CellInfoButton rowNo={r.rowNo} field="closing.amount" />
//                         </div>
//                       </td>

//                       {/* Row audit */}
//                       <td className="px-3 py-2 border-b border-slate-200 text-right">
//                         <button
//                           type="button"
//                           onClick={() => openRowAudit(r.rowNo)}
//                           className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
//                           title="View row audit"
//                         >
//                           👁
//                         </button>
//                       </td>
//                     </tr>
//                   ))}
//                 </tbody>
//               </table>
//             </div>
//           </div>
//         ) : null}
//       </section>

//       {/* Audit modal */}
//       <Modal open={auditModalOpen} title={auditModalTitle} onClose={() => setAuditModalOpen(false)}>
//         {auditModalLogs.length === 0 ? (
//           <div className="text-sm text-slate-600">No edits recorded for this selection.</div>
//         ) : (
//           <div className="overflow-auto rounded-xl border border-slate-200">
//             <table className="min-w-full text-sm">
//               <thead className="bg-slate-50">
//                 <tr className="text-left text-slate-600">
//                   <th className="px-3 py-2 border-b border-slate-200">When</th>
//                   <th className="px-3 py-2 border-b border-slate-200">User</th>
//                   <th className="px-3 py-2 border-b border-slate-200">Role</th>
//                   <th className="px-3 py-2 border-b border-slate-200">Field</th>
//                   <th className="px-3 py-2 border-b border-slate-200">Old</th>
//                   <th className="px-3 py-2 border-b border-slate-200">New</th>
//                 </tr>
//               </thead>
//               <tbody>
//                 {auditModalLogs.map((l) => (
//                   <tr key={l.id} className="odd:bg-white even:bg-slate-50 text-black">
//                     <td className="px-3 py-2 border-b border-slate-200">{formatDateTime(l.editedAt)}</td>
//                     <td className="px-3 py-2 border-b border-slate-200">{l.editedBy?.username || "Unknown"}</td>
//                     <td className="px-3 py-2 border-b border-slate-200">{l.editedBy?.role || "-"}</td>
//                     <td className="px-3 py-2 border-b border-slate-200">{l.field}</td>
//                     <td className="px-3 py-2 border-b border-slate-200 text-slate-600">{String(l.oldValue ?? "")}</td>
//                     <td className="px-3 py-2 border-b border-slate-200 font-medium text-slate-900">
//                       {String(l.newValue ?? "")}
//                     </td>
//                   </tr>
//                 ))}
//               </tbody>
//             </table>
//           </div>
//         )}


//       </Modal>
//     </main>
//   );
// }































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

      if (seen.has(txt)) continue; // prevent merge repeats
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

    // sometimes other keywords appear in next rows
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

  const searchRows = [headerRow, headerRow + 1, headerRow + 2].filter(
    (x) => x <= scanRows
  );

  for (const r of searchRows) {
    const row = ws.getRow(r);
    for (let c = 1; c <= scanCols; c++) {
      const txt = cellText(row.getCell(c)).toLowerCase().trim();
      if (!txt) continue;

      if (particularsCol == null && txt.includes("particular"))
        particularsCol = c;
      if (openingCol == null && txt.includes("opening")) openingCol = c;
      if (debitCol == null && txt === "debit") debitCol = c;
      if (creditCol == null && txt === "credit") creditCol = c;
      if (closingCol == null && txt.includes("closing")) closingCol = c;
    }
  }

  // fallback if found as "Transactions Debit"
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
    const txt = cellText(ws.getRow(r).getCell(particularsCol))
      .toLowerCase()
      .trim();
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
      [openingRaw, txDebitRaw, txCreditRaw, closingRaw].every(
        (x) => String(x).trim() === ""
      );

    if (isRowEmpty) continue;
    if (!ledgerName) continue;

    const indentFromStyle = Number.isFinite(nameCell?.alignment?.indent)
      ? nameCell.alignment.indent
      : null;

    const leadingSpaces = countLeadingWhitespace(nameStrRaw);

    const level =
      indentFromStyle != null
        ? indentFromStyle
        : Math.floor(leadingSpaces / SPACES_PER_LEVEL);

    flatRows.push({
      rowNo: r,
      ledgerName,
      level,
      opening: parseAmountSide(openingRaw),
      transactions: {
        debit: toNumberSafe(txDebitRaw),
        credit: toNumberSafe(txCreditRaw),
      },
      closing: parseAmountSide(closingRaw),

      // ✅ audit per-field history lives INSIDE row (no separate audit JSON)
      audit: {}, // { "transactions.debit": [ {id, field, oldValue, newValue, editedBy, editedAt}, ... ], ... }
    });
  }

  return {
    sheetName,
    meta: {
      headerLines,
      headerRow,
      dataStartIdx,
      columns: {
        particularsCol,
        openingCol,
        debitCol,
        creditCol,
        closingCol,
      },
    },
    rowsFlat: flatRows,
  };
}

/* -------------------- TB document store (localStorage) -------------------- */
/**
 * We store ONE JSON document per (fileId + sheetName)
 * It contains rowsFlat + audit arrays INSIDE each row.
 */

function safeJsonParse(s, fallback) {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

function tbDocKeyFor(fileId, sheetName) {
  return `tb_doc_v1::${fileId || "nofile"}::${sheetName || "nosheet"}`;
}

function readTbDoc(docKey) {
  if (typeof window === "undefined") return null;
  return safeJsonParse(localStorage.getItem(docKey) || "null", null);
}

function writeTbDoc(docKey, doc) {
  if (typeof window === "undefined") return;
  localStorage.setItem(docKey, JSON.stringify(doc));
}

/* -------------------- download TB JSON (includes audits inside rows) -------------------- */

function downloadTbJson(doc) {
  if (!doc) return;
  const payload = {
    ...doc,
    downloadedAt: new Date().toISOString(),
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `trialbalance_${doc.sheetName || "sheet"}_with_audit.json`;
  a.click();
  URL.revokeObjectURL(url);
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
            <div className="text-sm font-semibold text-slate-900">{title}</div>
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

  const [fileId, setFileId] = useState("");
  const [fileName, setFileName] = useState("");

  const [sheetNames, setSheetNames] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState("");

  const [meta, setMeta] = useState(null);
  const [flatRows, setFlatRows] = useState([]);
  const [uploadErr, setUploadErr] = useState("");

  const [editMode, setEditMode] = useState(false);

  // TB doc (the JSON you want; includes audit arrays inside rows)
  const [tbDoc, setTbDoc] = useState(null);

  // modal state
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [auditModalTitle, setAuditModalTitle] = useState("");
  const [auditModalLogs, setAuditModalLogs] = useState([]);

  // ✅ avoids duplicates:
  // - log only on COMMIT (blur/select change)
  // - dedupe identical commit fired twice quickly
  const editStartRef = useRef(new Map()); // key => startValue
  const lastAuditSigRef = useRef({ sig: "", ts: 0 });

  // refs to avoid functional-updater side effects
  const flatRowsRef = useRef([]);
  const tbDocRef = useRef(null);

  useEffect(() => {
    flatRowsRef.current = flatRows || [];
  }, [flatRows]);

  useEffect(() => {
    tbDocRef.current = tbDoc;
  }, [tbDoc]);

  useEffect(() => {
    const u = getSession();
    if (!u) return router.replace("/auth/login");
    setUser(u);
  }, [router]);

  // nested preview
  const treeRows = useMemo(() => buildTreeFromLevels(flatRows), [flatRows]);
  const previewRows = useMemo(() => flattenTreeRows(treeRows).slice(0, 300), [treeRows]);

  const canEdit = useMemo(() => {
    const role = user?.role;
    return ["A", "B", "C", "D", "DOC_SPECIALIST"].includes(role);
  }, [user]);

  // total audit count (for header display)
  const auditCount = useMemo(() => {
    let total = 0;
    for (const r of flatRows || []) {
      const audit = r?.audit || {};
      for (const k of Object.keys(audit)) total += (audit[k]?.length || 0);
    }
    return total;
  }, [flatRows]);

  function setEditStart(rowNo, field, startValue) {
    editStartRef.current.set(`${rowNo}::${field}`, startValue ?? null);
  }
  function getEditStart(rowNo, field) {
    return editStartRef.current.get(`${rowNo}::${field}`);
  }
  function clearEditStart(rowNo, field) {
    editStartRef.current.delete(`${rowNo}::${field}`);
  }

  function makeRowAuditList(row) {
    const out = [];
    const audit = row?.audit || {};
    for (const field of Object.keys(audit)) {
      for (const e of audit[field] || []) out.push(e);
    }
    out.sort((a, b) => new Date(b.editedAt) - new Date(a.editedAt));
    return out;
  }

  function getLatestEditForCell(row, field) {
    const arr = row?.audit?.[field] || [];
    if (!arr.length) return null;
    // last is latest (append-only)
    return arr[arr.length - 1];
  }

  function openRowAudit(rowNo) {
    const row = flatRowsRef.current.find((x) => x.rowNo === rowNo);
    const logs = makeRowAuditList(row);
    setAuditModalTitle(`Row Audit • Sheet "${selectedSheet}" • rowNo ${rowNo}`);
    setAuditModalLogs(logs);
    setAuditModalOpen(true);
  }

  function openCellAudit(rowNo, field) {
    const row = flatRowsRef.current.find((x) => x.rowNo === rowNo);
    const logs = [...(row?.audit?.[field] || [])].sort(
      (a, b) => new Date(b.editedAt) - new Date(a.editedAt)
    );
    setAuditModalTitle(`Cell Audit • ${field} • rowNo ${rowNo}`);
    setAuditModalLogs(logs);
    setAuditModalOpen(true);
  }

  function buildAuditEntry({ field, oldValue, newValue }) {
    return {
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      fileId,
      fileName,
      sheetName: selectedSheet,
      rowNo: null, // filled later
      field,
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

  function persistDoc(nextDoc) {
    if (!nextDoc?.fileId || !nextDoc?.sheetName) return;
    const key = tbDocKeyFor(nextDoc.fileId, nextDoc.sheetName);
    writeTbDoc(key, nextDoc);
  }

  /**
   * ✅ This is the ONLY place where we append audit history into the SAME row JSON.
   * It updates:
   * - row current value
   * - row.audit[field] array (multiple edits by multiple users)
   * - tbDoc in state
   * - tbDoc in localStorage (same structure)
   */
  function commitChange({ rowNo, field, oldValue, newValue, patchRow }) {
    const oldS = JSON.stringify(oldValue ?? null);
    const newS = JSON.stringify(newValue ?? null);
    if (oldS === newS) return;

    const sig = `${fileId}::${selectedSheet}::${rowNo}::${field}::${oldS}=>${newS}`;
    const now = Date.now();
    if (lastAuditSigRef.current.sig === sig && now - lastAuditSigRef.current.ts < 600) return;
    lastAuditSigRef.current = { sig, ts: now };

    const entry = buildAuditEntry({ field, oldValue, newValue });
    entry.rowNo = rowNo;

    const currentRows = flatRowsRef.current || [];
    const nextRows = currentRows.map((r) => {
      if (r.rowNo !== rowNo) return r;

      const updated = patchRow ? patchRow(r) : r;

      const nextAudit = { ...(updated.audit || {}) };
      const arr = [...(nextAudit[field] || [])];
      arr.push(entry);
      nextAudit[field] = arr;

      return { ...updated, audit: nextAudit };
    });

    setFlatRows(nextRows);

    const doc = tbDocRef.current;
    const nextDoc = {
      ...(doc || {}),
      type: "TRIAL_BALANCE_DOC",
      fileId,
      fileName,
      sheetName: selectedSheet,
      meta,
      rowsFlat: nextRows,
      updatedAt: new Date().toISOString(),
    };
    setTbDoc(nextDoc);
    persistDoc(nextDoc);
  }

  // --- pure state updates for typing (no logging here) ---
  function updateRowOnly(rowNo, patch) {
    setFlatRows((prev) => {
      const idx = prev.findIndex((x) => x.rowNo === rowNo);
      if (idx === -1) return prev;
      const updated = [...prev];
      updated[idx] = { ...updated[idx], ...patch };
      return updated;
    });
  }

  function updateOpeningOnly(rowNo, field, value) {
    setFlatRows((prev) => {
      const idx = prev.findIndex((x) => x.rowNo === rowNo);
      if (idx === -1) return prev;
      const updated = [...prev];
      const row = updated[idx];
      const next = { ...row, opening: { ...(row.opening || { amount: null, side: null }) } };

      if (field === "amount") next.opening.amount = value === "" ? null : toNumberSafe(value);
      if (field === "side") next.opening.side = value || null;

      updated[idx] = next;
      return updated;
    });
  }

  function updateClosingOnly(rowNo, field, value) {
    setFlatRows((prev) => {
      const idx = prev.findIndex((x) => x.rowNo === rowNo);
      if (idx === -1) return prev;
      const updated = [...prev];
      const row = updated[idx];
      const next = { ...row, closing: { ...(row.closing || { amount: null, side: null }) } };

      if (field === "amount") next.closing.amount = value === "" ? null : toNumberSafe(value);
      if (field === "side") next.closing.side = value || null;

      updated[idx] = next;
      return updated;
    });
  }

  function updateTxnOnly(rowNo, field, value) {
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

  // --- commit handlers (append audit into SAME row JSON) ---
  function commitLedgerName(rowNo, finalValue) {
    const start = getEditStart(rowNo, "ledgerName");
    clearEditStart(rowNo, "ledgerName");

    commitChange({
      rowNo,
      field: "ledgerName",
      oldValue: start ?? null,
      newValue: finalValue ?? null,
      patchRow: (r) => ({ ...r, ledgerName: finalValue ?? "" }),
    });
  }

  function commitOpeningAmount(rowNo, finalAmt) {
    const start = getEditStart(rowNo, "opening.amount");
    clearEditStart(rowNo, "opening.amount");

    commitChange({
      rowNo,
      field: "opening.amount",
      oldValue: start ?? null,
      newValue: finalAmt ?? null,
      patchRow: (r) => ({
        ...r,
        opening: { ...(r.opening || { amount: null, side: null }), amount: finalAmt ?? null },
      }),
    });
  }

  function commitOpeningSide(rowNo, finalSide) {
    const start = getEditStart(rowNo, "opening.side");
    clearEditStart(rowNo, "opening.side");

    commitChange({
      rowNo,
      field: "opening.side",
      oldValue: start ?? null,
      newValue: finalSide ?? null,
      patchRow: (r) => ({
        ...r,
        opening: { ...(r.opening || { amount: null, side: null }), side: finalSide ?? null },
      }),
    });
  }

  function commitDebit(rowNo, finalDebit) {
    const start = getEditStart(rowNo, "transactions.debit");
    clearEditStart(rowNo, "transactions.debit");

    commitChange({
      rowNo,
      field: "transactions.debit",
      oldValue: start ?? null,
      newValue: finalDebit ?? null,
      patchRow: (r) => ({
        ...r,
        transactions: { ...(r.transactions || { debit: null, credit: null }), debit: finalDebit ?? null },
      }),
    });
  }

  function commitCredit(rowNo, finalCredit) {
    const start = getEditStart(rowNo, "transactions.credit");
    clearEditStart(rowNo, "transactions.credit");

    commitChange({
      rowNo,
      field: "transactions.credit",
      oldValue: start ?? null,
      newValue: finalCredit ?? null,
      patchRow: (r) => ({
        ...r,
        transactions: { ...(r.transactions || { debit: null, credit: null }), credit: finalCredit ?? null },
      }),
    });
  }

  function commitClosingAmount(rowNo, finalAmt) {
    const start = getEditStart(rowNo, "closing.amount");
    clearEditStart(rowNo, "closing.amount");

    commitChange({
      rowNo,
      field: "closing.amount",
      oldValue: start ?? null,
      newValue: finalAmt ?? null,
      patchRow: (r) => ({
        ...r,
        closing: { ...(r.closing || { amount: null, side: null }), amount: finalAmt ?? null },
      }),
    });
  }

  function commitClosingSide(rowNo, finalSide) {
    const start = getEditStart(rowNo, "closing.side");
    clearEditStart(rowNo, "closing.side");

    commitChange({
      rowNo,
      field: "closing.side",
      oldValue: start ?? null,
      newValue: finalSide ?? null,
      patchRow: (r) => ({
        ...r,
        closing: { ...(r.closing || { amount: null, side: null }), side: finalSide ?? null },
      }),
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
    setEditMode(false);
    setTbDoc(null);

    const newFileId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    setFileId(newFileId);
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
        const parsed = parseTrialBalanceWorksheetExcelJS(ws, first);

        setMeta(parsed.meta);
        setFlatRows(parsed.rowsFlat);
        originalFlatRowsRef.current = parsed.rowsFlat.map((x) => JSON.parse(JSON.stringify(x)));

        const doc = {
          type: "TRIAL_BALANCE_DOC",
          fileId: newFileId,
          fileName: file.name,
          sheetName: first,
          meta: parsed.meta,
          rowsFlat: parsed.rowsFlat,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        setTbDoc(doc);
        persistDoc(doc);
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
    setTbDoc(null);

    try {
      // If we already have stored doc for this sheet, load it (so history stays)
      const key = tbDocKeyFor(fileId, sheet);
      const stored = readTbDoc(key);

      if (stored?.rowsFlat?.length) {
        setSelectedSheet(sheet);
        setMeta(stored.meta || null);
        setFlatRows(stored.rowsFlat || []);
        originalFlatRowsRef.current = (stored.rowsFlat || []).map((x) => JSON.parse(JSON.stringify(x)));
        setTbDoc(stored);
        return;
      }

      // else parse fresh and create doc
      const ws = wb.getWorksheet(sheet);
      const parsed = parseTrialBalanceWorksheetExcelJS(ws, sheet);

      setMeta(parsed.meta);
      setFlatRows(parsed.rowsFlat);
      originalFlatRowsRef.current = parsed.rowsFlat.map((x) => JSON.parse(JSON.stringify(x)));

      const doc = {
        type: "TRIAL_BALANCE_DOC",
        fileId,
        fileName,
        sheetName: sheet,
        meta: parsed.meta,
        rowsFlat: parsed.rowsFlat,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setTbDoc(doc);
      persistDoc(doc);
    } catch (err) {
      setUploadErr(err?.message || "Failed to parse selected sheet");
    }
  }

  function resetEdits() {
    // reset values and also reset audit history (optional: if you want keep history, remove audit reset)
    const base = originalFlatRowsRef.current.map((x) => JSON.parse(JSON.stringify(x)));
    // keep audit? -> if you want to keep history even on reset, comment next 3 lines
    for (const r of base) r.audit = {};

    setFlatRows(base);
    setEditMode(false);

    const doc = {
      type: "TRIAL_BALANCE_DOC",
      fileId,
      fileName,
      sheetName: selectedSheet,
      meta,
      rowsFlat: base,
      createdAt: tbDocRef.current?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setTbDoc(doc);
    persistDoc(doc);
  }

  async function downloadExcelFromTable() {
    await downloadAsExcelFromFlatRows({
      headerLines: meta?.headerLines || [],
      flatRows,
      selectedSheet,
    });
  }

  function CellInfoButton({ rowNo, field }) {
    const row = flatRowsRef.current.find((x) => x.rowNo === rowNo);
    const latest = getLatestEditForCell(row, field);
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
                  File: <span className="font-medium text-slate-700">{fileName}</span> • Parsed{" "}
                  <span className="font-medium text-slate-700">{flatRows.length}</span> rows • Total edits:{" "}
                  <span className="font-medium text-slate-700">{auditCount}</span>
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

                  <button
                    type="button"
                    onClick={() => downloadTbJson(tbDocRef.current)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700
                               hover:bg-slate-50 active:bg-slate-100"
                    title="This JSON includes edit history inside each row.audit[field] array"
                  >
                    Download TB JSON (with history)
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
                              onFocus={() => setEditStart(r.rowNo, "ledgerName", r.ledgerName ?? null)}
                              onChange={(e) => updateRowOnly(r.rowNo, { ledgerName: e.target.value })}
                              onBlur={(e) => {
                                e.stopPropagation();
                                commitLedgerName(r.rowNo, e.target.value);
                              }}
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
                                placeholder="amount"
                                onFocus={() =>
                                  setEditStart(r.rowNo, "opening.amount", r.opening?.amount ?? null)
                                }
                                onChange={(e) =>
                                  updateOpeningOnly(r.rowNo, "amount", e.target.value)
                                }
                                onBlur={(e) => {
                                  e.stopPropagation();
                                  const v = e.target.value === "" ? null : toNumberSafe(e.target.value);
                                  commitOpeningAmount(r.rowNo, v);
                                }}
                              />
                              <select
                                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
                                value={r.opening?.side ?? ""}
                                onFocus={() =>
                                  setEditStart(r.rowNo, "opening.side", r.opening?.side ?? null)
                                }
                                onChange={(e) => {
                                  const v = e.target.value || null;
                                  updateOpeningOnly(r.rowNo, "side", e.target.value);
                                  commitOpeningSide(r.rowNo, v);
                                }}
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
                              onFocus={() =>
                                setEditStart(
                                  r.rowNo,
                                  "transactions.debit",
                                  r.transactions?.debit ?? null
                                )
                              }
                              onChange={(e) => updateTxnOnly(r.rowNo, "debit", e.target.value)}
                              onBlur={(e) => {
                                e.stopPropagation();
                                const v = e.target.value === "" ? null : toNumberSafe(e.target.value);
                                commitDebit(r.rowNo, v);
                              }}
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
                              onFocus={() =>
                                setEditStart(
                                  r.rowNo,
                                  "transactions.credit",
                                  r.transactions?.credit ?? null
                                )
                              }
                              onChange={(e) =>
                                updateTxnOnly(r.rowNo, "credit", e.target.value)
                              }
                              onBlur={(e) => {
                                e.stopPropagation();
                                const v = e.target.value === "" ? null : toNumberSafe(e.target.value);
                                commitCredit(r.rowNo, v);
                              }}
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
                                placeholder="amount"
                                onFocus={() =>
                                  setEditStart(r.rowNo, "closing.amount", r.closing?.amount ?? null)
                                }
                                onChange={(e) =>
                                  updateClosingOnly(r.rowNo, "amount", e.target.value)
                                }
                                onBlur={(e) => {
                                  e.stopPropagation();
                                  const v = e.target.value === "" ? null : toNumberSafe(e.target.value);
                                  commitClosingAmount(r.rowNo, v);
                                }}
                              />
                              <select
                                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
                                value={r.closing?.side ?? ""}
                                onFocus={() =>
                                  setEditStart(r.rowNo, "closing.side", r.closing?.side ?? null)
                                }
                                onChange={(e) => {
                                  const v = e.target.value || null;
                                  updateClosingOnly(r.rowNo, "side", e.target.value);
                                  commitClosingSide(r.rowNo, v);
                                }}
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

            <div className="mt-3 text-xs text-slate-500">
              Edit history is stored inside each row as{" "}
              <span className="font-medium">row.audit["field.path"] = [ ... ]</span>.
              Latest value is always shown in the table.
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
                    <td className="px-3 py-2 border-b border-slate-200">
                      {formatDateTime(l.editedAt)}
                    </td>
                    <td className="px-3 py-2 border-b border-slate-200">
                      {l.editedBy?.username || "Unknown"}
                    </td>
                    <td className="px-3 py-2 border-b border-slate-200">
                      {l.editedBy?.role || "-"}
                    </td>
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

      </Modal>
    </main>
  );
}

















// // ca-finance-workflow-main/src/app/roles/doc-specialist/page.js
// "use client";

// import { useEffect, useMemo, useRef, useState } from "react";
// import { useRouter } from "next/navigation";
// import ExcelJS from "exceljs/dist/exceljs.min.js";

// import { clearSession, getSession } from "@/app/lib/authClient";

// /* -------------------- helpers -------------------- */

// function toNumberSafe(val) {
//   const s = String(val ?? "").replace(/,/g, "").trim();
//   if (!s) return null;
//   const n = Number(s);
//   return Number.isFinite(n) ? n : null;
// }

// function stripIndent(name) {
//   return String(name ?? "").replace(/^[\s\u00A0]+/, "").trim();
// }

// function countLeadingWhitespace(name) {
//   const s = String(name ?? "");
//   const m = s.match(/^[\s\u00A0]+/);
//   return m ? m[0].length : 0;
// }

// function parseAmountSide(input) {
//   if (input == null) return { amount: null, side: null };

//   const s = String(input).trim();
//   if (!s) return { amount: null, side: null };

//   const cleaned = s.replace(/,/g, "");
//   const m = cleaned.match(/^(-?\d+(?:\.\d+)?)\s*(Dr|Cr)?$/i);

//   if (!m) {
//     const n = toNumberSafe(cleaned);
//     return { amount: n, side: null };
//   }

//   const amount = toNumberSafe(m[1]);
//   const side = m[2] ? (m[2].toUpperCase() === "DR" ? "Dr" : "Cr") : null;
//   return { amount, side };
// }

// function formatAmountSideObj({ amount, side }) {
//   if (amount == null) return "";
//   return side ? `${amount} ${side}` : String(amount);
// }

// function buildTreeFromLevels(flatRows) {
//   const roots = [];
//   const stack = [];

//   for (const row of flatRows) {
//     const lvl = Math.max(0, Number(row.level) || 0);
//     const node = { ...row, children: [] };

//     stack[lvl] = node;
//     stack.length = lvl + 1;

//     if (lvl === 0) roots.push(node);
//     else {
//       const parent = stack[lvl - 1];
//       if (parent) parent.children.push(node);
//       else roots.push(node);
//     }
//   }

//   const cleanup = (arr) =>
//     arr.map((n) => {
//       if (!n.children?.length) delete n.children;
//       else n.children = cleanup(n.children);
//       return n;
//     });

//   return cleanup(roots);
// }

// function flattenTreeRows(treeRows) {
//   const out = [];
//   const walk = (nodes) => {
//     for (const n of nodes || []) {
//       out.push(n);
//       if (n.children?.length) walk(n.children);
//     }
//   };
//   walk(treeRows || []);
//   return out;
// }

// /** Null-safe cell -> string */
// function cellText(cell) {
//   try {
//     if (!cell) return "";

//     const t = cell.text;
//     if (t !== null && t !== undefined) {
//       const ts = String(t);
//       if (ts.trim() !== "") return ts;
//     }

//     const v = cell.value;
//     if (v === null || v === undefined) return "";

//     if (typeof v === "object") {
//       if (v.richText) return v.richText.map((x) => String(x?.text ?? "")).join("");
//       if (v.text != null) return String(v.text);
//       if (v.result != null) return String(v.result);
//       if (v.formula != null) return String(v.formula);
//     }

//     return String(v);
//   } catch {
//     return "";
//   }
// }

// /** Capture title/date lines above table WITHOUT repeating merged texts. */
// function extractHeaderLines(ws, headerRow) {
//   const lines = [];
//   const maxCols = Math.min(ws.columnCount || 0, 30);

//   for (let r = 1; r < headerRow; r++) {
//     const row = ws.getRow(r);
//     const parts = [];
//     const seen = new Set();

//     for (let c = 1; c <= maxCols; c++) {
//       const raw = cellText(row.getCell(c));
//       const txt = raw.replace(/\s+/g, " ").trim();
//       if (!txt) continue;

//       if (seen.has(txt)) continue;
//       seen.add(txt);
//       parts.push(txt);
//     }

//     const line = parts.join(" ").trim();
//     if (line) lines.push(line);
//   }

//   const uniq = [];
//   const lineSeen = new Set();
//   for (const l of lines) {
//     if (lineSeen.has(l)) continue;
//     lineSeen.add(l);
//     uniq.push(l);
//   }

//   return uniq;
// }

// /** Detect columns dynamically */
// function detectTbColumns(ws) {
//   const scanRows = Math.min(ws.rowCount || 0, 40);
//   const scanCols = Math.min(ws.columnCount || 0, 40);

//   let headerRow = -1;

//   for (let r = 1; r <= scanRows; r++) {
//     let hasPart = false;
//     let hasOther = false;

//     const row = ws.getRow(r);
//     for (let c = 1; c <= scanCols; c++) {
//       const txt = cellText(row.getCell(c)).toLowerCase().trim();
//       if (!txt) continue;

//       if (txt.includes("particular")) hasPart = true;
//       if (
//         txt.includes("opening") ||
//         txt.includes("closing") ||
//         txt.includes("debit") ||
//         txt.includes("credit") ||
//         txt.includes("transaction")
//       ) {
//         hasOther = true;
//       }
//     }

//     if (hasPart && !hasOther) {
//       for (let rr = r; rr <= Math.min(r + 2, scanRows); rr++) {
//         const rrow = ws.getRow(rr);
//         for (let c = 1; c <= scanCols; c++) {
//           const txt = cellText(rrow.getCell(c)).toLowerCase().trim();
//           if (
//             txt.includes("opening") ||
//             txt.includes("closing") ||
//             txt.includes("debit") ||
//             txt.includes("credit") ||
//             txt.includes("transaction")
//           ) {
//             hasOther = true;
//             break;
//           }
//         }
//         if (hasOther) break;
//       }
//     }

//     if (hasPart && hasOther) {
//       headerRow = r;
//       break;
//     }
//   }

//   if (headerRow === -1) {
//     return { headerRow: 1, particularsCol: 1, openingCol: 2, debitCol: 3, creditCol: 4, closingCol: 5 };
//   }

//   let particularsCol = null;
//   let openingCol = null;
//   let debitCol = null;
//   let creditCol = null;
//   let closingCol = null;

//   const searchRows = [headerRow, headerRow + 1, headerRow + 2].filter((x) => x <= scanRows);

//   for (const r of searchRows) {
//     const row = ws.getRow(r);
//     for (let c = 1; c <= scanCols; c++) {
//       const txt = cellText(row.getCell(c)).toLowerCase().trim();
//       if (!txt) continue;

//       if (particularsCol == null && txt.includes("particular")) particularsCol = c;
//       if (openingCol == null && txt.includes("opening")) openingCol = c;
//       if (debitCol == null && txt === "debit") debitCol = c;
//       if (creditCol == null && txt === "credit") creditCol = c;
//       if (closingCol == null && txt.includes("closing")) closingCol = c;
//     }
//   }

//   if (debitCol == null || creditCol == null) {
//     for (const r of searchRows) {
//       const row = ws.getRow(r);
//       for (let c = 1; c <= scanCols; c++) {
//         const txt = cellText(row.getCell(c)).toLowerCase().trim();
//         if (!txt) continue;

//         if (debitCol == null && txt.includes("debit")) debitCol = c;
//         if (creditCol == null && txt.includes("credit")) creditCol = c;
//       }
//     }
//   }

//   particularsCol = particularsCol ?? 1;
//   openingCol = openingCol ?? particularsCol + 1;
//   debitCol = debitCol ?? openingCol + 1;
//   creditCol = creditCol ?? debitCol + 1;
//   closingCol = closingCol ?? creditCol + 1;

//   return { headerRow, particularsCol, openingCol, debitCol, creditCol, closingCol };
// }

// /** Decide where data starts (skip headers) */
// function detectDataStartRow(ws, headerRow, particularsCol) {
//   const scanLimit = Math.min(ws.rowCount || 0, headerRow + 25);

//   for (let r = headerRow; r <= scanLimit; r++) {
//     const txt = cellText(ws.getRow(r).getCell(particularsCol)).toLowerCase().trim();
//     if (!txt) continue;

//     if (
//       txt.includes("trial balance") ||
//       txt.includes("particular") ||
//       txt.includes("opening") ||
//       txt.includes("closing") ||
//       txt.includes("transaction") ||
//       txt === "debit" ||
//       txt === "credit"
//     ) {
//       continue;
//     }

//     return r;
//   }

//   return headerRow + 1;
// }

// /* -------------------- value+audit helpers -------------------- */

// function wrapValue(value) {
//   return { value: value ?? null, audit: [] };
// }

// function makeAuditItem({ oldValue, newValue, user }) {
//   return {
//     old: oldValue ?? null,
//     new: newValue ?? null,
//     at: new Date().toISOString(),
//     by: {
//       id: user?.id ?? user?.userId ?? null,
//       name: user?.username ?? "Unknown",
//       role: user?.role ?? null,
//     },
//   };
// }

// function latestAudit(cellObj) {
//   const arr = cellObj?.audit || [];
//   return arr.length ? arr[arr.length - 1] : null;
// }

// /* -------------------- parse worksheet -> meta + rowsFlat (BOSS STRUCTURE) -------------------- */

// function parseTrialBalanceWorksheetExcelJS(ws, sheetName) {
//   const { headerRow, particularsCol, openingCol, debitCol, creditCol, closingCol } = detectTbColumns(ws);

//   const headerLines = extractHeaderLines(ws, headerRow);
//   const dataStartIdx = detectDataStartRow(ws, headerRow, particularsCol);

//   const flatRows = [];
//   const SPACES_PER_LEVEL = 2;

//   for (let r = dataStartIdx; r <= (ws.rowCount || 0); r++) {
//     const row = ws.getRow(r);

//     const nameCell = row.getCell(particularsCol);
//     const nameStrRaw = cellText(nameCell);
//     const ledgerName = stripIndent(nameStrRaw);

//     const openingRaw = cellText(row.getCell(openingCol));
//     const txDebitRaw = cellText(row.getCell(debitCol));
//     const txCreditRaw = cellText(row.getCell(creditCol));
//     const closingRaw = cellText(row.getCell(closingCol));

//     const isRowEmpty =
//       ledgerName === "" && [openingRaw, txDebitRaw, txCreditRaw, closingRaw].every((x) => String(x).trim() === "");

//     if (isRowEmpty) continue;
//     if (!ledgerName) continue;

//     const indentFromStyle = Number.isFinite(nameCell?.alignment?.indent) ? nameCell.alignment.indent : null;
//     const leadingSpaces = countLeadingWhitespace(nameStrRaw);
//     const level = indentFromStyle != null ? indentFromStyle : Math.floor(leadingSpaces / SPACES_PER_LEVEL);

//     const o = parseAmountSide(openingRaw);
//     const c = parseAmountSide(closingRaw);

//     flatRows.push({
//       rowNo: r,
//       level,

//       ledgerName: wrapValue(ledgerName),

//       opening: {
//         amount: wrapValue(o.amount),
//         side: wrapValue(o.side),
//       },

//       transactions: {
//         debit: wrapValue(toNumberSafe(txDebitRaw)),
//         credit: wrapValue(toNumberSafe(txCreditRaw)),
//       },

//       closing: {
//         amount: wrapValue(c.amount),
//         side: wrapValue(c.side),
//       },
//     });
//   }

//   return {
//     sheetName,
//     meta: {
//       headerLines,
//       headerRow,
//       dataStartIdx,
//       columns: { particularsCol, openingCol, debitCol, creditCol, closingCol },
//     },
//     rowsFlat: flatRows,
//   };
// }

// /* -------------------- TB doc store (localStorage) -------------------- */

// function safeJsonParse(s, fallback) {
//   try {
//     return JSON.parse(s);
//   } catch {
//     return fallback;
//   }
// }

// function tbDocKeyFor(fileId, sheetName) {
//   return `tb_doc_boss_v1::${fileId || "nofile"}::${sheetName || "nosheet"}`;
// }

// function readTbDoc(docKey) {
//   if (typeof window === "undefined") return null;
//   return safeJsonParse(localStorage.getItem(docKey) || "null", null);
// }

// function writeTbDoc(docKey, doc) {
//   if (typeof window === "undefined") return;
//   localStorage.setItem(docKey, JSON.stringify(doc));
// }

// /* -------------------- download TB JSON -------------------- */

// function downloadTbJson(doc) {
//   if (!doc) return;
//   const payload = { ...doc, downloadedAt: new Date().toISOString() };
//   const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
//   const url = URL.createObjectURL(blob);
//   const a = document.createElement("a");
//   a.href = url;
//   a.download = `trialbalance_${doc.sheetName || "sheet"}_with_audit.json`;
//   a.click();
//   URL.revokeObjectURL(url);
// }

// /* -------------------- download excel FROM EDITED TABLE -------------------- */

// async function downloadAsExcelFromFlatRows({ headerLines, flatRows, selectedSheet }) {
//   const wb = new ExcelJS.Workbook();
//   const ws = wb.addWorksheet("Trial Balance");

//   const totalCols = 5;
//   let currentRow = 1;

//   for (let i = 0; i < (headerLines?.length || 0); i++) {
//     ws.getRow(currentRow).getCell(1).value = headerLines[i];
//     ws.mergeCells(currentRow, 1, currentRow, totalCols);
//     ws.getRow(currentRow).font = i === 0 ? { bold: true, size: 14 } : { bold: true };
//     currentRow += 1;
//   }

//   currentRow += 1;

//   const headerTop = currentRow;
//   const headerBottom = currentRow + 1;

//   ws.getRow(headerTop).getCell(1).value = "Particulars";
//   ws.getRow(headerTop).getCell(2).value = "Opening Balance";
//   ws.getRow(headerTop).getCell(3).value = "Transactions";
//   ws.getRow(headerTop).getCell(5).value = "Closing Balance";

//   ws.getRow(headerBottom).getCell(3).value = "Debit";
//   ws.getRow(headerBottom).getCell(4).value = "Credit";

//   ws.mergeCells(headerTop, 1, headerBottom, 1);
//   ws.mergeCells(headerTop, 2, headerBottom, 2);
//   ws.mergeCells(headerTop, 5, headerBottom, 5);
//   ws.mergeCells(headerTop, 3, headerTop, 4);

//   for (let r = headerTop; r <= headerBottom; r++) {
//     const row = ws.getRow(r);
//     row.font = { bold: true };
//     row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
//     row.eachCell({ includeEmpty: true }, (cell) => {
//       cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
//     });
//   }

//   currentRow = headerBottom + 1;

//   for (const r of flatRows || []) {
//     const excelRow = ws.getRow(currentRow);

//     excelRow.getCell(1).value = r.ledgerName?.value ?? "";
//     excelRow.getCell(2).value = formatAmountSideObj({
//       amount: r.opening?.amount?.value ?? null,
//       side: r.opening?.side?.value ?? null,
//     });
//     excelRow.getCell(3).value = r.transactions?.debit?.value ?? "";
//     excelRow.getCell(4).value = r.transactions?.credit?.value ?? "";
//     excelRow.getCell(5).value = formatAmountSideObj({
//       amount: r.closing?.amount?.value ?? null,
//       side: r.closing?.side?.value ?? null,
//     });

//     excelRow.getCell(1).alignment = { indent: r.level || 0, vertical: "middle" };

//     excelRow.eachCell({ includeEmpty: true }, (cell) => {
//       cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
//       if (!cell.alignment) cell.alignment = {};
//       cell.alignment.vertical = "middle";
//     });

//     currentRow += 1;
//   }

//   ws.getColumn(1).width = 45;
//   ws.getColumn(2).width = 18;
//   ws.getColumn(3).width = 16;
//   ws.getColumn(4).width = 16;
//   ws.getColumn(5).width = 18;

//   const buffer = await wb.xlsx.writeBuffer();
//   const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

//   const url = URL.createObjectURL(blob);
//   const a = document.createElement("a");
//   a.href = url;
//   a.download = `trialbalance_${selectedSheet || "sheet"}.xlsx`;
//   a.click();
//   URL.revokeObjectURL(url);
// }

// /* -------------------- modal ui -------------------- */

// function Modal({ open, title, onClose, children }) {
//   if (!open) return null;
//   return (
//     <div className="fixed inset-0 z-[100]">
//       <div className="absolute inset-0 bg-black/40" onClick={onClose} />
//       <div className="absolute inset-0 flex items-center justify-center p-4">
//         <div className="w-full max-w-3xl rounded-2xl bg-white shadow-xl border border-slate-200">
//           <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
//             <div className="text-sm font-semibold text-slate-900">{title}</div>
//             <button
//               onClick={onClose}
//               className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
//             >
//               Close
//             </button>
//           </div>
//           <div className="p-5">{children}</div>
//         </div>
//       </div>
//     </div>
//   );
// }

// function formatDateTime(iso) {
//   try {
//     return new Date(iso).toLocaleString();
//   } catch {
//     return iso;
//   }
// }

// /* -------------------- component -------------------- */

// export default function DocSpecialistHome() {
//   const router = useRouter();
//   const [user, setUser] = useState(null);

//   const workbookRef = useRef(null);
//   const originalFlatRowsRef = useRef([]);

//   const [fileId, setFileId] = useState("");
//   const [fileName, setFileName] = useState("");

//   const [sheetNames, setSheetNames] = useState([]);
//   const [selectedSheet, setSelectedSheet] = useState("");

//   const [meta, setMeta] = useState(null);
//   const [flatRows, setFlatRows] = useState([]);
//   const [uploadErr, setUploadErr] = useState("");

//   const [editMode, setEditMode] = useState(false);

//   // TB doc (includes value+audit arrays INSIDE each column)
//   const [tbDoc, setTbDoc] = useState(null);

//   // modal state
//   const [auditModalOpen, setAuditModalOpen] = useState(false);
//   const [auditModalTitle, setAuditModalTitle] = useState("");
//   const [auditModalLogs, setAuditModalLogs] = useState([]);

//   // dedupe commits
//   const editStartRef = useRef(new Map()); // key -> startValue
//   const lastSigRef = useRef({ sig: "", ts: 0 });

//   // refs for latest state
//   const flatRowsRef = useRef([]);
//   const tbDocRef = useRef(null);

//   useEffect(() => {
//     flatRowsRef.current = flatRows || [];
//   }, [flatRows]);

//   useEffect(() => {
//     tbDocRef.current = tbDoc;
//   }, [tbDoc]);

//   useEffect(() => {
//     const u = getSession();
//     if (!u) return router.replace("/auth/login");
//     setUser(u);
//   }, [router]);

//   const treeRows = useMemo(() => buildTreeFromLevels(flatRows), [flatRows]);
//   const previewRows = useMemo(() => flattenTreeRows(treeRows).slice(0, 300), [treeRows]);

//   const canEdit = useMemo(() => {
//     const role = user?.role;
//     return ["A", "B", "C", "D", "DOC_SPECIALIST"].includes(role);
//   }, [user]);

//   const totalEdits = useMemo(() => {
//     let total = 0;
//     for (const r of flatRows || []) {
//       const cells = [
//         r.ledgerName,
//         r.opening?.amount,
//         r.opening?.side,
//         r.transactions?.debit,
//         r.transactions?.credit,
//         r.closing?.amount,
//         r.closing?.side,
//       ].filter(Boolean);
//       for (const c of cells) total += (c.audit?.length || 0);
//     }
//     return total;
//   }, [flatRows]);

//   function persistDoc(nextDoc) {
//     if (!nextDoc?.fileId || !nextDoc?.sheetName) return;
//     writeTbDoc(tbDocKeyFor(nextDoc.fileId, nextDoc.sheetName), nextDoc);
//   }

//   function setEditStart(rowNo, field, startValue) {
//     editStartRef.current.set(`${rowNo}::${field}`, startValue ?? null);
//   }
//   function getEditStart(rowNo, field) {
//     return editStartRef.current.get(`${rowNo}::${field}`);
//   }
//   function clearEditStart(rowNo, field) {
//     editStartRef.current.delete(`${rowNo}::${field}`);
//   }

//   function openCellAudit(rowNo, fieldPath) {
//     const row = flatRowsRef.current.find((x) => x.rowNo === rowNo);
//     if (!row) return;

//     const cell = getCellByPath(row, fieldPath);
//     const logs = [...(cell?.audit || [])].slice().reverse(); // latest first
//     setAuditModalTitle(`Cell Audit • ${fieldPath} • rowNo ${rowNo}`);
//     setAuditModalLogs(logs);
//     setAuditModalOpen(true);
//   }

//   function openRowAudit(rowNo) {
//     const row = flatRowsRef.current.find((x) => x.rowNo === rowNo);
//     if (!row) return;

//     const logs = [];
//     const map = [
//       ["ledgerName", row.ledgerName],
//       ["opening.amount", row.opening?.amount],
//       ["opening.side", row.opening?.side],
//       ["transactions.debit", row.transactions?.debit],
//       ["transactions.credit", row.transactions?.credit],
//       ["closing.amount", row.closing?.amount],
//       ["closing.side", row.closing?.side],
//     ];
//     for (const [field, cell] of map) {
//       for (const a of cell?.audit || []) logs.push({ ...a, __field: field });
//     }
//     logs.sort((a, b) => new Date(b.at) - new Date(a.at));

//     setAuditModalTitle(`Row Audit • Sheet "${selectedSheet}" • rowNo ${rowNo}`);
//     setAuditModalLogs(logs);
//     setAuditModalOpen(true);
//   }

//   function dedupeCommit(sig) {
//     const now = Date.now();
//     if (lastSigRef.current.sig === sig && now - lastSigRef.current.ts < 600) return true;
//     lastSigRef.current = { sig, ts: now };
//     return false;
//   }

//   function commitCellChange({ rowNo, fieldPath, oldValue, newValue }) {
//     const oldS = JSON.stringify(oldValue ?? null);
//     const newS = JSON.stringify(newValue ?? null);
//     if (oldS === newS) return;

//     const sig = `${fileId}::${selectedSheet}::${rowNo}::${fieldPath}::${oldS}=>${newS}`;
//     if (dedupeCommit(sig)) return;

//     const auditItem = makeAuditItem({ oldValue, newValue, user });

//     const nextRows = (flatRowsRef.current || []).map((row) => {
//       if (row.rowNo !== rowNo) return row;

//       // update value + push audit into the exact cell object
//       const next = structuredClone(row);

//       const cell = getCellByPath(next, fieldPath);
//       if (!cell || typeof cell !== "object" || !("value" in cell) || !Array.isArray(cell.audit)) return row;

//       cell.value = newValue ?? null;
//       cell.audit.push(auditItem);

//       return next;
//     });

//     setFlatRows(nextRows);

//     const nextDoc = {
//       type: "TRIAL_BALANCE_DOC",
//       fileId,
//       fileName,
//       sheetName: selectedSheet,
//       meta,
//       rowsFlat: nextRows,
//       updatedAt: new Date().toISOString(),
//       createdAt: tbDocRef.current?.createdAt || new Date().toISOString(),
//     };
//     setTbDoc(nextDoc);
//     persistDoc(nextDoc);
//   }

//   // path helper for cells
//   function getCellByPath(rowObj, fieldPath) {
//     const parts = String(fieldPath).split(".");
//     let cur = rowObj;
//     for (const p of parts) {
//       if (!cur) return null;
//       cur = cur[p];
//     }
//     return cur;
//   }

//   // typing updates (no audit)
//   function updateCellValueOnly({ rowNo, fieldPath, value }) {
//     setFlatRows((prev) =>
//       prev.map((row) => {
//         if (row.rowNo !== rowNo) return row;
//         const next = structuredClone(row);
//         const cell = getCellByPath(next, fieldPath);
//         if (!cell || typeof cell !== "object" || !("value" in cell)) return row;
//         cell.value = value;
//         return next;
//       })
//     );
//   }

//   // commit wrappers
//   function commitField(rowNo, fieldPath, finalValue) {
//     const start = getEditStart(rowNo, fieldPath);
//     clearEditStart(rowNo, fieldPath);
//     commitCellChange({ rowNo, fieldPath, oldValue: start ?? null, newValue: finalValue ?? null });
//   }

//   async function handleExcelUpload(e) {
//     const file = e.target.files?.[0];
//     if (!file) return;

//     setUploadErr("");
//     setMeta(null);
//     setFlatRows([]);
//     setSheetNames([]);
//     setSelectedSheet("");
//     setEditMode(false);
//     setTbDoc(null);

//     const newFileId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
//     setFileId(newFileId);
//     setFileName(file.name);

//     try {
//       const buf = await file.arrayBuffer();
//       const wb = new ExcelJS.Workbook();
//       await wb.xlsx.load(buf);
//       workbookRef.current = wb;

//       const names = wb.worksheets.map((w) => w.name);
//       setSheetNames(names);

//       const first = names[0] || "";
//       setSelectedSheet(first);

//       if (first) {
//         const ws = wb.getWorksheet(first);
//         const parsed = parseTrialBalanceWorksheetExcelJS(ws, first);

//         setMeta(parsed.meta);
//         setFlatRows(parsed.rowsFlat);
//         originalFlatRowsRef.current = parsed.rowsFlat.map((x) => JSON.parse(JSON.stringify(x)));

//         const doc = {
//           type: "TRIAL_BALANCE_DOC",
//           fileId: newFileId,
//           fileName: file.name,
//           sheetName: first,
//           meta: parsed.meta,
//           rowsFlat: parsed.rowsFlat,
//           createdAt: new Date().toISOString(),
//           updatedAt: new Date().toISOString(),
//         };

//         setTbDoc(doc);
//         persistDoc(doc);
//       }
//     } catch (err) {
//       setUploadErr(err?.message || "Failed to parse Excel");
//     }
//   }

//   function handleReparse(sheet) {
//     const wb = workbookRef.current;
//     if (!wb) return;

//     setUploadErr("");
//     setMeta(null);
//     setFlatRows([]);
//     setEditMode(false);
//     setTbDoc(null);

//     try {
//       const key = tbDocKeyFor(fileId, sheet);
//       const stored = readTbDoc(key);

//       if (stored?.rowsFlat?.length) {
//         setSelectedSheet(sheet);
//         setMeta(stored.meta || null);
//         setFlatRows(stored.rowsFlat || []);
//         originalFlatRowsRef.current = (stored.rowsFlat || []).map((x) => JSON.parse(JSON.stringify(x)));
//         setTbDoc(stored);
//         return;
//       }

//       const ws = wb.getWorksheet(sheet);
//       const parsed = parseTrialBalanceWorksheetExcelJS(ws, sheet);

//       setMeta(parsed.meta);
//       setFlatRows(parsed.rowsFlat);
//       originalFlatRowsRef.current = parsed.rowsFlat.map((x) => JSON.parse(JSON.stringify(x)));

//       const doc = {
//         type: "TRIAL_BALANCE_DOC",
//         fileId,
//         fileName,
//         sheetName: sheet,
//         meta: parsed.meta,
//         rowsFlat: parsed.rowsFlat,
//         createdAt: new Date().toISOString(),
//         updatedAt: new Date().toISOString(),
//       };
//       setTbDoc(doc);
//       persistDoc(doc);
//     } catch (err) {
//       setUploadErr(err?.message || "Failed to parse selected sheet");
//     }
//   }

//   function resetEdits() {
//     // resets BOTH values and audit history (if you want keep history, remove audit clearing)
//     const base = originalFlatRowsRef.current.map((x) => JSON.parse(JSON.stringify(x)));

//     // clear audits
//     for (const r of base) {
//       r.ledgerName.audit = [];
//       r.opening.amount.audit = [];
//       r.opening.side.audit = [];
//       r.transactions.debit.audit = [];
//       r.transactions.credit.audit = [];
//       r.closing.amount.audit = [];
//       r.closing.side.audit = [];
//     }

//     setFlatRows(base);
//     setEditMode(false);

//     const doc = {
//       type: "TRIAL_BALANCE_DOC",
//       fileId,
//       fileName,
//       sheetName: selectedSheet,
//       meta,
//       rowsFlat: base,
//       createdAt: tbDocRef.current?.createdAt || new Date().toISOString(),
//       updatedAt: new Date().toISOString(),
//     };
//     setTbDoc(doc);
//     persistDoc(doc);
//   }

//   async function downloadExcelFromTable() {
//     await downloadAsExcelFromFlatRows({ headerLines: meta?.headerLines || [], flatRows, selectedSheet });
//   }

//   function CellInfoButton({ rowNo, fieldPath }) {
//     const row = flatRowsRef.current.find((x) => x.rowNo === rowNo);
//     const cell = row ? getCellByPath(row, fieldPath) : null;
//     const latest = latestAudit(cell);
//     if (!latest) return <span className="inline-block w-5" />;

//     return (
//       <button
//         type="button"
//         title={`Last edited by ${latest.by?.name || "Unknown"} at ${formatDateTime(latest.at)}`}
//         onClick={() => openCellAudit(rowNo, fieldPath)}
//         className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-[11px] text-slate-700 hover:bg-slate-50"
//       >
//         i
//       </button>
//     );
//   }

//   if (!user) return null;

//   return (
//     <main className="min-h-screen bg-slate-50">
//       <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-slate-200">
//         <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
//           <div>
//             <h1 className="text-lg sm:text-xl font-semibold text-slate-900">Doc Specialist</h1>
//             <p className="text-sm text-slate-500">
//               Welcome <span className="font-medium text-slate-700">{user.username}</span>{" "}
//               <span className="text-slate-400">•</span>{" "}
//               <span className="font-medium text-slate-700">{user.role}</span>
//             </p>
//           </div>

//           <button
//             onClick={() => {
//               clearSession();
//               router.push("/auth/login");
//             }}
//             className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700
//                        hover:bg-slate-50 active:bg-slate-100 transition
//                        focus:outline-none focus:ring-4 focus:ring-slate-200"
//           >
//             Logout
//           </button>
//         </div>
//       </header>

//       <section className="mx-auto max-w-6xl px-4 py-6">
//         <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
//           <h2 className="text-base font-semibold text-slate-900">Upload Excel</h2>

//           <div className="mt-4 space-y-3">
//             <input
//               type="file"
//               accept=".xlsx,.xls"
//               onChange={handleExcelUpload}
//               className="block w-full text-sm text-slate-700
//                          file:mr-4 file:rounded-xl file:border-0
//                          file:bg-slate-900 file:px-4 file:py-2.5
//                          file:text-sm file:font-medium file:text-white
//                          hover:file:bg-slate-800"
//             />

//             {sheetNames.length ? (
//               <div className="flex flex-wrap items-center gap-2">
//                 <label className="text-xs font-medium text-slate-600">Sheet</label>
//                 <select
//                   value={selectedSheet}
//                   onChange={(e) => {
//                     const s = e.target.value;
//                     setSelectedSheet(s);
//                     handleReparse(s);
//                   }}
//                   className="flex-1 min-w-[220px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-black
//                              focus:outline-none focus:ring-4 focus:ring-slate-200"
//                 >
//                   {sheetNames.map((s) => (
//                     <option key={s} value={s}>
//                       {s}
//                     </option>
//                   ))}
//                 </select>

//                 <button
//                   type="button"
//                   onClick={() => handleReparse(selectedSheet)}
//                   className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700
//                              hover:bg-slate-50 active:bg-slate-100"
//                 >
//                   Re-parse
//                 </button>
//               </div>
//             ) : null}

//             {uploadErr ? (
//               <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{uploadErr}</div>
//             ) : null}

//             {meta && flatRows.length ? (
//               <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
//                 <div className="text-xs text-slate-500">
//                   File: <span className="font-medium text-slate-700">{fileName}</span> • Parsed{" "}
//                   <span className="font-medium text-slate-700">{flatRows.length}</span> rows • Total edits:{" "}
//                   <span className="font-medium text-slate-700">{totalEdits}</span>
//                 </div>

//                 <div className="flex flex-wrap items-center gap-2">
//                   {canEdit ? (
//                     <button
//                       type="button"
//                       onClick={() => setEditMode((v) => !v)}
//                       className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 active:bg-slate-950 transition"
//                     >
//                       {editMode ? "Exit Edit Mode" : "Edit Mode"}
//                     </button>
//                   ) : null}

//                   <button
//                     type="button"
//                     onClick={resetEdits}
//                     className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100"
//                   >
//                     Reset
//                   </button>

//                   <button
//                     type="button"
//                     onClick={downloadExcelFromTable}
//                     className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100"
//                   >
//                     Download Excel (Edited)
//                   </button>

//                   <button
//                     type="button"
//                     onClick={() => downloadTbJson(tbDocRef.current)}
//                     className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100"
//                     title="This JSON includes value + audit[] INSIDE each column"
//                   >
//                     Download TB JSON (with history)
//                   </button>
//                 </div>
//               </div>
//             ) : null}
//           </div>
//         </div>

//         {/* Preview */}
//         {meta && flatRows.length ? (
//           <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
//             <h3 className="text-base font-semibold text-slate-900">Preview</h3>

//             <div className="mt-4 overflow-auto rounded-xl border border-slate-200">
//               <table className="min-w-full text-sm">
//                 <thead className="bg-slate-50">
//                   <tr className="text-left text-slate-600">
//                     <th className="px-3 py-2 border-b border-slate-200">Ledger</th>
//                     <th className="px-3 py-2 border-b border-slate-200">Opening</th>
//                     <th className="px-3 py-2 border-b border-slate-200">Debit</th>
//                     <th className="px-3 py-2 border-b border-slate-200">Credit</th>
//                     <th className="px-3 py-2 border-b border-slate-200">Closing</th>
//                     <th className="px-3 py-2 border-b border-slate-200 text-right">Audit</th>
//                   </tr>
//                 </thead>

//                 <tbody>
//                   {previewRows.map((r) => (
//                     <tr key={r.rowNo} className="odd:bg-white even:bg-slate-50">
//                       {/* Ledger */}
//                       <td className="px-3 py-2 border-b border-slate-200">
//                         <div className="flex items-center">
//                           {editMode ? (
//                             <input
//                               className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-black"
//                               style={{ paddingLeft: 8 + (r.level || 0) * 16 }}
//                               value={r.ledgerName?.value ?? ""}
//                               onFocus={() => setEditStart(r.rowNo, "ledgerName", r.ledgerName?.value ?? null)}
//                               onChange={(e) => updateCellValueOnly({ rowNo: r.rowNo, fieldPath: "ledgerName", value: e.target.value })}
//                               onBlur={(e) => commitField(r.rowNo, "ledgerName", e.target.value)}
//                             />
//                           ) : (
//                             <span className="text-slate-700" style={{ paddingLeft: (r.level || 0) * 16, display: "inline-block" }}>
//                               {r.ledgerName?.value ?? ""}
//                             </span>
//                           )}
//                           <CellInfoButton rowNo={r.rowNo} fieldPath="ledgerName" />
//                         </div>
//                       </td>

//                       {/* Opening */}
//                       <td className="px-3 py-2 border-b border-slate-200 text-slate-700">
//                         <div className="flex items-center">
//                           {editMode ? (
//                             <div className="flex items-center gap-2">
//                               <input
//                                 className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
//                                 value={r.opening?.amount?.value ?? ""}
//                                 placeholder="amount"
//                                 onFocus={() => setEditStart(r.rowNo, "opening.amount", r.opening?.amount?.value ?? null)}
//                                 onChange={(e) => {
//                                   const v = e.target.value === "" ? null : toNumberSafe(e.target.value);
//                                   updateCellValueOnly({ rowNo: r.rowNo, fieldPath: "opening.amount", value: v });
//                                 }}
//                                 onBlur={(e) => {
//                                   const v = e.target.value === "" ? null : toNumberSafe(e.target.value);
//                                   commitField(r.rowNo, "opening.amount", v);
//                                 }}
//                               />

//                               <select
//                                 className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
//                                 value={r.opening?.side?.value ?? ""}
//                                 onFocus={() => setEditStart(r.rowNo, "opening.side", r.opening?.side?.value ?? null)}
//                                 onChange={(e) => {
//                                   const v = e.target.value || null;
//                                   updateCellValueOnly({ rowNo: r.rowNo, fieldPath: "opening.side", value: v });
//                                   commitField(r.rowNo, "opening.side", v); // commit on change for select
//                                 }}
//                               >
//                                 <option value="">-</option>
//                                 <option value="Dr">Dr</option>
//                                 <option value="Cr">Cr</option>
//                               </select>
//                             </div>
//                           ) : (
//                             formatAmountSideObj({ amount: r.opening?.amount?.value ?? null, side: r.opening?.side?.value ?? null })
//                           )}
//                           <CellInfoButton rowNo={r.rowNo} fieldPath="opening.amount" />
//                         </div>
//                       </td>

//                       {/* Debit */}
//                       <td className="px-3 py-2 border-b border-slate-200 text-slate-700">
//                         <div className="flex items-center">
//                           {editMode ? (
//                             <input
//                               className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
//                               value={r.transactions?.debit?.value ?? ""}
//                               onFocus={() => setEditStart(r.rowNo, "transactions.debit", r.transactions?.debit?.value ?? null)}
//                               onChange={(e) => {
//                                 const v = e.target.value === "" ? null : toNumberSafe(e.target.value);
//                                 updateCellValueOnly({ rowNo: r.rowNo, fieldPath: "transactions.debit", value: v });
//                               }}
//                               onBlur={(e) => {
//                                 const v = e.target.value === "" ? null : toNumberSafe(e.target.value);
//                                 commitField(r.rowNo, "transactions.debit", v);
//                               }}
//                             />
//                           ) : (
//                             r.transactions?.debit?.value ?? ""
//                           )}
//                           <CellInfoButton rowNo={r.rowNo} fieldPath="transactions.debit" />
//                         </div>
//                       </td>

//                       {/* Credit */}
//                       <td className="px-3 py-2 border-b border-slate-200 text-slate-700">
//                         <div className="flex items-center">
//                           {editMode ? (
//                             <input
//                               className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
//                               value={r.transactions?.credit?.value ?? ""}
//                               onFocus={() => setEditStart(r.rowNo, "transactions.credit", r.transactions?.credit?.value ?? null)}
//                               onChange={(e) => {
//                                 const v = e.target.value === "" ? null : toNumberSafe(e.target.value);
//                                 updateCellValueOnly({ rowNo: r.rowNo, fieldPath: "transactions.credit", value: v });
//                               }}
//                               onBlur={(e) => {
//                                 const v = e.target.value === "" ? null : toNumberSafe(e.target.value);
//                                 commitField(r.rowNo, "transactions.credit", v);
//                               }}
//                             />
//                           ) : (
//                             r.transactions?.credit?.value ?? ""
//                           )}
//                           <CellInfoButton rowNo={r.rowNo} fieldPath="transactions.credit" />
//                         </div>
//                       </td>

//                       {/* Closing */}
//                       <td className="px-3 py-2 border-b border-slate-200 text-slate-700">
//                         <div className="flex items-center">
//                           {editMode ? (
//                             <div className="flex items-center gap-2">
//                               <input
//                                 className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
//                                 value={r.closing?.amount?.value ?? ""}
//                                 placeholder="amount"
//                                 onFocus={() => setEditStart(r.rowNo, "closing.amount", r.closing?.amount?.value ?? null)}
//                                 onChange={(e) => {
//                                   const v = e.target.value === "" ? null : toNumberSafe(e.target.value);
//                                   updateCellValueOnly({ rowNo: r.rowNo, fieldPath: "closing.amount", value: v });
//                                 }}
//                                 onBlur={(e) => {
//                                   const v = e.target.value === "" ? null : toNumberSafe(e.target.value);
//                                   commitField(r.rowNo, "closing.amount", v);
//                                 }}
//                               />

//                               <select
//                                 className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
//                                 value={r.closing?.side?.value ?? ""}
//                                 onFocus={() => setEditStart(r.rowNo, "closing.side", r.closing?.side?.value ?? null)}
//                                 onChange={(e) => {
//                                   const v = e.target.value || null;
//                                   updateCellValueOnly({ rowNo: r.rowNo, fieldPath: "closing.side", value: v });
//                                   commitField(r.rowNo, "closing.side", v);
//                                 }}
//                               >
//                                 <option value="">-</option>
//                                 <option value="Dr">Dr</option>
//                                 <option value="Cr">Cr</option>
//                               </select>
//                             </div>
//                           ) : (
//                             formatAmountSideObj({ amount: r.closing?.amount?.value ?? null, side: r.closing?.side?.value ?? null })
//                           )}
//                           <CellInfoButton rowNo={r.rowNo} fieldPath="closing.amount" />
//                         </div>
//                       </td>

//                       {/* Row audit */}
//                       <td className="px-3 py-2 border-b border-slate-200 text-right">
//                         <button
//                           type="button"
//                           onClick={() => openRowAudit(r.rowNo)}
//                           className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
//                           title="View row audit"
//                         >
//                           👁
//                         </button>
//                       </td>
//                     </tr>
//                   ))}
//                 </tbody>
//               </table>
//             </div>

//             <div className="mt-3 text-xs text-slate-500">
//               Structure: each column is <span className="font-medium">{`{ value, audit: [] }`}</span>. Latest is always <span className="font-medium">value</span>.
//             </div>
//           </div>
//         ) : null}
//       </section>

//       {/* Audit modal */}
//       <Modal open={auditModalOpen} title={auditModalTitle} onClose={() => setAuditModalOpen(false)}>
//         {auditModalLogs.length === 0 ? (
//           <div className="text-sm text-slate-600">No edits recorded for this selection.</div>
//         ) : (
//           <div className="overflow-auto rounded-xl border border-slate-200">
//             <table className="min-w-full text-sm">
//               <thead className="bg-slate-50">
//                 <tr className="text-left text-slate-600">
//                   <th className="px-3 py-2 border-b border-slate-200">When</th>
//                   <th className="px-3 py-2 border-b border-slate-200">User</th>
//                   <th className="px-3 py-2 border-b border-slate-200">Role</th>
//                   <th className="px-3 py-2 border-b border-slate-200">Field</th>
//                   <th className="px-3 py-2 border-b border-slate-200">Old</th>
//                   <th className="px-3 py-2 border-b border-slate-200">New</th>
//                 </tr>
//               </thead>
//               <tbody>
//                 {auditModalLogs.map((l, idx) => (
//                   <tr key={`${l.at}_${idx}`} className="odd:bg-white even:bg-slate-50 text-black">
//                     <td className="px-3 py-2 border-b border-slate-200">{formatDateTime(l.at)}</td>
//                     <td className="px-3 py-2 border-b border-slate-200">{l.by?.name || "Unknown"}</td>
//                     <td className="px-3 py-2 border-b border-slate-200">{l.by?.role || "-"}</td>
//                     <td className="px-3 py-2 border-b border-slate-200">{l.__field || "-"}</td>
//                     <td className="px-3 py-2 border-b border-slate-200 text-slate-600">{String(l.old ?? "")}</td>
//                     <td className="px-3 py-2 border-b border-slate-200 font-medium text-slate-900">{String(l.new ?? "")}</td>
//                   </tr>
//                 ))}
//               </tbody>
//             </table>
//           </div>
//         )}
//       </Modal>
//     </main>
//   );
// }
