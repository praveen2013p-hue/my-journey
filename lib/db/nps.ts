/**
 * Repository for `nps_entries` - the manual, month-by-month NPS
 * (National Pension System) tracker, same structural pattern as
 * `lib/db/mutual-funds.ts` (DECISIONS.md). Per-user, like trades.
 */

import { getSupabaseServiceClient, isSupabaseConfigured } from "./config";
import { mutateStore, readStore } from "./local-store";
import type { NpsEntryRow } from "./schema-types";

export interface UpsertNpsEntryInput {
  /** yyyy-mm-01 */
  month: string;
  amount_added: number;
  sip_amount: number | null;
  lumpsum_amount: number | null;
  stp_amount: number | null;
  other_amount: number | null;
  withdrawal: number;
  planned_amount: number | null;
  current_value: number;
  notes: string | null;
  negative_amount_note: string | null;
}

export async function listNpsEntries(userId: string): Promise<NpsEntryRow[]> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("nps_entries")
      .select("*")
      .eq("user_id", userId)
      .order("month", { ascending: true });
    if (error) throw error;
    return data as NpsEntryRow[];
  }
  const store = await readStore();
  return store.nps_entries
    .filter((e) => e.user_id === userId)
    .sort((a, b) => (a.month < b.month ? -1 : 1));
}

export async function getNpsEntryById(userId: string, id: string): Promise<NpsEntryRow | null> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("nps_entries")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return (data as NpsEntryRow) ?? null;
  }
  const store = await readStore();
  return store.nps_entries.find((e) => e.id === id && e.user_id === userId) ?? null;
}

/**
 * Creates this month's entry, or updates it if one already exists - at
 * most one entry per user per month, enforced by the `unique (user_id,
 * month)` constraint in Supabase too.
 */
export async function upsertNpsEntry(
  userId: string,
  input: UpsertNpsEntryInput,
): Promise<NpsEntryRow> {
  const updated_at = new Date().toISOString();

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("nps_entries")
      .upsert(
        { user_id: userId, ...input, updated_at },
        { onConflict: "user_id,month" },
      )
      .select()
      .single();
    if (error) throw error;
    return data as NpsEntryRow;
  }

  return mutateStore((store) => {
    const idx = store.nps_entries.findIndex((e) => e.user_id === userId && e.month === input.month);
    if (idx >= 0) {
      const row = { ...store.nps_entries[idx], ...input, updated_at };
      store.nps_entries[idx] = row;
      return row;
    }
    const row: NpsEntryRow = {
      id: crypto.randomUUID(),
      user_id: userId,
      ...input,
      created_at: updated_at,
      updated_at,
    };
    store.nps_entries.push(row);
    return row;
  });
}

export type NpsEntryUpdateInput = Partial<
  Pick<
    NpsEntryRow,
    | "amount_added"
    | "sip_amount"
    | "lumpsum_amount"
    | "stp_amount"
    | "other_amount"
    | "withdrawal"
    | "planned_amount"
    | "current_value"
    | "notes"
    | "negative_amount_note"
  >
>;

export async function updateNpsEntry(
  userId: string,
  id: string,
  input: NpsEntryUpdateInput,
): Promise<NpsEntryRow | null> {
  const updated_at = new Date().toISOString();

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("nps_entries")
      .update({ ...input, updated_at })
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .maybeSingle();
    if (error) throw error;
    return (data as NpsEntryRow) ?? null;
  }

  return mutateStore((store) => {
    const row = store.nps_entries.find((e) => e.id === id && e.user_id === userId);
    if (!row) return null;
    Object.assign(row, input, { updated_at });
    return row;
  });
}

export async function deleteNpsEntry(userId: string, id: string): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { error } = await supabase.from("nps_entries").delete().eq("id", id).eq("user_id", userId);
    if (error) throw error;
    return;
  }
  await mutateStore((store) => {
    store.nps_entries = store.nps_entries.filter((e) => !(e.id === id && e.user_id === userId));
  });
}
