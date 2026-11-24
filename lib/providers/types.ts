/**
 * BRIEF.md §10/§21 (implicit): every data source sits behind this
 * interface so India (Kite, later) and US (Yahoo) and the mock stand-in
 * are interchangeable to the rest of the app. Never place orders through
 * any implementation of this — it is read-only by design.
 */

export interface ProviderQuote {
  symbol: string;
  price: number;
  previousClose: number | null;
  /** Server time the quote was fetched, ISO. */
  asOf: string;
  /** True for data known to lag the real market (e.g. Yahoo's ~15 min US delay). */
  delayed: boolean;
}

export interface WeeklyBar {
  weekEnding: string; // yyyy-mm-dd, Friday
  close: number;
  volume: number;
}

export interface DailyBar {
  date: string; // yyyy-mm-dd
  close: number;
}

export interface MarketDataProvider {
  readonly name: string;
  /** Batched quote fetch; failed/unknown symbols are simply absent from the result, never thrown. */
  getQuotes(symbols: string[]): Promise<Map<string, ProviderQuote>>;
  /** Weekly closes, oldest first, for the Weinstein calculations and the weekly chart. */
  getWeeklyHistory(symbol: string, weeks: number): Promise<WeeklyBar[]>;
  /**
   * Daily closes, oldest first, for the Performance page's "if I had
   * held" and shortlist return/drawdown stats (BRIEF.md §15). Never
   * throws - an empty array means "couldn't fetch right now," not "no
   * history exists."
   */
  getDailyHistory(symbol: string, fromDate: string, toDate: string): Promise<DailyBar[]>;
}
