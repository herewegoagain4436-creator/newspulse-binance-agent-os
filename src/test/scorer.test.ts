import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scoreNews } from "../core/scorer.js";
import type { NewsItem } from "../core/types.js";

describe("scorer", () => {
  it("scores bullish BTC news positive", () => {
    const news: NewsItem[] = [{
      id: "1",
      headline: "Bitcoin ETF inflows hit record as institutional rally continues",
      summary: "Spot bitcoin ETF approval narrative and inflow surge",
      source: "fixture",
      publishedAt: new Date().toISOString(),
      symbols: ["BTC"],
      sentimentHint: 0.6,
    }];
    const scores = scoreNews(news);
    const btc = scores.find((s) => s.symbol === "BTC");
    assert.ok(btc);
    assert.ok(btc!.score > 0);
    assert.ok(btc!.confidence > 0);
  });

  it("scores bearish hack news negative for ETH", () => {
    const news: NewsItem[] = [{
      id: "2",
      headline: "Ethereum DeFi exploit and hack drains bridge liquidity",
      summary: "On-chain exploit investigation ongoing",
      source: "fixture",
      publishedAt: new Date().toISOString(),
      symbols: ["ETH"],
      sentimentHint: -0.7,
    }];
    const scores = scoreNews(news);
    const eth = scores.find((s) => s.symbol === "ETH");
    assert.ok(eth);
    assert.ok(eth!.score < 0);
  });
});

