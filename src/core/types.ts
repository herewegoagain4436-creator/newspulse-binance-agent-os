/** Shared domain types for NewsPulse */

export type Side = "BUY" | "SELL" | "HOLD";

export type SymbolId =
  | "BTC"
  | "ETH"
  | "BNB"
  | "SOL"
  | "XRP"
  | "DOGE"
  | "ADA"
  | "TRX"
  | "AVAX"
  | "LINK";

export interface UniverseCoin {
  symbol: SymbolId;
  name: string;
  binancePair: string; // e.g. BTCUSDT
  coingeckoId?: string;
}

export interface NewsItem {
  id: string;
  headline: string;
  summary: string;
  source: string;
  publishedAt: string; // ISO
  /** Explicit symbol tags; scorer also does keyword mapping */
  symbols: SymbolId[];
  /** Optional pre-labeled sentiment for fixtures (-1..1) */
  sentimentHint?: number;
  url?: string;
}

export interface SymbolScore {
  symbol: SymbolId;
  score: number; // -1..1
  confidence: number; // 0..1
  reasons: string[];
  newsIds: string[];
}

export interface MarketTick {
  symbol: SymbolId;
  price: number;
  change24hPct: number;
  volume24hUsd: number;
  asOf: string;
}

export interface DecisionRationale {
  symbol: string;
  side: Side;
  headline: string;
  narrative: string;
  factors: string[];
}

export interface Decision {
  id: string;
  at: string;
  symbol: SymbolId;
  side: Side;
  score: number;
  confidence: number;
  reasons: string[];
  newsIds: string[];
  price: number;
  sizeUsd: number;
  executed: boolean;
  rejectReason?: string;
  mockLabel?: string;
  /** Template/explainable NL rationale (no LLM) */
  rationale?: DecisionRationale;
}

export interface Position {
  symbol: SymbolId;
  qty: number;
  avgPrice: number;
  markPrice: number;
  unrealizedPnl: number;
}

export interface PortfolioSnapshot {
  cashUsdt: number;
  equityUsd: number;
  positions: Position[];
  realizedPnl: number;
  dailyTradeCount: number;
  killSwitch: boolean;
}

export interface RiskConfig {
  maxPositionUsd: number;
  maxDailyTrades: number;
  tradeCooldownMs: number;
  maxConcentrationPct: number;
  buyScoreThreshold: number;
  sellScoreThreshold: number;
  killSwitch: boolean;
}

/** Dual-rail Agent OS adapter metadata (MCP CEX + BAW Wallet) */
export interface DualAdapterMeta {
  endpoint: string;
  usedMock: boolean;
  label: string;
  mcp: {
    endpoint: string;
    oauthClientId: string;
    usedMock: boolean;
    label: string;
  };
  baw: {
    hubUrl: string;
    usedMock: boolean;
    label: string;
    documentedCapsUsd: {
      swap: number;
      defi: number;
      x402: number;
    };
    lastActionLabel?: string;
  };
}

export interface BawActionSummary {
  label: string;
  status: string;
  fromAsset?: string;
  toAsset?: string;
  notionalUsd?: number;
  usedMock: boolean;
}

/** x402 premium-signal attempt summary (brain may pay for labeled premium) */
export type PremiumContentKind =
  | "none"
  | "paid_fixture"       // paper/mock: fixture after local/mock payment
  | "simulated_after_pending"; // live PENDING: simulated content only — NOT paid

export interface PremiumSignalSummary {
  attempted: boolean;
  reason: string;
  notionalUsd: number;
  paymentStatus: "SKIPPED" | "PAID_PAPER" | "PAID_MOCK" | "PENDING" | "REJECTED";
  paymentId?: string;
  label: string;
  contentApplied: boolean;
  contentNote?: string;
  /** Honesty: how content was sourced — never claim live PAID fill */
  contentKind: PremiumContentKind;
  /** True only for explicit paper/mock PAID_* — never true on live PENDING */
  trulyPaid: boolean;
  /** Crystal-clear banner for UI/CLI */
  honestyBanner: string;
  sourceLabel?: "premium/x402";
  symbols?: SymbolId[];
  sentiment?: number;
  remainingX402CapUsd?: number;
  documentedCapUsd: number;
}

export interface AgentRunResult {
  mode: string;
  decisions: Decision[];
  scores: SymbolScore[];
  /** Scores before premium merge (if premium applied) */
  scoresBeforePremium?: SymbolScore[];
  market: MarketTick[];
  portfolio: PortfolioSnapshot;
  news: NewsItem[];
  adapterMeta: DualAdapterMeta;
  /** Optional on-chain / wallet leg via BAW */
  bawAction?: BawActionSummary | null;
  /** x402 premium signal attempt (paid / pending / rejected / skipped) */
  premiumSignal?: PremiumSignalSummary | null;
  /** Template/explainable run narrative (no LLM) */
  runNarrative?: string;
}
