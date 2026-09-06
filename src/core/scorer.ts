/**
 * Explainable news → per-symbol score.
 * Combines keyword lexicon, explicit tags, and optional sentiment hints.
 */
import type { NewsItem, SymbolId, SymbolScore } from "./types.js";
import { SYMBOLS } from "./universe.js";

const BULLISH = [
  "etf approval",
  "etf inflows",
  "partnership",
  "upgrade",
  "mainnet",
  "adoption",
  "rally",
  "all-time high",
  "ath",
  "institutional",
  "staking rewards",
  "bullish",
  "breakthrough",
  "integration",
  "record volume",
  "buyback",
  "listing",
  "surge",
  "inflow",
];

const BEARISH = [
  "hack",
  "exploit",
  "sec charges",
  "lawsuit",
  "ban",
  "outflow",
  "crash",
  "liquidation",
  "bearish",
  "delisting",
  "outage",
  "vulnerability",
  "fraud",
  "investigation",
  "sell-off",
  "selloff",
  "downtime",
  "breach",
  "fine",
];

/** Extra keyword → symbol mapping beyond explicit tags */
const SYMBOL_KEYWORDS: Record<SymbolId, string[]> = {
  BTC: ["bitcoin", "btc", "satoshi"],
  ETH: ["ethereum", "eth", "vitalik", "solidity"],
  BNB: ["bnb", "binance coin", "bsc", "bnb chain"],
  SOL: ["solana", "sol", "phantom"],
  XRP: ["xrp", "ripple", "rlusd"],
  DOGE: ["dogecoin", "doge", "elon"],
  ADA: ["cardano", "ada", "hoskinson"],
  TRX: ["tron", "trx", "justin sun"],
  AVAX: ["avalanche", "avax", "subnet"],
  LINK: ["chainlink", "link", "ccip", "oracle"],
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function textOf(n: NewsItem): string {
  return `${n.headline} ${n.summary}`.toLowerCase();
}

function lexiconScore(text: string): { score: number; hits: string[] } {
  const hits: string[] = [];
  let raw = 0;
  for (const p of BULLISH) {
    if (text.includes(p)) {
      raw += 0.22;
      hits.push(`+${p}`);
    }
  }
  for (const p of BEARISH) {
    if (text.includes(p)) {
      raw -= 0.28;
      hits.push(`-${p}`);
    }
  }
  return { score: clamp(raw, -1, 1), hits };
}

function keywordHit(text: string, kw: string): boolean {
  // Avoid substring traps (e.g. "tron" inside "strong")
  const re = new RegExp(`(?:^|[^a-z0-9])${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[^a-z0-9]|$)`, "i");
  return re.test(text);
}

function symbolsForNews(n: NewsItem): SymbolId[] {
  const set = new Set<SymbolId>(n.symbols);
  const text = textOf(n);
  for (const sym of SYMBOLS) {
    for (const kw of SYMBOL_KEYWORDS[sym]) {
      if (keywordHit(text, kw)) set.add(sym);
    }
  }
  return [...set];
}

export function scoreNews(news: NewsItem[]): SymbolScore[] {
  const acc: Record<
    SymbolId,
    { scoreSum: number; weight: number; reasons: string[]; newsIds: string[] }
  > = {} as never;

  for (const sym of SYMBOLS) {
    acc[sym] = { scoreSum: 0, weight: 0, reasons: [], newsIds: [] };
  }

  for (const item of news) {
    const text = textOf(item);
    const { score: lex, hits } = lexiconScore(text);
    const hint = item.sentimentHint;
    const blended =
      hint != null ? clamp(lex * 0.45 + hint * 0.55, -1, 1) : lex;
    const conf = clamp(0.35 + Math.abs(blended) * 0.5 + hits.length * 0.05, 0, 1);
    const affected = symbolsForNews(item);
    if (affected.length === 0) continue;

    for (const sym of affected) {
      const w = conf;
      acc[sym].scoreSum += blended * w;
      acc[sym].weight += w;
      acc[sym].newsIds.push(item.id);
      const dir = blended >= 0 ? "bullish" : "bearish";
      acc[sym].reasons.push(
        `${item.id}: ${dir} ${(blended * 100).toFixed(0)}% — ${item.headline.slice(0, 80)}${
          hits.length ? ` [${hits.slice(0, 3).join(", ")}]` : ""
        }`
      );
    }
  }

  return SYMBOLS.map((symbol) => {
    const a = acc[symbol];
    const score = a.weight > 0 ? clamp(a.scoreSum / a.weight, -1, 1) : 0;
    const confidence = a.weight > 0 ? clamp(a.weight / (a.weight + 0.5), 0, 1) : 0;
    return {
      symbol,
      score: Number(score.toFixed(4)),
      confidence: Number(confidence.toFixed(4)),
      reasons: a.reasons.slice(0, 6),
      newsIds: [...new Set(a.newsIds)],
    };
  });
}
