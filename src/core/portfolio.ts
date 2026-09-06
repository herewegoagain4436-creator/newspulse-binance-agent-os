import { envBool, envNum } from "./env.js";
import type { Decision, PortfolioSnapshot, Position, SymbolId } from "./types.js";

export function emptyPortfolio(cash = envNum("PAPER_CASH_USDT", 100_000)): PortfolioSnapshot {
  return {
    cashUsdt: cash,
    equityUsd: cash,
    positions: [],
    realizedPnl: 0,
    dailyTradeCount: 0,
    killSwitch: envBool("KILL_SWITCH", false),
  };
}

function markEquity(p: PortfolioSnapshot): void {
  const posValue = p.positions.reduce((s, x) => s + x.qty * x.markPrice, 0);
  p.equityUsd = p.cashUsdt + posValue;
  for (const pos of p.positions) {
    pos.unrealizedPnl = (pos.markPrice - pos.avgPrice) * pos.qty;
  }
}

export function updateMarks(
  portfolio: PortfolioSnapshot,
  prices: Partial<Record<SymbolId, number>>
): void {
  for (const pos of portfolio.positions) {
    const px = prices[pos.symbol];
    if (px != null) pos.markPrice = px;
  }
  markEquity(portfolio);
}

export function applyDecision(portfolio: PortfolioSnapshot, d: Decision): PortfolioSnapshot {
  if (!d.executed || d.side === "HOLD" || d.sizeUsd <= 0) return portfolio;

  const next: PortfolioSnapshot = {
    ...portfolio,
    positions: portfolio.positions.map((p) => ({ ...p })),
  };

  let pos = next.positions.find((p) => p.symbol === d.symbol);
  if (!pos) {
    pos = {
      symbol: d.symbol,
      qty: 0,
      avgPrice: 0,
      markPrice: d.price,
      unrealizedPnl: 0,
    };
    next.positions.push(pos);
  }

  if (d.side === "BUY") {
    const qty = d.sizeUsd / d.price;
    const newQty = pos.qty + qty;
    pos.avgPrice = newQty > 0 ? (pos.avgPrice * pos.qty + d.price * qty) / newQty : d.price;
    pos.qty = newQty;
    pos.markPrice = d.price;
    next.cashUsdt -= d.sizeUsd;
  } else if (d.side === "SELL") {
    const qty = Math.min(pos.qty, d.sizeUsd / d.price);
    const proceeds = qty * d.price;
    const cost = qty * pos.avgPrice;
    next.realizedPnl += proceeds - cost;
    pos.qty -= qty;
    pos.markPrice = d.price;
    next.cashUsdt += proceeds;
    if (pos.qty < 1e-12) {
      next.positions = next.positions.filter((p) => p.symbol !== d.symbol);
    }
  }

  next.dailyTradeCount += 1;
  markEquity(next);
  return next;
}

export function pnlByAsset(portfolio: PortfolioSnapshot): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of portfolio.positions) {
    out[p.symbol] = Number(p.unrealizedPnl.toFixed(2));
  }
  out.__realized = Number(portfolio.realizedPnl.toFixed(2));
  return out;
}

export function concentration(portfolio: PortfolioSnapshot): Record<string, number> {
  const eq = Math.max(portfolio.equityUsd, 1);
  const out: Record<string, number> = {};
  for (const p of portfolio.positions) {
    out[p.symbol] = Number(((Math.abs(p.qty * p.markPrice) / eq) * 100).toFixed(2));
  }
  return out;
}
