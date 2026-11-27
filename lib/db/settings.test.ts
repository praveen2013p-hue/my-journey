import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { beforeEach, describe, expect, it } from "vitest";
import { __resetStoreForTests } from "./local-store";
import { getUserSettings, setUserNavLongTermLabel, setUserNavScannerLabel, setUserNavTradingLabel } from "./settings";

const STORE_PATH = path.join(os.tmpdir(), "my-journey-dev-store.json");

beforeEach(async () => {
  await __resetStoreForTests();
});

describe("getUserSettings", () => {
  it("creates a default row on first call, then only reads on later calls (no repeated writes)", async () => {
    const first = await getUserSettings("praveen@example.com");
    expect(first.theme).toBe("dark");
    const afterCreate = await fs.stat(STORE_PATH);

    await new Promise((resolve) => setTimeout(resolve, 10));
    await getUserSettings("praveen@example.com");
    await getUserSettings("praveen@example.com");
    const afterRepeatedReads = await fs.stat(STORE_PATH);

    // This is the exact bug that caused an infinite dev-server reload loop:
    // every page load calls getUserSettings, and if that always rewrites
    // the file, the write itself re-triggers Next's dev file watcher.
    expect(afterRepeatedReads.mtimeMs).toBe(afterCreate.mtimeMs);
  });

  it("defaults nav_long_term_label to 'Investment'", async () => {
    const settings = await getUserSettings("praveen@example.com");
    expect(settings.nav_long_term_label).toBe("Investment");
  });

  it("defaults nav_scanner_label to 'Scanner' and nav_trading_label to 'Trading'", async () => {
    const settings = await getUserSettings("praveen@example.com");
    expect(settings.nav_scanner_label).toBe("Scanner");
    expect(settings.nav_trading_label).toBe("Trading");
  });
});

describe("setUserNavLongTermLabel", () => {
  it("renames the category label", async () => {
    await setUserNavLongTermLabel("praveen@example.com", "Retirement Corpus");
    const settings = await getUserSettings("praveen@example.com");
    expect(settings.nav_long_term_label).toBe("Retirement Corpus");
  });

  it("trims whitespace", async () => {
    await setUserNavLongTermLabel("praveen@example.com", "  Nest Egg  ");
    const settings = await getUserSettings("praveen@example.com");
    expect(settings.nav_long_term_label).toBe("Nest Egg");
  });

  it("rejects an empty name", async () => {
    await expect(setUserNavLongTermLabel("praveen@example.com", "   ")).rejects.toThrow();
  });
});

describe("setUserNavScannerLabel", () => {
  it("renames the label, trims whitespace, and rejects an empty name", async () => {
    await setUserNavScannerLabel("praveen@example.com", "  Screener  ");
    expect((await getUserSettings("praveen@example.com")).nav_scanner_label).toBe("Screener");
    await expect(setUserNavScannerLabel("praveen@example.com", "   ")).rejects.toThrow();
  });
});

describe("setUserNavTradingLabel", () => {
  it("renames the label, trims whitespace, and rejects an empty name", async () => {
    await setUserNavTradingLabel("praveen@example.com", "  Active Trading  ");
    expect((await getUserSettings("praveen@example.com")).nav_trading_label).toBe("Active Trading");
    await expect(setUserNavTradingLabel("praveen@example.com", "   ")).rejects.toThrow();
  });
});
