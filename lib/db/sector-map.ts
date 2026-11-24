import type { SectorMapSeed } from "../sector-map-seed";
import { getSupabaseServiceClient, isSupabaseConfigured } from "./config";
import { mutateStore, nextSeq, readStore } from "./local-store";
import type { Market, SectorMapRow } from "./schema-types";

export async function seedSectorMapIfEmpty(seed: SectorMapSeed[]): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { count, error } = await supabase
      .from("sector_map")
      .select("id", { count: "exact", head: true });
    if (error) throw error;
    if (count && count > 0) return;
    const { error: insertError } = await supabase
      .from("sector_map")
      .insert(seed.map((s) => ({ ...s, provider_symbol: s.tv_symbol })));
    if (insertError) throw insertError;
    return;
  }

  await mutateStore((store) => {
    if (store.sector_map.length > 0) return;
    for (const s of seed) {
      store.sector_map.push({
        id: nextSeq(store, "sector_map"),
        market: s.market,
        display_name: s.display_name,
        tv_symbol: s.tv_symbol,
        provider_symbol: s.tv_symbol,
        kind: s.kind,
      });
    }
  });
}

export async function listSectorMap(market: Market): Promise<SectorMapRow[]> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase.from("sector_map").select("*").eq("market", market);
    if (error) throw error;
    return data as SectorMapRow[];
  }
  const store = await readStore();
  return store.sector_map.filter((s) => s.market === market);
}

export async function getSectorMapEntry(
  market: Market,
  displayName: string,
): Promise<SectorMapRow | null> {
  const rows = await listSectorMap(market);
  return rows.find((s) => s.display_name === displayName) ?? null;
}

/** Sectors with no confirmed TradingView/provider symbol yet - shown in Settings (BRIEF.md §5c). */
export async function listUnresolvedSectors(market?: Market): Promise<SectorMapRow[]> {
  const rows = isSupabaseConfigured()
    ? await (async () => {
        const supabase = getSupabaseServiceClient();
        let query = supabase.from("sector_map").select("*").is("tv_symbol", null);
        if (market) query = query.eq("market", market);
        const { data, error } = await query;
        if (error) throw error;
        return data as SectorMapRow[];
      })()
    : (await readStore()).sector_map.filter((s) => s.tv_symbol === null && (!market || s.market === market));
  return rows;
}
