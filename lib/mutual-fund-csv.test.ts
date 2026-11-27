import { describe, expect, it } from "vitest";
import { mutualFundEntriesToCsv, parseMutualFundCsv } from "./mutual-fund-csv";
import { parseCsv } from "./csv";
import type { MutualFundEntryRow } from "./db/schema-types";

function entry(overrides: Partial<MutualFundEntryRow> = {}): MutualFundEntryRow {
  return {
    id: "id-1",
    user_id: "u",
    profile_id: "p",
    month: "2026-01-01",
    amount_added: 10000,
    sip_amount: 10000,
    lumpsum_amount: 0,
    stp_amount: 0,
    other_amount: 0,
    withdrawal: 0,
    planned_amount: null,
    current_value: 10200,
    notes: null,
    negative_amount_note: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const HEADER =
  "month,sip_amount,lumpsum_amount,stp_amount,other_amount,amount_added,withdrawal,planned_amount,current_value,notes,negative_amount_note";

describe("mutualFundEntriesToCsv", () => {
  it("writes a header row followed by one data row per entry, oldest first", () => {
    const csv = mutualFundEntriesToCsv([
      entry({ month: "2026-02-01" }),
      entry({ month: "2026-01-01" }),
    ]);
    const rows = parseCsv(csv);
    expect(rows[0]).toEqual(HEADER.split(","));
    expect(rows[1][0]).toBe("2026-01-01"); // oldest first, regardless of input order
    expect(rows[2][0]).toBe("2026-02-01");
  });

  it("round-trips through parseMutualFundCsv back to equivalent upsert inputs", () => {
    const original = entry({ month: "2026-03-01", notes: "a, note with \"quotes\"" });
    const csv = mutualFundEntriesToCsv([original]);
    const { rows, rejected, duplicateMonths } = parseMutualFundCsv(csv);

    expect(rejected).toEqual([]);
    expect(duplicateMonths).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].input).toEqual({
      month: "2026-03-01",
      amount_added: 10000,
      sip_amount: 10000,
      lumpsum_amount: 0,
      stp_amount: 0,
      other_amount: 0,
      withdrawal: 0,
      planned_amount: null,
      current_value: 10200,
      notes: 'a, note with "quotes"',
      negative_amount_note: null,
    });
  });

  it("leaves blank cells for a null breakdown (never-classified) entry, not zeros", () => {
    const csv = mutualFundEntriesToCsv([
      entry({ sip_amount: null, lumpsum_amount: null, stp_amount: null, other_amount: null, amount_added: 5000 }),
    ]);
    const rows = parseCsv(csv);
    expect(rows[1].slice(1, 5)).toEqual(["", "", "", ""]); // sip/lumpsum/stp/other
    expect(rows[1][5]).toBe("5000"); // amount_added
  });
});

describe("parseMutualFundCsv", () => {
  it("rejects a file with no rows at all", () => {
    const result = parseMutualFundCsv("");
    expect(result.rejected).toEqual([{ rowNumber: 1, reason: "File is empty." }]);
    expect(result.rows).toEqual([]);
  });

  it("rejects a file missing a required column", () => {
    const result = parseMutualFundCsv("month,current_value\n2026-01-01,10000\n");
    expect(result.rejected[0].reason).toMatch(/Missing required column/);
  });

  it("normalizes a bare yyyy-mm month to yyyy-mm-01", () => {
    const csv = `${HEADER}\n2026-05,,,,,1000,0,,10000,,\n`;
    const result = parseMutualFundCsv(csv);
    expect(result.rejected).toEqual([]);
    expect(result.rows[0].month).toBe("2026-05-01");
  });

  it("rejects an invalid month", () => {
    const csv = `${HEADER}\nnot-a-month,,,,,,0,,10000,,\n`;
    const result = parseMutualFundCsv(csv);
    expect(result.rejected).toEqual([{ rowNumber: 2, reason: 'Invalid month "not-a-month" - expected yyyy-mm or yyyy-mm-01.' }]);
  });

  it("rejects a row with an unparseable number", () => {
    const csv = `${HEADER}\n2026-01,,,,,,0,,not-a-number,,\n`;
    const result = parseMutualFundCsv(csv);
    expect(result.rejected).toEqual([{ rowNumber: 2, reason: '"current_value" isn\'t a number.' }]);
  });

  it("requires current_value and rejects a negative one", () => {
    const missing = parseMutualFundCsv(`${HEADER}\n2026-01,,,,,,0,,,,\n`);
    expect(missing.rejected[0].reason).toMatch(/current_value is required/);

    const negative = parseMutualFundCsv(`${HEADER}\n2026-01,,,,,,0,,-5,,\n`);
    expect(negative.rejected[0].reason).toMatch(/current_value is required/);
  });

  it("recomputes amount_added as the sum of the breakdown columns, ignoring the file's own amount_added cell", () => {
    const csv = `${HEADER}\n2026-01,1000,2000,0,0,999999,0,,10000,,\n`;
    const result = parseMutualFundCsv(csv);
    expect(result.rows[0].input.amount_added).toBe(3000);
    expect(result.rows[0].input.sip_amount).toBe(1000);
    expect(result.rows[0].input.lumpsum_amount).toBe(2000);
  });

  it("uses the file's amount_added directly when no breakdown column has a value", () => {
    const csv = `${HEADER}\n2026-01,,,,,7000,0,,10000,,\n`;
    const result = parseMutualFundCsv(csv);
    expect(result.rows[0].input.amount_added).toBe(7000);
    expect(result.rows[0].input.sip_amount).toBeNull();
    expect(result.rows[0].input.lumpsum_amount).toBeNull();
  });

  it("rejects a row with a blank amount_added and no sip/lumpsum/stp/other breakdown, instead of silently importing it as $0", () => {
    const csv = `${HEADER}\n2026-01,,,,,,0,,10000,,\n`;
    const result = parseMutualFundCsv(csv);
    expect(result.rows).toEqual([]);
    expect(result.rejected[0].reason).toMatch(/amount_added is missing or not a number/);
  });

  it("rejects a negative withdrawal or planned_amount", () => {
    const withdrawal = parseMutualFundCsv(`${HEADER}\n2026-01,,,,,1000,-5,,10000,,\n`);
    expect(withdrawal.rejected[0].reason).toMatch(/withdrawal can't be negative/);

    const planned = parseMutualFundCsv(`${HEADER}\n2026-01,,,,,1000,0,-5,10000,,\n`);
    expect(planned.rejected[0].reason).toMatch(/planned_amount can't be negative/);
  });

  it("reports duplicate months within the file instead of picking one", () => {
    const csv = `${HEADER}\n2026-01,,,,,1000,0,,10000,,\n2026-01,,,,,2000,0,,11000,,\n2026-02,,,,,500,0,,5000,,\n`;
    const result = parseMutualFundCsv(csv);
    expect(result.duplicateMonths).toEqual(["2026-01-01"]);
    expect(result.rows).toEqual([]); // stops rather than partially importing around the duplicate
  });

  it("only applies the negative_amount_note when amount_added ends up negative", () => {
    const csv = `${HEADER}\n2026-01,,,,,-500,0,,10000,,a correction\n`;
    const result = parseMutualFundCsv(csv);
    expect(result.rows[0].input.negative_amount_note).toBe("a correction");

    const positiveCsv = `${HEADER}\n2026-01,,,,,500,0,,10000,,shouldn't be kept\n`;
    const positiveResult = parseMutualFundCsv(positiveCsv);
    expect(positiveResult.rows[0].input.negative_amount_note).toBeNull();
  });
});
