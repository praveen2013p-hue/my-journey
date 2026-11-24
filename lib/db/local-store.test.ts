import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { beforeEach, describe, expect, it } from "vitest";
import { __resetStoreForTests, mutateStore, readStore } from "./local-store";

const STORE_PATH = path.join(os.tmpdir(), "my-journey-dev-store.json");

beforeEach(async () => {
  await __resetStoreForTests();
});

describe("mutateStore", () => {
  it("does not touch the file on disk when the callback makes no change", async () => {
    // A "find or create, but it already exists" call - the common pattern
    // that caused an infinite dev-server reload loop (regression: the file
    // sits inside the project directory, and an unconditional write on
    // every read-ish call re-triggers Next's file watcher -> Fast Refresh
    // -> another request -> another write -> forever).
    await mutateStore((store) => {
      store.quotes.push({ id: 1, text: "seed", author: null, owner_id: null, active: true, created_at: "x" });
    });
    const before = await fs.stat(STORE_PATH);
    await new Promise((resolve) => setTimeout(resolve, 10));

    await mutateStore((store) => {
      const existing = store.quotes.find((q) => q.id === 1);
      return existing; // read-only: found it, changed nothing
    });

    const after = await fs.stat(STORE_PATH);
    expect(after.mtimeMs).toBe(before.mtimeMs);
  });

  it("does write when the callback actually changes the store", async () => {
    await mutateStore((store) => {
      store.quotes.push({ id: 1, text: "seed", author: null, owner_id: null, active: true, created_at: "x" });
    });
    const before = await fs.stat(STORE_PATH);
    await new Promise((resolve) => setTimeout(resolve, 10));

    await mutateStore((store) => {
      store.quotes[0].text = "changed";
    });

    const after = await fs.stat(STORE_PATH);
    expect(after.mtimeMs).not.toBe(before.mtimeMs);
    const store = await readStore();
    expect(store.quotes[0].text).toBe("changed");
  });
});
