import type { SymbolScore } from "../../core/types";

export function ScoreTable({ scores }: { scores: SymbolScore[] }) {
  return (
    <>
      <h2>News scores</h2>
      <table>
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Score</th>
            <th>Conf</th>
            <th>Why</th>
          </tr>
        </thead>
        <tbody>
          {scores.map((s) => (
            <tr key={s.symbol}>
              <td className="mono">{s.symbol}</td>
              <td className={s.score >= 0 ? "score-pos mono" : "score-neg mono"}>
                {s.score.toFixed(3)}
              </td>
              <td className="mono">{s.confidence.toFixed(2)}</td>
              <td>
                {s.reasons.slice(0, 2).map((r, i) => (
                  <div className="reason" key={i}>
                    {r}
                  </div>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
