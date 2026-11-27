/**
 * Repository for `us_trading_capital_entries` - the manual, month-by-month
 * US swing-trading capital tracker, same structural pattern as
 * `lib/db/nps.ts` (DECISIONS.md). Per-user, like trades.
 */

import { getSupabaseServiceClient, isSupabaseConfigured } from "./config";
import { mutateStore, readStore } from "./local-store";
import type { UsTradingCapitalEntryRow } from "./schema-types";

export interface UpsertUsTradingCapitalEntryInput {
  /** yyyy-mm-01 */
  month: string;
  amount_added: number;
  withdrawal: number;
  inr_amount: number | null;
  fx_rate: number | null;
  value_fx_rate: number | null;
  current_value: number;
  notes: string | null;
  negative_amount_note: string | null;
}

export async function listUsTradingCapitalEntries(userId: string): Promise<UsTradingCapitalEntryRow[]> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("us_trading_capital_entries")
      .select("*")
      .eq("user_id", userId)
      .order("month", { ascending: true });
    if (error) throw error;
    return data as UsTradingCapitalEntryRow[];
  }
  const store = await readStore();
  return store.us_trading_capital_entries
    .filter((e) => e.user_id === userId)
    .sort((a, b) => (a.month < b.month ? -1 : 1));
}

export async function getUsTradingCapitalEntryById(userId: string, id: string): Promise<UsTradingCapitalEntryRow | null> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("us_trading_capital_entries")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return (data as UsTradingCapitalEntryRow) ?? null;
  }
  const store = await readStore();
  return store.us_trading_capital_entries.find((e) => e.id === id && e.user_id === userId) ?? null;
}

/**
 * Creates this month's entry, or updates it if one already exists - at
 * most one entry per user per month, enforced by the `unique (user_id,
 * month)` constraint in Supabase too.
 */
export async function upsertUsTradingCapitalEntry(
  userId: string,
  input: UpsertUsTradingCapitalEntryInput,
): Promise<UsTradingCapitalEntryRow> {
  const updated_at = new Date().toISOString();

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("us_trading_capital_entries")
      .upsert(
        { user_id: userId, ...input, updated_at },
        { onConflict: "user_id,month" },
      )
      .select()
      .single();
    if (error) throw error;
    return data as UsTradingCapitalEntryRow;
  }

  return mutateStore((store) => {
    const idx = store.us_trading_capital_entries.findIndex((e) => e.user_id === userId && e.month === input.month);
    if (idx >= 0) {
      const row = { ...store.us_trading_capital_entries[idx], ...input, updated_at };
      store.us_trading_capital_entries[idx] = row;
      return row;
    }
    const row: UsTradingCapitalEntryRow = {
      id: crypto.randomUUID(),
      user_id: userId,
      ...input,
      created_at: updated_at,
      updated_at,
    };
    store.us_trading_capital_entries.push(row);
    return row;
  });
}

export type UsTradingCapitalEntryUpdateInput = Partial<
  Pick<
    UsTradingCapitalEntryRow,
    | "amount_added"
    | "withdrawal"
    | "inr_amount"
    | "fx_rate"
    | "value_fx_rate"
    | "current_value"
    | "notes"
    | "negative_amount_note"
  >
>;

export async function updateUsTradingCapitalEntry(
  userId: string,
  id: string,
  input: UsTradingCapitalEntryUpdateInput,
): Promise<UsTradingCapitalEntryRow | null> {
  const updated_at = new Date().toISOString();

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("us_trading_capital_entries")
      .update({ ...input, updated_at })
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .maybeSingle();
    if (error) throw error;
    return (data as UsTradingCapitalEntryRow) ?? null;
  }

  return mutateStore((store) => {
    const row = store.us_trading_capital_entries.find((e) => e.id === id && e.user_id === userId);
    if (!row) return null;
    Object.assign(row, input, { updated_at });
    return row;
  });
}

export async function deleteUsTradingCapitalEntry(userId: string, id: string): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { error } = await supabase.from("us_trading_capital_entries").delete().eq("id", id).eq("user_id", userId);
    if (error) throw error;
    return;
  }
  await mutateStore((store) => {
    store.us_trading_capital_entries = store.us_trading_capital_entries.filter(
      (e) => !(e.id === id && e.user_id === userId),
    );
  });
}
