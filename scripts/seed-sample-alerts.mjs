#!/usr/bin/env node
/**
 * Posts a handful of sample TradingView-style alerts to the webhook, so you
 * can see the Breakouts/Pullbacks pages populated without waiting for a
 * real Friday close. Matches the payload shapes in BRIEF.md section 5.
 *
 * Usage:
 *   WEBHOOK_SECRET=your-secret node scripts/seed-sample-alerts.mjs
 *   BASE_URL=https://your-app.vercel.app WEBHOOK_SECRET=... node scripts/seed-sample-alerts.mjs
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET = process.env.WEBHOOK_SECRET;

if (!SECRET) {
  console.error("Set WEBHOOK_SECRET to the same value your app's .env.local uses, then re-run this.");
  process.exit(1);
}

const stockAlerts = [
  { ticker: "BANKBARODA", exchange: "NSE", price: "248.40", open: "240.00", high: "256.00", low: "238.00", volume: "18200000", signal: "Weinstein Stage 2 breakout", grade: "A", breakoutLevel: "239.80", volRatio: "2.4", rs: "8.1", pctAboveMA: "11.2", overheadPct: "0", sector: "Finance", industry: "PSU Bank" },
  { ticker: "SBIN", exchange: "NSE", price: "812.50", open: "790.10", high: "818.90", low: "788.00", volume: "54231000", signal: "Weinstein Stage 2 breakout", grade: "A", breakoutLevel: "801.40", volRatio: "2.31", rs: "6.4", pctAboveMA: "9.8", overheadPct: "0", sector: "Finance", industry: "PSU Bank" },
  { ticker: "AXISBANK", exchange: "NSE", price: "1184.00", open: "1170", high: "1190", low: "1165", volume: "8200000", signal: "Weinstein Stage 2 breakout", grade: "B", breakoutLevel: "1150.00", volRatio: "1.7", rs: "3.2", pctAboveMA: "5.1", overheadPct: "0", sector: "Finance", industry: "Pvt Bank" },
  { ticker: "KALYANKJIL", exchange: "NSE", price: "566.00", open: "540", high: "570", low: "535", volume: "3100000", signal: "Weinstein Stage 2 breakout", grade: "A", breakoutLevel: "520.00", volRatio: "2.6", rs: "11.3", pctAboveMA: "24.0", overheadPct: "0", sector: "Consumer", industry: "Jewellery", roe: "18.2", debtToEquity: "0.4", salesGrowthYoY: "22.5", epsGrowthYoY: "26.1" },
  { ticker: "LICHSGFIN", exchange: "NSE", price: "612.00", open: "615", high: "620", low: "605", volume: "1900000", signal: "Weinstein Stage 2 breakout", grade: "C", breakoutLevel: "600.00", volRatio: "1.4", rs: "-1.2", pctAboveMA: "-3.0", overheadPct: "8", sector: "Finance", industry: "Housing" },
  { ticker: "AAPL", exchange: "NASDAQ", price: "255.30", open: "250", high: "257", low: "248", volume: "42000000", signal: "Weinstein Stage 2 breakout", grade: "A", breakoutLevel: "248.00", volRatio: "1.9", rs: "5.5", pctAboveMA: "7.0", overheadPct: "0", sector: "Technology", industry: "Hardware", time: "2026-11-21 02:30" },
  { ticker: "SBIN", exchange: "NSE", price: "826.00", open: "812", high: "830", low: "805", volume: "21000000", signal: "Weinstein Stage 2 pullback", grade: "A", breakoutLevel: "801.40", volRatio: "1.1", rs: "7.0", pctAboveMA: "8.5", overheadPct: "0", sector: "Finance", industry: "PSU Bank", week: "next" },
];

const sectorBoard = {
  type: "sectorBoard",
  week: "2026-11-16",
  sent: "2026-11-20 15:50",
  bench: "NSE:CNX500",
  market: "IN",
  s1: 3, s2: 9, s3: 8, s4: 8,
  rows: [
    { rank: 1, sector: "PSU Bank", stage: 2, rs: 12.4, rsUp: true, vsMA: 15.2, chg4: 6.1, focus: true },
    { rank: 2, sector: "Capital Markets", stage: 2, rs: 11.6, rsUp: true, vsMA: 13.5, chg4: 5.2, focus: true },
  ],
};

async function post(body) {
  const res = await fetch(`${BASE_URL}/api/webhooks/tradingview`, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(body),
  });
  const label = body.ticker ?? body.type;
  console.log(`${res.status} ${label}`);
}

for (const alert of stockAlerts) {
  const time = alert.time ?? (alert.week === "next" ? "2026-11-27 15:45" : "2026-11-20 15:45");
  const { week: _week, ...rest } = alert;
  await post({ secret: SECRET, type: "stage2", interval: "W", time, ...rest });
}
await post({ secret: SECRET, ...sectorBoard });

console.log("\nDone. Open the app and check Breakouts, Pullbacks, and Settings -> Alert health.");
