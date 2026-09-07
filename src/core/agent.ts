/**
 * NewsPulse agent loop:
 *   free news → brain score → maybe x402 premium signal → rescore/merge
 *   → risk gates → BUY/SELL/HOLD → MCP (CEX) and/or BAW actions
 *
 * Brain = rules/lexicon/scorer (no LLM required). Grok is an optional MCP host example.
 */
import { AgentOsFacade } from "../adapters/agentOsFacade.js";
import { BinanceAgentOsAdapter } from "../adapters/binanceAgentOs.js";
import { loadFixtureMarket, loadFixtureNews } from "./news.js";
import {
  applyDecision,
  emptyPortfolio,
  updateMarks,
} from "./portfolio.js";
import {
  maybeFetchPremiumSignal,
  mergePremiumIntoNews,
  type PremiumSignalOptions,
} from "./premiumSignal.js";
import {
  applyRiskToDecision,
  createRiskState,
  DEFAULT_RISK,
  recordTrade,
  sideFromScore,
  type RiskState,
} from "./risk.js";
import { scoreNews } from "./scorer.js";
import type {
  AgentRunResult,
  Decision,
  MarketTick,
  NewsItem,
  PortfolioSnapshot,
  PremiumSignalSummary,
  RiskConfig,
  SymbolId,
} from "./types.js";
import { getUniverse } from "./universe.js";

export interface AgentOptions {
  news?: NewsItem[];
  market?: MarketTick[];
  portfolio?: PortfolioSnapshot;
  riskState?: RiskState;
  risk?: RiskConfig;
  /** Prefer dual-rail facade; bare MCP adapter still accepted for back-compat */
  adapter?: AgentOsFacade | BinanceAgentOsAdapter;
  /** Seed positions so SELL paths can be evaluated */
  seedPositions?: Partial<Record<SymbolId, { qty: number; avgPrice: number }>>;
  defaultOrderUsd?: number;
  /** Run optional BAW wallet leg when news implies on-chain (default true) */
  enableBawPath?: boolean;
  /** Premium x402 signal options (brain may pay tiny amount for labeled premium) */
  premium?: PremiumSignalOptions | false;
}

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function asFacade(
  adapter: AgentOsFacade | BinanceAgentOsAdapter | undefined
): AgentOsFacade {
  if (!adapter) return new AgentOsFacade();
  if (adapter instanceof AgentOsFacade) return adapter;
  return new AgentOsFacade({ mcp: adapter });
}

export function seedPortfolio(
  base: PortfolioSnapshot,
  seeds: NonNullable<AgentOptions["seedPositions"]>,
  market: MarketTick[]
): PortfolioSnapshot {
  let p: PortfolioSnapshot = {
    ...base,
    positions: base.positions.map((x) => ({ ...x })),
  };
  for (const [sym, seed] of Object.entries(seeds)) {
    const tick = market.find((m) => m.symbol === sym);
    const mark = tick?.price ?? seed!.avgPrice;
    p.positions.push({
      symbol: sym as SymbolId,
      qty: seed!.qty,
      avgPrice: seed!.avgPrice,
      markPrice: mark,
      unrealizedPnl: (mark - seed!.avgPrice) * seed!.qty,
    });
  }
  updateMarks(
    p,
    Object.fromEntries(market.map((m) => [m.symbol, m.price])) as Partial<
      Record<SymbolId, number>
    >
  );
  return p;
}

export async function runAgentOnce(opts: AgentOptions = {}): Promise<AgentRunResult> {
  const newsIn = opts.news ?? loadFixtureNews();
  const market = opts.market ?? loadFixtureMarket();
  const facade = asFacade(opts.adapter);
  const risk = opts.risk ?? DEFAULT_RISK;
  const riskState = opts.riskState ?? createRiskState();
  const defaultOrderUsd = opts.defaultOrderUsd ?? Math.min(1500, risk.maxPositionUsd);
  const enableBaw = opts.enableBawPath !== false;

  const marketRes = await facade.getMarketSnapshot(market);
  const ticks = marketRes.data;

  let portfolio = opts.portfolio ?? emptyPortfolio();
  if (opts.seedPositions) {
    portfolio = seedPortfolio(portfolio, opts.seedPositions, ticks);
  }
  updateMarks(
    portfolio,
    Object.fromEntries(ticks.map((m) => [m.symbol, m.price])) as Partial<
      Record<SymbolId, number>
    >
  );

  // 1) Brain scores free / fixture news
  const scoresBeforePremium = scoreNews(newsIn);

  // 2) Maybe pay tiny x402 for premium signal → 3) merge / rescore
  let premiumSummary: PremiumSignalSummary | null = null;
  let news = newsIn;
  let scores = scoresBeforePremium;

  if (opts.premium !== false) {
    const premOpts: PremiumSignalOptions =
      opts.premium === undefined ? {} : opts.premium;
    const attempt = await maybeFetchPremiumSignal(scoresBeforePremium, newsIn, {
      ...premOpts,
      baw: premOpts.baw ?? facade.baw,
    });
    premiumSummary = {
      attempted: attempt.attempted,
      reason: attempt.reason,
      notionalUsd: attempt.notionalUsd,
      paymentStatus: attempt.paymentStatus,
      paymentId: attempt.paymentId,
      label: attempt.label,
      contentApplied: attempt.contentApplied,
      contentNote: attempt.contentNote,
      sourceLabel: attempt.hints?.sourceLabel,
      symbols: attempt.hints?.symbols,
      sentiment: attempt.hints?.sentiment,
      remainingX402CapUsd: attempt.remainingX402CapUsd,
      documentedCapUsd: attempt.documentedCapUsd,
    };
    if (attempt.contentApplied) {
      news = mergePremiumIntoNews(newsIn, attempt);
      scores = scoreNews(news);
    }
  }

  const decisions: Decision[] = [];

  // 4) Risk → decisions → 5) MCP/BAW actions
  const ranked = [...scores].sort((a, b) => Math.abs(b.score) - Math.abs(a.score));

  for (const s of ranked) {
    const side = sideFromScore(s.score, risk);
    const tick = ticks.find((t) => t.symbol === s.symbol);
    if (!tick) continue;

    const draft = {
      id: uid("dec"),
      at: new Date().toISOString(),
      symbol: s.symbol,
      side,
      score: s.score,
      confidence: s.confidence,
      reasons: s.reasons,
      newsIds: s.newsIds,
      price: tick.price,
      sizeUsd: defaultOrderUsd,
    };

    const decided = applyRiskToDecision(draft, portfolio, riskState, risk);

    if (decided.executed) {
      const exec = await facade.executeDecision(decided);
      decided.mockLabel = `MCP: ${exec.label}`;
      const ackStatus = exec.data?.status;
      // Local portfolio ledger only for explicit paper/mock fills — never invent live fills.
      const localFill =
        ackStatus === "FILLED_PAPER" || ackStatus === "SUBMITTED_MOCK";
      if (localFill) {
        portfolio = applyDecision(portfolio, decided);
        recordTrade(riskState, decided.symbol);
      } else if (
        ackStatus === "SUBMITTED_LIVE_PENDING_CONFIRM" ||
        ackStatus === "REJECTED"
      ) {
        // Keep executed=true for visibility of the attempt; risk trade count only on local fill.
        decided.rejectReason =
          decided.rejectReason ??
          (ackStatus === "REJECTED"
            ? exec.label
            : "awaiting Agent OS user confirmation");
      }
    } else if (side !== "HOLD") {
      decided.mockLabel = `skipped: ${decided.rejectReason}`;
    } else {
      decided.mockLabel = "HOLD";
    }

    decisions.push(decided);
  }

  let bawAction: AgentRunResult["bawAction"] = null;
  let bawUsedMock = facade.baw.mode !== "live";
  let bawLastLabel: string | undefined;

  if (enableBaw) {
    const newsTexts = news.map((n) => `${n.headline}. ${n.summary}`);
    const bawRes = await facade.maybeOnChainWalletAction({
      newsTexts,
      preferFrom: "USDT",
      preferTo: "ETH",
      notionalUsd: 25,
    });
    bawUsedMock = bawRes.usedMock;
    bawLastLabel = bawRes.label;
    if (bawRes.data) {
      bawAction = {
        label: bawRes.label,
        status: bawRes.data.status,
        fromAsset: bawRes.data.fromAsset,
        toAsset: bawRes.data.toAsset,
        notionalUsd: bawRes.data.notionalUsd,
        usedMock: bawRes.usedMock,
      };
    } else {
      bawAction = {
        label: bawRes.label,
        status: "SKIPPED",
        usedMock: bawRes.usedMock,
      };
    }
  }

  const mcpUsedMock = facade.mode === "live" ? false : marketRes.usedMock;
  const adapterMeta = facade.buildMeta({
    mcpUsedMock,
    bawUsedMock,
    bawLastActionLabel: bawLastLabel,
  });

  return {
    mode: facade.mode,
    decisions,
    scores,
    scoresBeforePremium,
    market: ticks,
    portfolio,
    news,
    adapterMeta,
    bawAction,
    premiumSignal: premiumSummary,
  };
}

export function describeUniverse(): string {
  return getUniverse()
    .map((c) => `${c.symbol} (${c.binancePair})`)
    .join(", ");
}
