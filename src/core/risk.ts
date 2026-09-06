import type { Decision, PortfolioSnapshot, RiskConfig, Side, SymbolId } from "./types.js";
import { envBool, envNum } from "./env.js";

export const DEFAULT_RISK: RiskConfig = {
  maxPositionUsd: envNum("MAX_POSITION_USD", 2500),
  maxDailyTrades: envNum("MAX_DAILY_TRADES", 20),
  tradeCooldownMs: envNum("TRADE_COOLDOWN_MS", 15_000),
  maxConcentrationPct: envNum("MAX_CONCENTRATION_PCT", 35),
  buyScoreThreshold: envNum("BUY_SCORE_THRESHOLD", 0.45),
  sellScoreThreshold: envNum("SELL_SCORE_THRESHOLD", -0.45),
  killSwitch: envBool("KILL_SWITCH", false),
};

export interface RiskState {
  lastTradeAtBySymbol: Partial<Record<SymbolId, number>>;
  dailyTradeCount: number;
  dayKey: string;
}

export function createRiskState(): RiskState {
  return {
    lastTradeAtBySymbol: {},
    dailyTradeCount: 0,
    dayKey: new Date().toISOString().slice(0, 10),
  };
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function refreshDay(state: RiskState): void {
  const key = todayKey();
  if (state.dayKey !== key) {
    state.dayKey = key;
    state.dailyTradeCount = 0;
  }
}

export function sideFromScore(
  score: number,
  cfg: RiskConfig = DEFAULT_RISK
): Side {
  if (score >= cfg.buyScoreThreshold) return "BUY";
  if (score <= cfg.sellScoreThreshold) return "SELL";
  return "HOLD";
}

export function checkRisk(opts: {
  side: Side;
  symbol: SymbolId;
  sizeUsd: number;
  price: number;
  portfolio: PortfolioSnapshot;
  state: RiskState;
  cfg?: RiskConfig;
  now?: number;
}): { ok: boolean; reason?: string; sizeUsd: number } {
  const cfg = opts.cfg ?? DEFAULT_RISK;
  const now = opts.now ?? Date.now();
  refreshDay(opts.state);

  if (opts.side === "HOLD") {
    return { ok: false, reason: "HOLD — no trade", sizeUsd: 0 };
  }

  if (cfg.killSwitch || opts.portfolio.killSwitch) {
    return { ok: false, reason: "kill-switch active", sizeUsd: 0 };
  }

  if (opts.state.dailyTradeCount >= cfg.maxDailyTrades) {
    return { ok: false, reason: `max daily trades (${cfg.maxDailyTrades})`, sizeUsd: 0 };
  }

  const last = opts.state.lastTradeAtBySymbol[opts.symbol];
  if (last != null && now - last < cfg.tradeCooldownMs) {
    return {
      ok: false,
      reason: `cooldown ${cfg.tradeCooldownMs}ms for ${opts.symbol}`,
      sizeUsd: 0,
    };
  }

  let size = Math.min(opts.sizeUsd, cfg.maxPositionUsd);
  if (size <= 0) {
    return { ok: false, reason: "size is zero", sizeUsd: 0 };
  }

  const equity = Math.max(opts.portfolio.equityUsd, 1);
  const pos = opts.portfolio.positions.find((p) => p.symbol === opts.symbol);
  const currentNotional = pos ? Math.abs(pos.qty * pos.markPrice) : 0;

  if (opts.side === "BUY") {
    if (opts.portfolio.cashUsdt < size) {
      size = Math.floor(opts.portfolio.cashUsdt);
      if (size < 10) {
        return { ok: false, reason: "insufficient cash", sizeUsd: 0 };
      }
    }
    const projected = currentNotional + size;
    if ((projected / equity) * 100 > cfg.maxConcentrationPct) {
      const room = Math.max(0, (cfg.maxConcentrationPct / 100) * equity - currentNotional);
      size = Math.floor(room);
      if (size < 10) {
        return {
          ok: false,
          reason: `concentration limit ${cfg.maxConcentrationPct}% for ${opts.symbol}`,
          sizeUsd: 0,
        };
      }
    }
  }

  if (opts.side === "SELL") {
    if (!pos || pos.qty <= 0) {
      return { ok: false, reason: `no position to sell for ${opts.symbol}`, sizeUsd: 0 };
    }
    const maxSell = pos.qty * opts.price;
    size = Math.min(size, maxSell, cfg.maxPositionUsd);
  }

  return { ok: true, sizeUsd: size };
}

export function recordTrade(state: RiskState, symbol: SymbolId, now = Date.now()): void {
  refreshDay(state);
  state.dailyTradeCount += 1;
  state.lastTradeAtBySymbol[symbol] = now;
}

/** Annotate a decision with risk outcome (mutates size / executed flags conceptually) */
export function applyRiskToDecision(
  decision: Omit<Decision, "executed" | "rejectReason" | "sizeUsd"> & { sizeUsd: number },
  portfolio: PortfolioSnapshot,
  state: RiskState,
  cfg: RiskConfig = DEFAULT_RISK
): Decision {
  const check = checkRisk({
    side: decision.side,
    symbol: decision.symbol,
    sizeUsd: decision.sizeUsd,
    price: decision.price,
    portfolio,
    state,
    cfg,
  });
  if (!check.ok) {
    return {
      ...decision,
      sizeUsd: 0,
      executed: false,
      rejectReason: check.reason,
    };
  }
  return {
    ...decision,
    sizeUsd: check.sizeUsd,
    executed: true,
  };
}
