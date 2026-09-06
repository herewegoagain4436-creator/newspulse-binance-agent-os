import type { NewsItem } from "../../core/types";

export function NewsPanel({ news }: { news: NewsItem[] }) {
  return (
    <>
      <h2>News feed (fixtures)</h2>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Headline</th>
            <th>Symbols</th>
          </tr>
        </thead>
        <tbody>
          {news.map((n) => (
            <tr key={n.id}>
              <td className="mono">{n.id}</td>
              <td>
                {n.headline}
                <div className="reason">{n.summary}</div>
              </td>
              <td className="mono">{n.symbols.join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
