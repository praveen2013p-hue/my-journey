"use client";

/** BRIEF.md §14.1: opens in a NEW tab, in the user's own signed-in TradingView. */
export function tradingViewUrl(exchange: string, ticker: string): string {
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(exchange)}%3A${encodeURIComponent(ticker)}`;
}

export function TradingViewLink({
  exchange,
  ticker,
  className,
  stopPropagation = true,
}: {
  exchange: string;
  ticker: string;
  className?: string;
  stopPropagation?: boolean;
}) {
  return (
    <a
      href={tradingViewUrl(exchange, ticker)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open ${ticker} chart in TradingView`}
      onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
      className={`inline-flex items-center gap-1 font-semibold text-gold-light hover:text-gold-hover hover:underline ${className ?? ""}`}
    >
      {ticker} <span aria-hidden="true">↗</span>
    </a>
  );
}
