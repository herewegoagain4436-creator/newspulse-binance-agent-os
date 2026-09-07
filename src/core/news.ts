import type { NewsItem, MarketTick } from "./types.js";
import newsFixture from "../data/fixtures/news.json";
import marketFixture from "../data/fixtures/market.json";
import { envStr } from "./env.js";
import { HARDCODED_UNIVERSE } from "./universe.js";

export function loadFixtureNews(): NewsItem[] {
  return newsFixture as NewsItem[];
}

export function loadFixtureMarket(): MarketTick[] {
  return marketFixture as MarketTick[];
}

export function dataMode(): "fixture" | "live" | "auto" {
  const m = envStr("NEWSPULSE_DATA", "auto").toLowerCase();
  if (m === "fixture" || m === "live" || m === "auto") return m;
  return "auto";
}

/** Live Binance public 24hr tickers (no API key). Falls back to fixtures. */
export async function loadLiveMarket(): Promise<{ market: MarketTick[]; source: "binance-public" | "fixture"; label: string }> {
  try {
      const url = "https://api.binance.com/api/v3/ticker/24hr";
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error("binance " + res.status);
    const all = (await res.json()) as Array<{
      symbol: string; lastPrice: string; priceChangePercent: string; quoteVolume: string;
    }>;
    const bySym = new Map(all.map((r) => [r.symbol, r]));
    const market: MarketTick[] = [];
    const asOf = new Date().toISOString();
    for (const coin of HARDCODED_UNIVERSE) {
      const row = bySym.get(coin.binancePair);
      if (!row) continue;
      market.push({
        symbol: coin.symbol,
        price: Number(row.lastPrice),
        change24hPct: Number(row.priceChangePercent),
        volume24hUsd: Number(row.quoteVolume),
        asOf,
      });
    }
    if (market.length >= 5) {
      return { market, source: "binance-public", label: "LIVE market — Binance public /api/v3/ticker/24hr" };
    }
  } catch (e) {
    return {
      market: loadFixtureMarket(),
      source: "fixture",
      label: "FIXTURE market — live public ticker failed (" + (e instanceof Error ? e.message : String(e)) + ")",
    };
  }
  return { market: loadFixtureMarket(), source: "fixture", label: "FIXTURE market — incomplete live response" };
}

export async function loadNews(preferFixture?: boolean): Promise<{
  news: NewsItem[];
  source: "fixture" | "remote";
  label: string;
}> {
  const mode = dataMode();
  const useFixture = preferFixture === true || mode === "fixture" || (mode === "auto" && preferFixture !== false && envStr("NEWSPULSE_MODE","live") !== "x");
  // News remains fixture-first: no free authenticated news feed wired without secrets.
  // Label clearly so judges see source.
  if (mode === "live") {
    return {
      news: loadFixtureNews(),
      source: "fixture",
      label: "FIXTURE news — no secretless live news wire configured; set NEWSPULSE_DATA=fixture explicitly for brain-only demos",
    };
  }
  return { news: loadFixtureNews(), source: "fixture", label: "FIXTURE news (NEWSPULSE_DATA=" + mode + ")" };
}

export async function loadMarket(): Promise<{ market: MarketTick[]; source: string; label: string }> {
  const mode = dataMode();
  if (mode === "fixture") {
    return { market: loadFixtureMarket(), source: "fixture", label: "FIXTURE market (NEWSPULSE_DATA=fixture)" };
  }
  if (mode === "live" || mode === "auto") {
    return loadLiveMarket();
  }
  return { market: loadFixtureMarket(), source: "fixture", label: "FIXTURE market" };
}

