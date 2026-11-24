/**
 * Repository for `weekly_reflections` - the Weekly Review page's free-text
 * "My reflection" box, saved per user per week (BRIEF.md §7.5).
 */

import { getSupabaseServiceClient, isSupabaseConfigured } from "./config";
import { mutateStore, readStore } from "./local-store";

export async function getWeeklyReflection(userId: string, weekEnding: string): Promise<string> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("weekly_reflections")
      .select("text")
      .eq("user_id", userId)
      .eq("week_ending", weekEnding)
      .maybeSingle();
    if (error) throw error;
    return data?.text ?? "";
  }
  const store = await readStore();
  const row = store.weekly_reflections.find((r) => r.user_id === userId && r.week_ending === weekEnding);
  return row?.text ?? "";
}

export async function saveWeeklyReflection(userId: string, weekEnding: string, text: string): Promise<void> {
  const updated_at = new Date().toISOString();
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { error } = await supabase
      .from("weekly_reflections")
      .upsert({ user_id: userId, week_ending: weekEnding, text, updated_at }, { onConflict: "user_id,week_ending" });
    if (error) throw error;
    return;
  }
  await mutateStore((store) => {
    const row = store.weekly_reflections.find((r) => r.user_id === userId && r.week_ending === weekEnding);
    if (row) {
      row.text = text;
      row.updated_at = updated_at;
    } else {
      store.weekly_reflections.push({ user_id: userId, week_ending: weekEnding, text, updated_at });
    }
  });
}
