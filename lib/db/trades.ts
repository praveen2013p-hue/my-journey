/**
 * Repository for `trades` (BRIEF.md §7.4). Per-user: Praveen and his wife
 * each see only their own trades (RLS `user_id = auth.uid()`; for the
 * mock session `user_id` is just the signed-in email, DECISIONS.md).
 */

import { getSupabaseServiceClient, isSupabaseConfigured } from "./config";
import { mutateStore, readStore } from "./local-store";
import type { Market, TradeRow } from "./schema-types";

export interface NewTradeInput {
  market: Market;
  ticker: string;
  buy_date: string;
  quantity: number;
  buy_price: number;
  sell_date: string | null;
  sell_price: number | null;
  strategy_tag_id: string | null;
  alert_id: string | null;
}

export type TradeUpdateInput = Partial<
  Pick<
    TradeRow,
    "quantity" | "buy_date" | "buy_price" | "sell_date" | "sell_price" | "strategy_tag_id"
  >
>;

export async function listTrades(userId: string, market?: Market): Promise<TradeRow[]> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    let query = supabase.from("trades").select("*").eq("user_id", userId);
    if (market) query = query.eq("market", market);
    const { data, error } = await query.order("buy_date", { ascending: false });
    if (error) throw error;
    return data as TradeRow[];
  }
  const store = await readStore();
  return store.trades
    .filter((t) => t.user_id === userId && (!market || t.market === market))
    .sort((a, b) => (a.buy_date < b.buy_date ? 1 : -1));
}

export async function getTradeById(userId: string, id: string): Promise<TradeRow | null> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("trades")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return (data as TradeRow) ?? null;
  }
  const store = await readStore();
  return store.trades.find((t) => t.id === id && t.user_id === userId) ?? null;
}

export async function createTrade(userId: string, input: NewTradeInput): Promise<TradeRow> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("trades")
      .insert({ ...input, user_id: userId })
      .select()
      .single();
    if (error) throw error;
    return data as TradeRow;
  }
  return mutateStore((store) => {
    const row: TradeRow = {
      id: crypto.randomUUID(),
      user_id: userId,
      market: input.market,
      ticker: input.ticker,
      buy_date: input.buy_date,
      quantity: input.quantity,
      buy_price: input.buy_price,
      sell_date: input.sell_date,
      sell_price: input.sell_price,
      strategy_tag_id: input.strategy_tag_id,
      alert_id: input.alert_id,
      created_at: new Date().toISOString(),
    };
    store.trades.push(row);
    return row;
  });
}

export async function updateTrade(
  userId: string,
  id: string,
  input: TradeUpdateInput,
): Promise<TradeRow | null> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from("trades")
      .update(input)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .maybeSingle();
    if (error) throw error;
    return (data as TradeRow) ?? null;
  }
  return mutateStore((store) => {
    const row = store.trades.find((t) => t.id === id && t.user_id === userId);
    if (!row) return null;
    Object.assign(row, input);
    return row;
  });
}

export async function deleteTrade(userId: string, id: string): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { error } = await supabase.from("trades").delete().eq("id", id).eq("user_id", userId);
    if (error) throw error;
    return;
  }
  await mutateStore((store) => {
    store.trades = store.trades.filter((t) => !(t.id === id && t.user_id === userId));
  });
}
