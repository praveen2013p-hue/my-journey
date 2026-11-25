/**
 * Repository for `mutual_fund_entries` - the manual, month-by-month
 * mutual fund tracker that replaces the user's Google Sheet
 * (DECISIONS.md). Per-user, like trades.
 */

import { getSupabaseServiceClient, isSupabaseConfigured } from "./config";
import { mutateStore, readStore } from "./local-store";
import type { MutualFundEntryRow } from "./schema-types";

export interface UpsertMutualFundEntryInput {
  /** yyyy-mm-01 */
  month: string;
  amount_added: number;
  withdrawal: number;
  planned_amount: number | null;
  current_value: number;
  notes: string | null;
}

export async function listMutualFundEntries(userId: string): Promise<MutualFundEntryRow[]> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("mutual_fund_entries")
      .select("*")
      .eq("user_id", userId)
      .order("month", { ascending: true });
    if (error) throw error;
    return data as MutualFundEntryRow[];
  }
  const store = await readStore();
  return store.mutual_fund_entries
    .filter((e) => e.user_id === userId)
    .sort((a, b) => (a.month < b.month ? -1 : 1));
}

export async function getMutualFundEntryById(userId: string, id: string): Promise<MutualFundEntryRow | null> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("mutual_fund_entries")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return (data as MutualFundEntryRow) ?? null;
  }
  const store = await readStore();
  return store.mutual_fund_entries.find((e) => e.id === id && e.user_id === userId) ?? null;
}

/**
 * Creates this month's entry, or updates it if one already exists - at
 * most one entry per user per month (BRIEF-style invariant, enforced by
 * the `unique (user_id, month)` constraint in Supabase too).
 */
export async function upsertMutualFundEntry(
  userId: string,
  input: UpsertMutualFundEntryInput,
): Promise<MutualFundEntryRow> {
  const updated_at = new Date().toISOString();

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("mutual_fund_entries")
      .upsert(
        { user_id: userId, ...input, updated_at },
        { onConflict: "user_id,month" },
      )
      .select()
      .single();
    if (error) throw error;
    return data as MutualFundEntryRow;
  }

  return mutateStore((store) => {
    const idx = store.mutual_fund_entries.findIndex((e) => e.user_id === userId && e.month === input.month);
    if (idx >= 0) {
      const row = { ...store.mutual_fund_entries[idx], ...input, updated_at };
      store.mutual_fund_entries[idx] = row;
      return row;
    }
    const row: MutualFundEntryRow = {
      id: crypto.randomUUID(),
      user_id: userId,
      ...input,
      created_at: updated_at,
      updated_at,
    };
    store.mutual_fund_entries.push(row);
    return row;
  });
}

export type MutualFundEntryUpdateInput = Partial<
  Pick<MutualFundEntryRow, "amount_added" | "withdrawal" | "planned_amount" | "current_value" | "notes">
>;

export async function updateMutualFundEntry(
  userId: string,
  id: string,
  input: MutualFundEntryUpdateInput,
): Promise<MutualFundEntryRow | null> {
  const updated_at = new Date().toISOString();

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("mutual_fund_entries")
      .update({ ...input, updated_at })
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .maybeSingle();
    if (error) throw error;
    return (data as MutualFundEntryRow) ?? null;
  }

  return mutateStore((store) => {
    const row = store.mutual_fund_entries.find((e) => e.id === id && e.user_id === userId);
    if (!row) return null;
    Object.assign(row, input, { updated_at });
    return row;
  });
}

export async function deleteMutualFundEntry(userId: string, id: string): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { error } = await supabase.from("mutual_fund_entries").delete().eq("id", id).eq("user_id", userId);
    if (error) throw error;
    return;
  }
  await mutateStore((store) => {
    store.mutual_fund_entries = store.mutual_fund_entries.filter((e) => !(e.id === id && e.user_id === userId));
  });
}
