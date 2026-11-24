import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Tests that exercise the local dev store (lib/db/local-store.ts) share
    // one file on disk (data/dev-store.json), matching how a single dev
    // server process would use it. Running test files in parallel workers
    // makes two files race on that one file; running them serially avoids
    // it without adding a mutex this dev-only store doesn't otherwise need.
    fileParallelism: false,
  },
});
