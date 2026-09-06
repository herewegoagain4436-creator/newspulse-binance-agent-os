import type { MarketTick } from "../../core/types";

export function MarketPanel({ market }: { market: MarketTick[] }) {
  return (
    <>
      <h2>Market snapshot</h2>
      <table>
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Price</th>
            <th>24h</th>
          </tr>
        </thead>
        <tbody>
          {market.map((m) => (
            <tr key={m.symbol}>
              <td className="mono">{m.symbol}</td>
              <td className="mono">${m.price}</td>
              <td className={m.change24hPct >= 0 ? "score-pos mono" : "score-neg mono"}>
                {m.change24hPct >= 0 ? "+" : ""}
                {m.change24hPct}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
