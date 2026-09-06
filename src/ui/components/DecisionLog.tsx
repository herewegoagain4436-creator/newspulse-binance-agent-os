import type { Decision } from "../../core/types";

export function DecisionLog({ decisions }: { decisions: Decision[] }) {
  return (
    <>
      <h2>Decision log</h2>
      <table>
        <thead>
          <tr>
            <th>Side</th>
            <th>Symbol</th>
            <th>Size</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {decisions.map((d) => (
            <tr key={d.id}>
              <td className={`side-${d.side}`}>{d.side}</td>
              <td className="mono">{d.symbol}</td>
              <td className="mono">${d.sizeUsd.toFixed(0)}</td>
              <td>
                <span className="mono">{d.executed ? "EXEC" : "skip"}</span>
                <div className="reason">{d.mockLabel ?? d.rejectReason ?? ""}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
