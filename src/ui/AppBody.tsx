import type { AgentRunResult } from "../core/types";
import { ScoreTable } from "./components/ScoreTable";
import { DecisionLog } from "./components/DecisionLog";
import { PortfolioPanel } from "./components/PortfolioPanel";
import { NewsPanel } from "./components/NewsPanel";
import { MarketPanel } from "./components/MarketPanel";

function premiumBadge(status: string | undefined): string {
  switch (status) {
    case "PAID_PAPER":
    case "PAID_MOCK":
      return "paid";
    case "PENDING":
      return "pending";
    case "REJECTED":
      return "rejected";
    case "SKIPPED":
      return "skipped";
    default:
      return status ?? "—";
  }
}

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
  const prem = result.premiumSignal;
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

      {prem ? (
        <div className="card">
          <h2>
            x402 premium signal{" "}
            <span className="badge">{premiumBadge(prem.paymentStatus)}</span>
          </h2>
          <p className="sub">
            Brain may pay a tiny x402 amount (well under ${prem.documentedCapUsd}/day cap) for a
            labeled premium signal when free news is low-confidence or conflicting.
          </p>
          <p className="mono">
            attempted={String(prem.attempted)} · status={prem.paymentStatus} · notional=$
            {prem.notionalUsd}
            {prem.paymentId ? ` · id=${prem.paymentId}` : ""}
            <br />
            reason: {prem.reason}
            <br />
            {prem.label}
            <br />
            contentApplied={String(prem.contentApplied)}
            {prem.contentNote ? ` — ${prem.contentNote}` : ""}
            {prem.symbols
              ? ` · hints: ${prem.symbols.join(",")} sentiment=${prem.sentiment} (${prem.sourceLabel})`
              : ""}
          </p>
        </div>
      ) : null}

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
