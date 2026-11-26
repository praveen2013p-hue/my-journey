/**
 * CSV <-> Mutual Fund entry conversion, DECISIONS.md (CSV import/export).
 * Pure functions, no I/O - the API route does the DB reads/writes;
 * `parseMutualFundCsv` only turns CSV text into validated, ready-to-save
 * rows (or rejections), the same "never guess, always say why" standard
 * as the rest of this file's siblings in `lib/mutual-fund-stats.ts`.
 */

import { parseCsv, toCsv } from "./csv";
import type { MutualFundEntryRow } from "./db/schema-types";
import type { UpsertMutualFundEntryInput } from "./db/mutual-funds";

/** Column order for both export and import - also the header row written/expected. */
const CSV_COLUMNS = [
  "month",
  "sip_amount",
  "lumpsum_amount",
  "stp_amount",
  "other_amount",
  "amount_added",
  "withdrawal",
  "planned_amount",
  "current_value",
  "notes",
  "negative_amount_note",
] as const;

function numToCell(n: number | null): string {
  return n === null ? "" : String(n);
}

/** One profile's full entry history as CSV text - oldest first, matching how entries are normally listed. */
export function mutualFundEntriesToCsv(entries: MutualFundEntryRow[]): string {
  const sorted = [...entries].sort((a, b) => (a.month < b.month ? -1 : 1));
  const rows = sorted.map((e) => [
    e.month,
    numToCell(e.sip_amount),
    numToCell(e.lumpsum_amount),
    numToCell(e.stp_amount),
    numToCell(e.other_amount),
    e.amount_added,
    e.withdrawal,
    numToCell(e.planned_amount),
    e.current_value,
    e.notes ?? "",
    e.negative_amount_note ?? "",
  ]);
  return toCsv([...CSV_COLUMNS], rows) + "\r\n";
}

export interface RejectedCsvRow {
  /** 1-based, counting the header as row 1 (so the first data row is row 2) - matches what a user sees if they open the file in a spreadsheet app. */
  rowNumber: number;
  reason: string;
}

export interface ParsedMutualFundCsv {
  /** Ready to upsert - one per valid, non-duplicate-within-file month, oldest first. */
  rows: Array<{ month: string; input: UpsertMutualFundEntryInput }>;
  rejected: RejectedCsvRow[];
  /**
   * Months that appear more than once in the file - picking one would be
   * silently discarding the other, so this is reported instead of guessed.
   * When non-empty, `rows` only contains the file's non-duplicated months
   * (the caller should treat a non-empty list here as a reason to stop,
   * same as `rejected`, not partially import around it).
   */
  duplicateMonths: string[];
}

function parseNumberCell(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : NaN; // NaN is a distinct "present but unparseable" signal
}

/**
 * Validates and converts CSV text into upsert-ready rows. Mirrors
 * `POST /api/mutual-funds`'s own amount_added convention exactly: if any
 * of sip/lumpsum/stp/other has a value in the row, amount_added is
 * recomputed as their sum (never trusted from the file directly) and
 * each of those four is stored as a number (0 if blank); if none of the
 * four has a value, the row's own `amount_added` cell is used directly
 * and all four are stored as null (the "never classified" convention).
 */
export function parseMutualFundCsv(text: string): ParsedMutualFundCsv {
  const allRows = parseCsv(text);
  const rejected: RejectedCsvRow[] = [];
  const rows: Array<{ month: string; input: UpsertMutualFundEntryInput }> = [];

  if (allRows.length === 0) {
    return { rows: [], rejected: [{ rowNumber: 1, reason: "File is empty." }], duplicateMonths: [] };
  }

  const header = allRows[0].map((h) => h.trim().toLowerCase());
  const colIndex = new Map(header.map((h, i) => [h, i]));
  const missingColumns = CSV_COLUMNS.filter((c) => !colIndex.has(c));
  if (missingColumns.length > 0) {
    return {
      rows: [],
      rejected: [{ rowNumber: 1, reason: `Missing required column(s): ${missingColumns.join(", ")}` }],
      duplicateMonths: [],
    };
  }

  const cell = (dataRow: string[], name: (typeof CSV_COLUMNS)[number]): string => dataRow[colIndex.get(name)!] ?? "";

  const seenMonths = new Map<string, number>(); // month -> first rowNumber seen
  const duplicateMonths = new Set<string>();

  for (let i = 1; i < allRows.length; i++) {
    const rowNumber = i + 1;
    const dataRow = allRows[i];

    const monthRaw = cell(dataRow, "month").trim();
    const month = /^\d{4}-\d{2}$/.test(monthRaw) ? `${monthRaw}-01` : monthRaw;
    if (!/^\d{4}-\d{2}-01$/.test(month)) {
      rejected.push({ rowNumber, reason: `Invalid month "${monthRaw}" - expected yyyy-mm or yyyy-mm-01.` });
      continue;
    }

    const numericColumns = [
      "sip_amount",
      "lumpsum_amount",
      "stp_amount",
      "other_amount",
      "amount_added",
      "withdrawal",
      "planned_amount",
      "current_value",
    ] as const;
    const parsed = Object.fromEntries(
      numericColumns.map((c) => [c, parseNumberCell(cell(dataRow, c))]),
    ) as Record<(typeof numericColumns)[number], number | null>;

    const badColumn = numericColumns.find((c) => Number.isNaN(parsed[c]));
    if (badColumn) {
      rejected.push({ rowNumber, reason: `"${badColumn}" isn't a number.` });
      continue;
    }

    const sipAmount = parsed.sip_amount;
    const lumpsumAmount = parsed.lumpsum_amount;
    const stpAmount = parsed.stp_amount;
    const otherAmount = parsed.other_amount;
    const amountAddedCell = parsed.amount_added;
    const withdrawalCell = parsed.withdrawal;
    const plannedAmountCell = parsed.planned_amount;
    const currentValueCell = parsed.current_value;

    if (currentValueCell === null || currentValueCell < 0) {
      rejected.push({ rowNumber, reason: "current_value is required and must be 0 or greater." });
      continue;
    }

    const hasBreakdown = sipAmount !== null || lumpsumAmount !== null || stpAmount !== null || otherAmount !== null;
    const sip = hasBreakdown ? (sipAmount ?? 0) : null;
    const lumpsum = hasBreakdown ? (lumpsumAmount ?? 0) : null;
    const stp = hasBreakdown ? (stpAmount ?? 0) : null;
    const other = hasBreakdown ? (otherAmount ?? 0) : null;
    const amountAdded = hasBreakdown ? (sip ?? 0) + (lumpsum ?? 0) + (stp ?? 0) + (other ?? 0) : (amountAddedCell ?? 0);

    const withdrawal = withdrawalCell ?? 0;
    if (withdrawal < 0) {
      rejected.push({ rowNumber, reason: "withdrawal can't be negative." });
      continue;
    }
    if (plannedAmountCell !== null && plannedAmountCell < 0) {
      rejected.push({ rowNumber, reason: "planned_amount can't be negative." });
      continue;
    }

    const notes = cell(dataRow, "notes").trim() || null;
    const negativeAmountNote = amountAdded < 0 ? cell(dataRow, "negative_amount_note").trim() || null : null;

    if (seenMonths.has(month)) {
      duplicateMonths.add(month);
    } else {
      seenMonths.set(month, rowNumber);
    }

    rows.push({
      month,
      input: {
        month,
        amount_added: amountAdded,
        sip_amount: sip,
        lumpsum_amount: lumpsum,
        stp_amount: stp,
        other_amount: other,
        withdrawal,
        planned_amount: plannedAmountCell,
        current_value: currentValueCell,
        notes,
        negative_amount_note: negativeAmountNote,
      },
    });
  }

  if (duplicateMonths.size > 0) {
    return { rows: [], rejected, duplicateMonths: [...duplicateMonths].sort() };
  }

  return { rows, rejected, duplicateMonths: [] };
}
