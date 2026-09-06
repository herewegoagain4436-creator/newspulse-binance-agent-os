import type { AgentRunResult } from "../core/types";
import { ScoreTable } from "./components/ScoreTable";
import { DecisionLog } from "./components/DecisionLog";
import { PortfolioPanel } from "./components/PortfolioPanel";
import { NewsPanel } from "./components/NewsPanel";
import { MarketPanel } from "./components/MarketPanel";

export function AppBody({
  result,
  conc,
  pnl,
}: {
  result: AgentRunResult;
  conc: Record<string, number>;
  pnl: Record<string, number>;
}) {
  const { mcp, baw } = result.adapterMeta;
  return (
    <div className="grid">
      <div className="card half">
        <h2>MCP adapter (CEX)</h2>
        <p className="mono">{mcp.label}</p>
        <p className="mono">
          {mcp.endpoint}
          <br />
          oauth_client_id={mcp.oauthClientId} · usedMock={String(mcp.usedMock)}
        </p>
      </div>
      <div className="card half">
        <h2>BAW adapter (Wallet)</h2>
        <p className="mono">{baw.label}</p>
        <p className="mono">
          {baw.hubUrl}
          <br />
          caps (documented defaults): swap ${baw.documentedCapsUsd.swap}/d · defi $
          {baw.documentedCapsUsd.defi}/d · x402 ${baw.documentedCapsUsd.x402}/d
          <br />
          usedMock={String(baw.usedMock)}
        </p>
        {result.bawAction ? (
          <p className="sub">
            Last BAW action: <span className="mono">{result.bawAction.status}</span> —{" "}
            {result.bawAction.fromAsset
              ? `${result.bawAction.fromAsset}→${result.bawAction.toAsset} $${result.bawAction.notionalUsd}`
              : result.bawAction.label}
          </p>
        ) : null}
        {baw.lastActionLabel ? (
          <p className="reason mono">{baw.lastActionLabel}</p>
        ) : null}
      </div>
      <div className="card half">
        <ScoreTable scores={result.scores} />
      </div>
      <div className="card half">
        <DecisionLog decisions={result.decisions} />
      </div>
      <div className="card half">
        <PortfolioPanel portfolio={result.portfolio} concentration={conc} pnl={pnl} />
      </div>
      <div className="card half">
        <MarketPanel market={result.market} />
      </div>
      <div className="card">
        <NewsPanel news={result.news} />
      </div>
    </div>
  );
}
