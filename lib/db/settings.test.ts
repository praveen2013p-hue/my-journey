import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { beforeEach, describe, expect, it } from "vitest";
import { __resetStoreForTests } from "./local-store";
import { getUserSettings } from "./settings";

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
});
