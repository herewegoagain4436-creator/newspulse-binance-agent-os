import type { PortfolioSnapshot } from "../../core/types";

export function PortfolioPanel({
  portfolio,
  concentration,
  pnl,
}: {
  portfolio: PortfolioSnapshot;
  concentration: Record<string, number>;
  pnl: Record<string, number>;
}) {
  return (
    <>
      <h2>Paper portfolio / PnL</h2>
      <p className="mono">
        cash ${portfolio.cashUsdt.toFixed(2)} · equity ${portfolio.equityUsd.toFixed(2)} · realized $
        {portfolio.realizedPnl.toFixed(2)}
      </p>
      <table>
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Qty</th>
            <th>uPnL</th>
            <th>Conc%</th>
          </tr>
        </thead>
        <tbody>
          {portfolio.positions.map((p) => (
            <tr key={p.symbol}>
              <td className="mono">{p.symbol}</td>
              <td className="mono">{p.qty.toFixed(4)}</td>
              <td className={p.unrealizedPnl >= 0 ? "score-pos mono" : "score-neg mono"}>
                ${p.unrealizedPnl.toFixed(2)}
              </td>
              <td className="mono">{concentration[p.symbol] ?? 0}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="reason mono">pnl map: {JSON.stringify(pnl)}</p>
    </>
  );
}
