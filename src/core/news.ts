import type { NewsItem, MarketTick } from "./types.js";
import newsFixture from "../data/fixtures/news.json";
import marketFixture from "../data/fixtures/market.json";

export function loadFixtureNews(): NewsItem[] {
  return newsFixture as NewsItem[];
}

export function loadFixtureMarket(): MarketTick[] {
  return marketFixture as MarketTick[];
}

/** Optional live-ish headline fetch — falls back to fixtures. Labeled when mock. */
export async function loadNews(preferFixture = true): Promise<{
  news: NewsItem[];
  source: "fixture" | "remote";
}> {
  if (preferFixture) {
    return { news: loadFixtureNews(), source: "fixture" };
  }
  // Remote news APIs vary; keep fixtures as the reliable demo path.
  return { news: loadFixtureNews(), source: "fixture" };
}
