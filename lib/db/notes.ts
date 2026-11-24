import { getSupabaseServiceClient, isSupabaseConfigured } from "./config";
import { mutateStore, readStore } from "./local-store";
import type { Market } from "./schema-types";

export async function getStockNote(userId: string, market: Market, ticker: string): Promise<string> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("stock_notes")
      .select("note")
      .eq("user_id", userId)
      .eq("market", market)
      .eq("ticker", ticker)
      .maybeSingle();
    if (error) throw error;
    return data?.note ?? "";
  }
  const store = await readStore();
  const row = store.stock_notes.find(
    (n) => n.user_id === userId && n.market === market && n.ticker === ticker,
  );
  return row?.note ?? "";
}

export async function saveStockNote(
  userId: string,
  market: Market,
  ticker: string,
  note: string,
): Promise<void> {
  const updated_at = new Date().toISOString();
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { error } = await supabase
      .from("stock_notes")
      .upsert({ user_id: userId, market, ticker, note, updated_at }, { onConflict: "user_id,market,ticker" });
    if (error) throw error;
    return;
  }
  await mutateStore((store) => {
    const row = store.stock_notes.find(
      (n) => n.user_id === userId && n.market === market && n.ticker === ticker,
    );
    if (row) {
      row.note = note;
      row.updated_at = updated_at;
    } else {
      store.stock_notes.push({ user_id: userId, market, ticker, note, updated_at });
    }
  });
}
