import { getSupabaseServiceClient, isSupabaseConfigured } from "./config";
import { mutateStore, readStore } from "./local-store";
import type { AppSettings, Theme, UserSettingsRow } from "./schema-types";

export async function getAppSettings(): Promise<AppSettings> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase.from("app_settings").select("*").eq("id", 1).single();
    if (error) throw error;
    return data as AppSettings;
  }
  const store = await readStore();
  return store.app_settings;
}

export async function updateSiteName(siteName: string): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { error } = await supabase
      .from("app_settings")
      .update({ site_name: siteName, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw error;
    return;
  }
  await mutateStore((store) => {
    store.app_settings.site_name = siteName;
    store.app_settings.updated_at = new Date().toISOString();
  });
}

const DEFAULT_USER_SETTINGS: Omit<UserSettingsRow, "user_id"> = {
  theme: "dark",
  timezone: "Asia/Kolkata",
  last_seen_alerts_at: null,
  updated_at: new Date(0).toISOString(),
};

export async function getUserSettings(userId: string): Promise<UserSettingsRow> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (data) return data as UserSettingsRow;
    const fresh = { user_id: userId, ...DEFAULT_USER_SETTINGS };
    const { error: insertError } = await supabase.from("user_settings").insert(fresh);
    if (insertError) throw insertError;
    return fresh;
  }

  return mutateStore((store) => {
    const existing = store.user_settings.find((u) => u.user_id === userId);
    if (existing) return existing;
    const fresh: UserSettingsRow = { user_id: userId, ...DEFAULT_USER_SETTINGS };
    store.user_settings.push(fresh);
    return fresh;
  });
}

async function patchUserSettings(
  userId: string,
  patch: Partial<Omit<UserSettingsRow, "user_id">>,
): Promise<void> {
  await getUserSettings(userId); // ensure a row exists
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { error } = await supabase
      .from("user_settings")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    if (error) throw error;
    return;
  }
  await mutateStore((store) => {
    const row = store.user_settings.find((u) => u.user_id === userId);
    if (row) {
      Object.assign(row, patch, { updated_at: new Date().toISOString() });
    }
  });
}

export async function setUserTheme(userId: string, theme: Theme): Promise<void> {
  await patchUserSettings(userId, { theme });
}

/**
 * Returns the cutoff that was in effect *before* this call, then advances
 * `last_seen_alerts_at` to now — matching BRIEF.md §7.1's "New" badge rule:
 * the cutoff stays fixed for the session that first sees it, so call this
 * once per page view, not once per render.
 */
export async function bumpLastSeenAlerts(userId: string): Promise<string | null> {
  const settings = await getUserSettings(userId);
  const previousCutoff = settings.last_seen_alerts_at;
  await patchUserSettings(userId, { last_seen_alerts_at: new Date().toISOString() });
  return previousCutoff;
}
