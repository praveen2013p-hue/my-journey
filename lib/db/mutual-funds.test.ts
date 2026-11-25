import { beforeEach, describe, expect, it } from "vitest";
import { __resetStoreForTests } from "./local-store";
import {
  deleteMutualFundEntry,
  getMutualFundEntryById,
  listMutualFundEntries,
  updateMutualFundEntry,
  upsertMutualFundEntry,
} from "./mutual-funds";

const USER_ID = "praveen2013p@gmail.com";

function sampleEntry(overrides: Partial<Parameters<typeof upsertMutualFundEntry>[1]> = {}) {
  return {
    month: "2026-01-01",
    amount_added: 10000,
    withdrawal: 0,
    planned_amount: null,
    current_value: 10500,
    notes: null,
    negative_amount_note: null,
    ...overrides,
  };
}

beforeEach(async () => {
  await __resetStoreForTests();
});

describe("upsertMutualFundEntry", () => {
  it("creates a new entry for a month with no existing row", async () => {
    const row = await upsertMutualFundEntry(USER_ID, sampleEntry());
    expect(row.month).toBe("2026-01-01");
    expect(row.amount_added).toBe(10000);
    expect(row.current_value).toBe(10500);
  });

  it("updates the existing entry instead of creating a second one for the same month", async () => {
    await upsertMutualFundEntry(USER_ID, sampleEntry());
    await upsertMutualFundEntry(USER_ID, sampleEntry({ current_value: 11000 }));

    const rows = await listMutualFundEntries(USER_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0].current_value).toBe(11000);
  });

  it("never mixes up entries between users", async () => {
    await upsertMutualFundEntry(USER_ID, sampleEntry());
    await upsertMutualFundEntry("other@example.com", sampleEntry({ current_value: 99999 }));

    const rows = await listMutualFundEntries(USER_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0].current_value).toBe(10500);
  });
});

describe("listMutualFundEntries", () => {
  it("returns entries sorted by month ascending", async () => {
    await upsertMutualFundEntry(USER_ID, sampleEntry({ month: "2026-03-01" }));
    await upsertMutualFundEntry(USER_ID, sampleEntry({ month: "2026-01-01" }));
    await upsertMutualFundEntry(USER_ID, sampleEntry({ month: "2026-02-01" }));

    const rows = await listMutualFundEntries(USER_ID);
    expect(rows.map((r) => r.month)).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
  });
});

describe("updateMutualFundEntry / deleteMutualFundEntry", () => {
  it("edits an existing entry's values", async () => {
    const created = await upsertMutualFundEntry(USER_ID, sampleEntry());
    const updated = await updateMutualFundEntry(USER_ID, created.id, { current_value: 12000, notes: "bonus added" });
    expect(updated!.current_value).toBe(12000);
    expect(updated!.notes).toBe("bonus added");
    expect(updated!.amount_added).toBe(10000); // untouched
  });

  it("returns null when updating another user's entry", async () => {
    const created = await upsertMutualFundEntry(USER_ID, sampleEntry());
    const result = await updateMutualFundEntry("other@example.com", created.id, { current_value: 1 });
    expect(result).toBeNull();
  });

  it("deletes an entry", async () => {
    const created = await upsertMutualFundEntry(USER_ID, sampleEntry());
    await deleteMutualFundEntry(USER_ID, created.id);
    expect(await getMutualFundEntryById(USER_ID, created.id)).toBeNull();
  });

  it("never deletes another user's entry", async () => {
    const created = await upsertMutualFundEntry(USER_ID, sampleEntry());
    await deleteMutualFundEntry("other@example.com", created.id);
    expect(await getMutualFundEntryById(USER_ID, created.id)).not.toBeNull();
  });

  it("edits withdrawal and planned_amount independently", async () => {
    const created = await upsertMutualFundEntry(USER_ID, sampleEntry());
    const updated = await updateMutualFundEntry(USER_ID, created.id, { withdrawal: 2000, planned_amount: 12000 });
    expect(updated!.withdrawal).toBe(2000);
    expect(updated!.planned_amount).toBe(12000);
  });

  it("clears planned_amount back to null", async () => {
    const created = await upsertMutualFundEntry(USER_ID, sampleEntry({ planned_amount: 12000 }));
    const updated = await updateMutualFundEntry(USER_ID, created.id, { planned_amount: null });
    expect(updated!.planned_amount).toBeNull();
  });
});
