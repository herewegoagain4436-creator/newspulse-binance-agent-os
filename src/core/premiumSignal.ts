/**
 * Premium signal module — NewsPulse brain may pay a tiny x402 amount (via BAW)
 * for a labeled premium signal when free news is low-confidence or conflicting.
 *
 * Honesty rules:
 * - Live without auth → REJECTED / SUBMITTED_LIVE_PENDING (never fake FILLED_PAPER)
 * - Fixture/demo premium *content* only when NEWSPULSE_MODE is paper/mock,
 *   OR when explicitly simulating signal content after a live pending x402 ack
 * - Documented x402 cap ~$20/day — keep payments tiny ($1–5)
 */
import {
  BawAgenticWalletAdapter,
  BAW_DOCUMENTED_DAILY_CAPS_USD,
  type BawX402Ack,
} from "../adapters/bawAgenticWallet.js";
import { envBool, envNum, envStr } from "./env.js";
import type { NewsItem, SymbolId, SymbolScore } from "./types.js";

export type PremiumPaymentStatus =
  | "SKIPPED"
  | "PAID_PAPER"
  | "PAID_MOCK"
  | "PENDING"
  | "REJECTED";

export interface PremiumSignalHints {
  symbols: SymbolId[];
  /** -1..1 aggregate sentiment from premium source */
  sentiment: number;
  headline: string;
  summary: string;
  sourceLabel: "premium/x402";
}

export interface PremiumSignalAttempt {
  attempted: boolean;
  reason: string;
  notionalUsd: number;
  paymentStatus: PremiumPaymentStatus;
  paymentId?: string;
  label: string;
  /** True when fixture content was merged into the brain (honest about why) */
  contentApplied: boolean;
  contentNote?: string;
  hints?: PremiumSignalHints;
  remainingX402CapUsd?: number;
  documentedCapUsd: number;
  rawAck?: BawX402Ack;
}

export interface PremiumSignalOptions {
  /** Force a premium purchase attempt regardless of heuristics */
  force?: boolean;
  /** Override notional (clamped to tiny range under $20/day cap) */
  notionalUsd?: number;
  /** Confidence below this → consider buy (default 0.42) */
  lowConfidenceThreshold?: number;
  /** Disable premium path entirely */
  enabled?: boolean;
  baw?: BawAgenticWalletAdapter;
}

const DEFAULT_NOTIONAL = 2;
const MIN_NOTIONAL = 1;
const MAX_NOTIONAL = 5;

/** Demo fixture premium payload — labeled premium/x402, never claimed as a live fill */
export const FIXTURE_PREMIUM_HINTS: PremiumSignalHints = {
  symbols: ["BTC", "ETH"],
  sentiment: 0.62,
  headline:
    "Premium desk: spot BTC/ETH flow skew constructive into US session (paid signal)",
  summary:
    "Aggregated premium flow + funding skew points mildly bullish for BTC and ETH over the next few hours. Source labeled premium/x402 — not free wire copy.",
  sourceLabel: "premium/x402",
};

function clampNotional(n: number): number {
  const v = Number.isFinite(n) ? n : DEFAULT_NOTIONAL;
  return Math.min(MAX_NOTIONAL, Math.max(MIN_NOTIONAL, v));
}

/** Detect opposite-leaning headlines for the same symbol */
export function detectConflictingHeadlines(news: NewsItem[]): SymbolId[] {
  const bull = new Set<SymbolId>();
  const bear = new Set<SymbolId>();
  for (const item of news) {
    const hint = item.sentimentHint;
    const text = `${item.headline} ${item.summary}`.toLowerCase();
    const looksBull =
      (hint != null && hint > 0.2) ||
      /\b(inflow|rally|approval|partnership|upgrade|bullish|surge|ath)\b/.test(text);
    const looksBear =
      (hint != null && hint < -0.2) ||
      /\b(hack|exploit|lawsuit|outflow|crash|bearish|sell-?off|investigation)\b/.test(
        text
      );
    for (const sym of item.symbols) {
      if (looksBull) bull.add(sym);
      if (looksBear) bear.add(sym);
    }
  }
  return [...bull].filter((s) => bear.has(s));
}

export function shouldBuyPremiumSignal(
  scores: SymbolScore[],
  news: NewsItem[],
  opts: PremiumSignalOptions = {}
): { buy: boolean; reason: string } {
  if (opts.enabled === false) {
    return { buy: false, reason: "premium path disabled" };
  }
  if (opts.force || envBool("NEWSPULSE_FORCE_PREMIUM", false)) {
    return { buy: true, reason: "explicit force flag (demo / NEWSPULSE_FORCE_PREMIUM)" };
  }

  const lowTh =
    opts.lowConfidenceThreshold ??
    envNum("PREMIUM_LOW_CONFIDENCE", 0.42);

  const active = scores.filter((s) => s.newsIds.length > 0);
  if (active.length === 0) {
    return { buy: true, reason: "no scored news coverage — buy premium for symbol hints" };
  }

  const conflicts = detectConflictingHeadlines(news);
  if (conflicts.length > 0) {
    return {
      buy: true,
      reason: `conflicting headlines on ${conflicts.join(",")}`,
    };
  }

  const avgConf =
    active.reduce((a, s) => a + s.confidence, 0) / Math.max(1, active.length);
  if (avgConf < lowTh) {
    return {
      buy: true,
      reason: `low avg confidence ${avgConf.toFixed(2)} < ${lowTh}`,
    };
  }

  // Near-threshold indecision: many HOLDs with mid scores
  const nearHold = active.filter(
    (s) => Math.abs(s.score) >= 0.25 && Math.abs(s.score) < 0.5
  );
  if (nearHold.length >= 3 && avgConf < 0.55) {
    return {
      buy: true,
      reason: `indecisive mid-band scores on ${nearHold.length} symbols (conf=${avgConf.toFixed(2)})`,
    };
  }

  return { buy: false, reason: "free news confidence sufficient — skip x402" };
}

function paymentStatusFromAck(
  status: BawX402Ack["status"]
): PremiumPaymentStatus {
  switch (status) {
    case "FILLED_PAPER":
      return "PAID_PAPER";
    case "SUBMITTED_MOCK":
      return "PAID_MOCK";
    case "SUBMITTED_LIVE_PENDING":
      return "PENDING";
    case "REJECTED":
    default:
      return "REJECTED";
  }
}

/**
 * Decide → pay tiny x402 via BAW → return labeled premium attempt.
 * Content merge policy is honest about live vs paper/mock vs pending.
 */
export async function maybeFetchPremiumSignal(
  scores: SymbolScore[],
  news: NewsItem[],
  opts: PremiumSignalOptions = {}
): Promise<PremiumSignalAttempt> {
  const documentedCapUsd = BAW_DOCUMENTED_DAILY_CAPS_USD.x402;
  const notionalUsd = clampNotional(
    opts.notionalUsd ?? envNum("PREMIUM_SIGNAL_USD", DEFAULT_NOTIONAL)
  );
  const decision = shouldBuyPremiumSignal(scores, news, opts);

  if (!decision.buy) {
    return {
      attempted: false,
      reason: decision.reason,
      notionalUsd,
      paymentStatus: "SKIPPED",
      label: `x402 premium skipped — ${decision.reason}`,
      contentApplied: false,
      documentedCapUsd,
    };
  }

  const baw = opts.baw ?? new BawAgenticWalletAdapter();
  const ackRes = await baw.payX402({
    notionalUsd,
    purpose: "premium-signal",
    clientId: `prem-${Date.now().toString(36)}`,
  });
  const ack = ackRes.data;
  const paymentStatus = paymentStatusFromAck(ack.status);

  // Content policy:
  // - paper/mock: apply fixture content (payment was local/mock)
  // - live PENDING: may simulate signal *content* after pending ack (explicitly labeled)
  // - live REJECTED: never apply content or claim payment success
  const mode = baw.mode;
  let contentApplied = false;
  let contentNote: string | undefined;
  let hints: PremiumSignalHints | undefined;

  if (paymentStatus === "PAID_PAPER" || paymentStatus === "PAID_MOCK") {
    hints = { ...FIXTURE_PREMIUM_HINTS };
    contentApplied = true;
    contentNote = `${mode} mode — fixture premium content applied after ${paymentStatus}`;
  } else if (paymentStatus === "PENDING") {
    // Explicitly allowed: simulate content after live pending ack (not a fill claim)
    hints = { ...FIXTURE_PREMIUM_HINTS };
    contentApplied = true;
    contentNote =
      "LIVE x402 PENDING — simulating premium signal content for brain merge; payment not filled";
  } else {
    // REJECTED
    contentApplied = false;
    contentNote =
      "LIVE x402 REJECTED — no premium content applied; authenticate Agentic Hub to pay";
  }

  return {
    attempted: true,
    reason: decision.reason,
    notionalUsd,
    paymentStatus,
    paymentId: ack.paymentId,
    label: ackRes.label,
    contentApplied,
    contentNote,
    hints,
    remainingX402CapUsd: ack.remainingX402CapUsd,
    documentedCapUsd,
    rawAck: ack,
  };
}

/** Convert premium hints into a NewsItem the scorer can consume */
export function premiumHintsToNewsItem(hints: PremiumSignalHints): NewsItem {
  return {
    id: `premium-x402-${Date.now().toString(36)}`,
    headline: hints.headline,
    summary: hints.summary,
    source: hints.sourceLabel,
    publishedAt: new Date().toISOString(),
    symbols: hints.symbols,
    sentimentHint: hints.sentiment,
  };
}

/** Merge premium into news list (append; does not mutate input) */
export function mergePremiumIntoNews(
  news: NewsItem[],
  attempt: PremiumSignalAttempt
): NewsItem[] {
  if (!attempt.contentApplied || !attempt.hints) return news;
  return [...news, premiumHintsToNewsItem(attempt.hints)];
}

export function premiumModeFromEnv(): string {
  return envStr("NEWSPULSE_MODE", "live").toLowerCase();
}
