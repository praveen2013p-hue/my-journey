/**
 * Maps the mock session's email to a real Supabase Auth user id.
 *
 * Every per-user table (`trades`, `strategy_tags`, `user_settings`,
 * `stock_notes`, `weekly_reflections`) has `user_id uuid references
 * auth.users (id)` - a real foreign key. The mock-auth session (still in
 * use until real Google sign-in is wired up) only has an email string, not
 * a UUID, so inserting `user_id: email` would fail outright the moment
 * Supabase is connected.
 *
 * Instead: look up (or lazily create, `email_confirm: true`, no password)
 * an `auth.users` row for that email via the service-role admin API, and
 * use its real id. This keeps "pick your account" working exactly as
 * before while making every per-user table Supabase-compatible right now,
 * without waiting on full Google OAuth. When real Google sign-in is wired
 * up later, signing in with the same email is expected to link to this
 * same row (Supabase matches existing users by email by default) - worth
 * re-confirming at that point, not assumed here.
 */

import { getSupabaseServiceClient, isSupabaseConfigured } from "../db/config";

const cache = new Map<string, string>();

export async function resolveSupabaseUserId(email: string): Promise<string> {
  if (!isSupabaseConfigured()) return email;

  const cached = cache.get(email);
  if (cached) return cached;

  const supabase = getSupabaseServiceClient();

  const { data: list, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) throw listError;
  let user = list.users.find((u) => u.email === email);

  if (!user) {
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    if (createError) throw createError;
    user = created.user;
  }

  cache.set(email, user.id);
  return user.id;
}
