/**
 * Local dev persistence standing in for Supabase (DECISIONS.md). A single
 * JSON file, read-modify-written through one queue so concurrent requests
 * in `next dev` don't clobber each other. Never used once
 * `isSupabaseConfigured()` is true.
 *
 * Lives under the OS temp directory, not the project folder: Vercel's
 * serverless functions can only write to `/tmp` (the deployed bundle
 * itself is read-only), and `os.tmpdir()` resolves to exactly that in
 * production, while still being an ordinary writable folder in local dev.
 * This is why Supabase is the real answer for anything beyond "look
 * around" on a deployed URL - `/tmp` on Vercel is wiped on every cold
 * start and isn't shared between concurrent instances, so two people (or
 * even two requests) can see different data.
 */

import { promises as fs } from "fs";
import os from "os";
import path from "path";
import type {
  AlertRawRow,
  AlertRow,
  AllowedUserRow,
  AppSettings,
  BackupLogRow,
  HolidayRow,
  MutualFundEntryRow,
  NpsEntryRow,
  PriceHistoryRow,
  ProviderSessionRow,
  QuoteRow,
  SectorConstituentRow,
  SectorMapRow,
  SectorMetricRow,
  SectorSnapshotRow,
  StockNoteRow,
  StrategyTagRow,
  SymbolMapRow,
  TradeRow,
  UserSettingsRow,
  WeeklyReflectionRow,
} from "./schema-types";

const STORE_PATH = path.join(os.tmpdir(), "my-journey-dev-store.json");

export interface DevStoreShape {
  allowed_users: AllowedUserRow[];
  app_settings: AppSettings;
  alerts_raw: AlertRawRow[];
  alerts: AlertRow[];
  sector_snapshots: SectorSnapshotRow[];
  sector_metrics: SectorMetricRow[];
  sector_map: SectorMapRow[];
  sector_constituents: SectorConstituentRow[];
  symbol_map: SymbolMapRow[];
  provider_session: ProviderSessionRow[];
  quotes: QuoteRow[];
  backup_log: BackupLogRow[];
  price_history: PriceHistoryRow[];
  holidays: HolidayRow[];
  user_settings: UserSettingsRow[];
  strategy_tags: StrategyTagRow[];
  trades: TradeRow[];
  mutual_fund_entries: MutualFundEntryRow[];
  nps_entries: NpsEntryRow[];
  stock_notes: StockNoteRow[];
  weekly_reflections: WeeklyReflectionRow[];
  _seq: Record<string, number>;
}

function emptyStore(): DevStoreShape {
  return {
    allowed_users: [],
    app_settings: {
      id: 1,
      site_name: "My Journey",
      bench_in: "NSE:NIFTY_TOTAL_MKT",
      bench_in_sector: "NSE:CNX500",
      bench_us: "SP:SPX",
      bench_us_sector: "SP:SPX",
      updated_at: new Date().toISOString(),
    },
    alerts_raw: [],
    alerts: [],
    sector_snapshots: [],
    sector_metrics: [],
    sector_map: [],
    sector_constituents: [],
    symbol_map: [],
    provider_session: [],
    quotes: [],
    backup_log: [],
    price_history: [],
    holidays: [],
    user_settings: [],
    strategy_tags: [],
    trades: [],
    mutual_fund_entries: [],
    nps_entries: [],
    stock_notes: [],
    weekly_reflections: [],
    _seq: {},
  };
}

async function readStoreFile(): Promise<DevStoreShape> {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    // Merge over emptyStore() so a store written before a new table/field
    // was added still loads instead of crashing on a missing key.
    return { ...emptyStore(), ...parsed };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      const fresh = emptyStore();
      await writeStoreFile(fresh);
      return fresh;
    }
    throw err;
  }
}

async function writeStoreFile(store: DevStoreShape): Promise<void> {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

let queue: Promise<unknown> = Promise.resolve();

/** Read-only access; still queued behind any in-flight write. */
export function readStore(): Promise<DevStoreShape> {
  const task = queue.then(() => readStoreFile());
  queue = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

/**
 * Read-modify-write under the queue. `fn` mutates `store` in place (or
 * returns a value to hand back to the caller); the result is persisted
 * before the next queued operation runs.
 *
 * Skips the actual disk write when `fn` didn't change anything (e.g. a
 * "find or create" call that found an existing row). This matters beyond
 * performance: `data/dev-store.json` sits inside the project directory,
 * so writing it on every request — even read-only "does this exist yet"
 * checks — touches a file Next's dev server watches, which re-triggers a
 * Fast Refresh reload, which re-runs the same request, which writes
 * again: an infinite reload loop. Only a real change should touch the file.
 */
export function mutateStore<T>(
  fn: (store: DevStoreShape) => T,
): Promise<T> {
  const task = queue.then(async () => {
    const store = await readStoreFile();
    const before = JSON.stringify(store);
    const result = fn(store);
    if (JSON.stringify(store) !== before) {
      await writeStoreFile(store);
    }
    return result;
  });
  queue = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

export function nextSeq(store: DevStoreShape, table: string): number {
  store._seq[table] = (store._seq[table] ?? 0) + 1;
  return store._seq[table];
}

/** Test-only: wipe the store back to empty (never call this in app code). */
export async function __resetStoreForTests(): Promise<void> {
  await mutateStore((store) => {
    Object.assign(store, emptyStore());
  });
}
