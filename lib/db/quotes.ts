import { getSupabaseServiceClient, isSupabaseConfigured } from "./config";
import { mutateStore, nextSeq, readStore } from "./local-store";
import type { QuoteRow } from "./schema-types";

export async function listActiveQuotes(): Promise<QuoteRow[]> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase.from("quotes").select("*").eq("active", true);
    if (error) throw error;
    return data as QuoteRow[];
  }
  const store = await readStore();
  return store.quotes.filter((q) => q.active);
}

/** Every quote (active and removed), for the Settings -> quotes manager (BRIEF.md §7.6). */
export async function listAllQuotes(): Promise<QuoteRow[]> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase.from("quotes").select("*").order("id", { ascending: true });
    if (error) throw error;
    return data as QuoteRow[];
  }
  const store = await readStore();
  return [...store.quotes].sort((a, b) => a.id - b.id);
}

export async function updateQuoteText(id: number, text: string, author: string | null): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { error } = await supabase.from("quotes").update({ text, author }).eq("id", id);
    if (error) throw error;
    return;
  }
  await mutateStore((store) => {
    const row = store.quotes.find((q) => q.id === id);
    if (row) {
      row.text = text;
      row.author = author;
    }
  });
}

export async function deleteQuote(id: number): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { error } = await supabase.from("quotes").delete().eq("id", id);
    if (error) throw error;
    return;
  }
  await mutateStore((store) => {
    store.quotes = store.quotes.filter((q) => q.id !== id);
  });
}

export async function addQuote(
  text: string,
  author: string | null,
  ownerId: string | null,
): Promise<QuoteRow> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("quotes")
      .insert({ text, author, owner_id: ownerId, active: true })
      .select()
      .single();
    if (error) throw error;
    return data as QuoteRow;
  }
  return mutateStore((store) => {
    const row: QuoteRow = {
      id: nextSeq(store, "quotes"),
      text,
      author,
      owner_id: ownerId,
      active: true,
      created_at: new Date().toISOString(),
    };
    store.quotes.push(row);
    return row;
  });
}

export async function setQuoteActive(id: number, active: boolean): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { error } = await supabase.from("quotes").update({ active }).eq("id", id);
    if (error) throw error;
    return;
  }
  await mutateStore((store) => {
    const row = store.quotes.find((q) => q.id === id);
    if (row) row.active = active;
  });
}

/** Seeds the starter quote set exactly once (no-op if any quote already exists). */
export async function seedQuotesIfEmpty(
  seed: Array<{ text: string; author: string | null }>,
): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { count, error } = await supabase
      .from("quotes")
      .select("id", { count: "exact", head: true });
    if (error) throw error;
    if (count && count > 0) return;
    const { error: insertError } = await supabase
      .from("quotes")
      .insert(seed.map((q) => ({ text: q.text, author: q.author, active: true })));
    if (insertError) throw insertError;
    return;
  }
  await mutateStore((store) => {
    if (store.quotes.length > 0) return;
    for (const q of seed) {
      store.quotes.push({
        id: nextSeq(store, "quotes"),
        text: q.text,
        author: q.author,
        owner_id: null,
        active: true,
        created_at: new Date().toISOString(),
      });
    }
  });
}
