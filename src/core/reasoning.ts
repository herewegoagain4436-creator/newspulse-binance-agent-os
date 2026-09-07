/**
 * Thin explainable "AI agent" layer — template rationales from scores/risk.
 * No LLM required. Structured natural language for CLI + dashboard.
 * Optional: hosts (Grok, etc.) remain MCP execution examples only.
 */
import type {
  Decision,
  PremiumSignalSummary,
  Side,
  SymbolScore,
} from "./types.js";

export interface DecisionRationale {
  symbol: string;
  side: Side;
  /** One-line headline for UI badges */
  headline: string;
  /** 2–4 sentence explainable rationale */
  narrative: string;
  /** Bullet factors the brain weighed */
  factors: string[];
}

function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

function scoreBand(score: number): string {
  const a = Math.abs(score);
  if (a >= 0.7) return "strong";
  if (a >= 0.45) return "actionable";
  if (a >= 0.25) return "mild";
  return "near-neutral";
}

function confBand(c: number): string {
  if (c >= 0.7) return "high";
  if (c >= 0.42) return "moderate";
  return "low";
}

/** Build a structured NL rationale for one decision from score + risk outcome. */
export function explainDecision(
  decision: Pick<
    Decision,
    "symbol" | "side" | "score" | "confidence" | "reasons" | "executed" | "rejectReason" | "sizeUsd"
  >,
  score?: SymbolScore
): DecisionRationale {
  const direction =
    decision.side === "BUY"
      ? "bullish"
      : decision.side === "SELL"
        ? "bearish"
        : "neutral";
  const band = scoreBand(decision.score);
  const conf = confBand(decision.confidence);
  const topWhy = (score?.reasons ?? decision.reasons).slice(0, 2);

  const factors: string[] = [
    `score ${decision.score.toFixed(3)} (${band} ${direction})`,
    `confidence ${decision.confidence.toFixed(2)} (${conf})`,
  ];
  for (const r of topWhy) factors.push(r.slice(0, 120));

  let outcome: string;
  if (decision.side === "HOLD") {
    outcome =
      "Risk gates leave this as HOLD — score did not clear buy/sell thresholds.";
  } else if (decision.executed) {
    outcome = `Risk gates cleared a $${decision.sizeUsd.toFixed(0)} ${decision.side}; Agent OS path may still be PENDING confirm or auth REJECTED (integration success without silent fill).`;
  } else {
    outcome = `Risk blocked ${decision.side}: ${decision.rejectReason ?? "gate failed"}.`;
  }

  const headline =
    decision.side === "HOLD"
      ? `${decision.symbol} HOLD — ${band} score, ${conf} conf`
      : decision.executed
        ? `${decision.symbol} ${decision.side} attempted — ${band}/${conf}`
        : `${decision.symbol} ${decision.side} blocked — ${decision.rejectReason ?? "risk"}`;

  const narrative = [
    `Brain (rules/lexicon/scorer) sees ${decision.symbol} as ${band} ${direction} at score ${decision.score.toFixed(3)} with ${conf} confidence (${pct(decision.confidence)}).`,
    topWhy.length
      ? `Key drivers: ${topWhy.map((t) => t.replace(/^[^:]+:\s*/, "").slice(0, 90)).join("; ")}.`
      : "No tagged news drivers for this symbol in the current window.",
    outcome,
  ].join(" ");

  return {
    symbol: decision.symbol,
    side: decision.side,
    headline,
    narrative,
    factors,
  };
}

/** Explain premium x402 branch in plain language (honesty-first). */
export function explainPremium(prem: PremiumSignalSummary | null | undefined): string {
  if (!prem) return "Premium x402 path not run.";
  if (!prem.attempted || prem.paymentStatus === "SKIPPED") {
    return `Premium skipped — ${prem.reason}. Free news was enough for the brain.`;
  }
  const base = `Brain requested ~$${prem.notionalUsd} x402 premium because: ${prem.reason}.`;
  switch (prem.paymentStatus) {
    case "PENDING":
      return `${base} Payment status PENDING (awaiting Agentic Hub confirm) — ${
        prem.contentApplied
          ? "SIMULATED premium content merged for scoring only; NOT a paid fill."
          : "no content merged."
      }`;
    case "REJECTED":
      return `${base} Payment REJECTED (auth/hub) — no premium content applied; never claimed paid.`;
    case "PAID_PAPER":
      return `${base} PAID_PAPER (explicit paper mode) — fixture premium content applied; not a live fill.`;
    case "PAID_MOCK":
      return `${base} PAID_MOCK (explicit mock mode) — fixture premium content applied; not a live fill.`;
    default:
      return `${base} status=${prem.paymentStatus}.`;
  }
}

/** Short run-level narrative for CLI / dashboard header. */
export function explainRunSummary(opts: {
  mode: string;
  decisions: Decision[];
  premium?: PremiumSignalSummary | null;
}): string {
  const buys = opts.decisions.filter((d) => d.side === "BUY" && d.executed).length;
  const sells = opts.decisions.filter((d) => d.side === "SELL" && d.executed).length;
  const holds = opts.decisions.filter((d) => d.side === "HOLD").length;
  const blocked = opts.decisions.filter((d) => d.side !== "HOLD" && !d.executed).length;
  return [
    `Mode=${opts.mode}. Brain proposed ${buys} BUY attempt(s), ${sells} SELL attempt(s), ${holds} HOLD(s), ${blocked} risk-blocked.`,
    explainPremium(opts.premium ?? null),
    "Rules brain — no LLM required; rationales are template/explainable.",
  ].join(" ");
}

export function attachRationales(decisions: Decision[]): Decision[] {
  return decisions.map((d) => ({
    ...d,
    rationale: explainDecision(d),
  }));
}
