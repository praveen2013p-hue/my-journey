/**
 * Repository for `strategy_tags` (BRIEF.md §7.4: "pick or type to create").
 * Per-user — each person's tags are their own, same as `trades`.
 */

import { getSupabaseServiceClient, isSupabaseConfigured } from "./config";
import { mutateStore, readStore } from "./local-store";
import type { StrategyTagRow } from "./schema-types";

export async function listStrategyTags(userId: string): Promise<StrategyTagRow[]> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("strategy_tags")
      .select("*")
      .eq("user_id", userId)
      .order("name", { ascending: true });
    if (error) throw error;
    return data as StrategyTagRow[];
  }
  const store = await readStore();
  return store.strategy_tags
    .filter((t) => t.user_id === userId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Finds a tag by exact (case-insensitive) name, or creates it - the "pick or type to create" UI needs both. */
export async function findOrCreateStrategyTag(userId: string, name: string): Promise<StrategyTagRow> {
  const trimmed = name.trim();

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data: existing, error: lookupError } = await supabase
      .from("strategy_tags")
      .select("*")
      .eq("user_id", userId)
      .ilike("name", trimmed)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) return existing as StrategyTagRow;

    const { data, error } = await supabase
      .from("strategy_tags")
      .insert({ user_id: userId, name: trimmed })
      .select()
      .single();
    if (error) throw error;
    return data as StrategyTagRow;
  }

  return mutateStore((store) => {
    const existing = store.strategy_tags.find(
      (t) => t.user_id === userId && t.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (existing) return existing;

    const row: StrategyTagRow = {
      id: crypto.randomUUID(),
      user_id: userId,
      name: trimmed,
      created_at: new Date().toISOString(),
    };
    store.strategy_tags.push(row);
    return row;
  });
}

export async function renameStrategyTag(userId: string, id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { error } = await supabase
      .from("strategy_tags")
      .update({ name: trimmed })
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw error;
    return;
  }
  await mutateStore((store) => {
    const row = store.strategy_tags.find((t) => t.id === id && t.user_id === userId);
    if (row) row.name = trimmed;
  });
}

/** Deletes the tag; trades referencing it keep their row with `strategy_tag_id` set to null (schema's `on delete set null`). */
export async function deleteStrategyTag(userId: string, id: string): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { error } = await supabase.from("strategy_tags").delete().eq("id", id).eq("user_id", userId);
    if (error) throw error;
    return;
  }
  await mutateStore((store) => {
    store.strategy_tags = store.strategy_tags.filter((t) => !(t.id === id && t.user_id === userId));
    for (const trade of store.trades) {
      if (trade.strategy_tag_id === id) trade.strategy_tag_id = null;
    }
  });
}
