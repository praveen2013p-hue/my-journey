import { beforeEach, describe, expect, it } from "vitest";
import { __resetStoreForTests } from "./local-store";
import { listSectorMap, listUnresolvedSectors, seedSectorMapIfEmpty, setSectorSymbol } from "./sector-map";
import { SECTOR_MAP_SEED } from "../sector-map-seed";

beforeEach(async () => {
  await __resetStoreForTests();
});

describe("seedSectorMapIfEmpty", () => {
  it("seeds 28 India sectors and 11 US sectors + 18 US industries, matching BRIEF.md §5c", async () => {
    await seedSectorMapIfEmpty(SECTOR_MAP_SEED);
    const india = await listSectorMap("IN");
    const us = await listSectorMap("US");
    expect(india).toHaveLength(28);
    expect(us.filter((s) => s.kind === "sector")).toHaveLength(11);
    expect(us.filter((s) => s.kind === "industry")).toHaveLength(18);
  });

  it("is a no-op if sector_map already has rows (never duplicates on repeat calls)", async () => {
    await seedSectorMapIfEmpty(SECTOR_MAP_SEED);
    await seedSectorMapIfEmpty(SECTOR_MAP_SEED);
    const india = await listSectorMap("IN");
    expect(india).toHaveLength(28);
  });

  it("every India sector without a brief-confirmed TV symbol shows up as unresolved, never a guess", async () => {
    await seedSectorMapIfEmpty(SECTOR_MAP_SEED);
    const unresolved = await listUnresolvedSectors("IN");
    expect(unresolved.length).toBeGreaterThan(0);
    expect(unresolved.every((s) => s.tv_symbol === null)).toBe(true);
    // The 4 the brief does give a symbol for must NOT be in the unresolved list.
    expect(unresolved.map((s) => s.display_name)).not.toContain("Bank");
    expect(unresolved.map((s) => s.display_name)).not.toContain("Defence");
  });

  it("every US sector and industry is fully resolved (brief gives all their symbols)", async () => {
    await seedSectorMapIfEmpty(SECTOR_MAP_SEED);
    const unresolvedUs = await listUnresolvedSectors("US");
    expect(unresolvedUs).toHaveLength(0);
  });
});

describe("setSectorSymbol", () => {
  it("resolves a sector's tv_symbol and provider_symbol together, dropping it out of unresolved", async () => {
    await seedSectorMapIfEmpty(SECTOR_MAP_SEED);
    expect((await listUnresolvedSectors("IN")).map((s) => s.display_name)).toContain("Auto");

    await setSectorSymbol("IN", "Auto", "NSE:NIFTYAUTO");

    const unresolved = await listUnresolvedSectors("IN");
    expect(unresolved.map((s) => s.display_name)).not.toContain("Auto");
    const auto = (await listSectorMap("IN")).find((s) => s.display_name === "Auto")!;
    expect(auto.tv_symbol).toBe("NSE:NIFTYAUTO");
    expect(auto.provider_symbol).toBe("NSE:NIFTYAUTO");
  });
});
