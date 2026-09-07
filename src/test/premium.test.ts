import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  shouldBuyPremiumSignal,
  buildPremiumHonestyBanner,
  detectConflictingHeadlines,
} from "../core/premiumSignal.js";
import type { NewsItem, SymbolScore } from "../core/types.js";

describe("premium decision", () => {
  it("detects conflicting headlines", () => {
    const news: NewsItem[] = [
      { id: "a", headline: "BTC rally and inflow surge", summary: "bullish", source: "f", publishedAt: "", symbols: ["BTC"], sentimentHint: 0.5 },
      { id: "b", headline: "BTC crash sell-off and outflow", summary: "bearish", source: "f", publishedAt: "", symbols: ["BTC"], sentimentHint: -0.5 },
    ];
    assert.deepEqual(detectConflictingHeadlines(news), ["BTC"]);
  });

  it("buys premium on conflicts", () => {
    const news: NewsItem[] = [
      { id: "a", headline: "ETH partnership upgrade", summary: "", source: "f", publishedAt: "", symbols: ["ETH"], sentimentHint: 0.4 },
      { id: "b", headline: "ETH exploit hack lawsuit", summary: "", source: "f", publishedAt: "", symbols: ["ETH"], sentimentHint: -0.4 },
    ];
    const scores: SymbolScore[] = [{ symbol: "ETH", score: 0.1, confidence: 0.3, reasons: [], newsIds: ["a","b"] }];
    const d = shouldBuyPremiumSignal(scores, news);
    assert.equal(d.buy, true);
  });

  it("honesty banner never claims live paid on PENDING", () => {
    const b = buildPremiumHonestyBanner({
      paymentStatus: "PENDING",
      contentApplied: false,
      contentKind: "none",
      trulyPaid: false,
      notionalUsd: 2,
    });
    assert.match(b, /NOT paid/i);
    assert.doesNotMatch(b, /\bPAID fill\b/i);
  });
});

