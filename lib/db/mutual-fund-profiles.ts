/**
 * Repository for `mutual_fund_profiles` - the family-member tree under
 * Mutual Funds (DECISIONS.md): "Self" plus whatever else the user names
 * ("Wife", "Son", ...). Per-user, like strategy_tags.
 */

import { getSupabaseServiceClient, isSupabaseConfigured } from "./config";
import { mutateStore, readStore } from "./local-store";
import type { MutualFundProfileRow } from "./schema-types";

export async function listMutualFundProfiles(userId: string): Promise<MutualFundProfileRow[]> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("mutual_fund_profiles")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data as MutualFundProfileRow[];
  }
  const store = await readStore();
  return store.mutual_fund_profiles
    .filter((p) => p.user_id === userId)
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
}

export async function getMutualFundProfileById(userId: string, id: string): Promise<MutualFundProfileRow | null> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("mutual_fund_profiles")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return (data as MutualFundProfileRow) ?? null;
  }
  const store = await readStore();
  return store.mutual_fund_profiles.find((p) => p.id === id && p.user_id === userId) ?? null;
}

/** Creates a new named profile - fully open, no preset set; rejects an empty name. */
export async function createMutualFundProfile(userId: string, name: string): Promise<MutualFundProfileRow> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Profile name can't be empty.");
  const created_at = new Date().toISOString();

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("mutual_fund_profiles")
      .insert({ user_id: userId, name: trimmed })
      .select()
      .single();
    if (error) throw error;
    return data as MutualFundProfileRow;
  }

  return mutateStore((store) => {
    const row: MutualFundProfileRow = {
      id: crypto.randomUUID(),
      user_id: userId,
      name: trimmed,
      goal_amount: null,
      created_at,
    };
    store.mutual_fund_profiles.push(row);
    return row;
  });
}

/**
 * Sets (or clears, with `null`) this profile's target corpus - purely
 * informational, same pattern as `createMutualFundProfile`'s
 * Supabase-vs-local-store branching. Returns null if the profile doesn't
 * exist or doesn't belong to this user, same "not found" convention as
 * `updateMutualFundEntry`.
 */
export async function setMutualFundProfileGoal(
  userId: string,
  profileId: string,
  goalAmount: number | null,
): Promise<MutualFundProfileRow | null> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("mutual_fund_profiles")
      .update({ goal_amount: goalAmount })
      .eq("id", profileId)
      .eq("user_id", userId)
      .select()
      .maybeSingle();
    if (error) throw error;
    return (data as MutualFundProfileRow) ?? null;
  }

  return mutateStore((store) => {
    const row = store.mutual_fund_profiles.find((p) => p.id === profileId && p.user_id === userId);
    if (!row) return null;
    row.goal_amount = goalAmount;
    return row;
  });
}

/**
 * The user's "Self" profile, creating it if this is their first-ever
 * visit to Mutual Funds (no profiles at all yet) - matches the
 * migration's own intent for existing users, extended to a brand-new one.
 */
export async function ensureSelfProfile(userId: string): Promise<MutualFundProfileRow> {
  const profiles = await listMutualFundProfiles(userId);
  if (profiles.length > 0) return profiles[0];
  return createMutualFundProfile(userId, "Self");
}

/**
 * For the shared layout's sidebar: a brand-new user's very first visit
 * has no profiles yet, and the layout renders independently of (in
 * parallel with) the Mutual Funds page's own `ensureSelfProfile` call -
 * without this, the sidebar's tree could render empty on that first
 * load (self-correcting on the next navigation, but a rough edge worth
 * not having at all). Ensures "Self" exists before listing, so the
 * sidebar is never empty even on the very first visit.
 */
export async function listMutualFundProfilesEnsuringSelf(userId: string): Promise<MutualFundProfileRow[]> {
  await ensureSelfProfile(userId);
  return listMutualFundProfiles(userId);
}
