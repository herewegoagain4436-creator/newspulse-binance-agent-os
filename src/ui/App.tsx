import { useMemo, useState } from "react";
import { runAgentOnce, describeUniverse } from "../core/agent";
import { concentration, pnlByAsset } from "../core/portfolio";
import { AgentOsFacade } from "../adapters/agentOsFacade";
import type { AgentRunResult } from "../core/types";
import { AppBody } from "./AppBody";

export function App() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AgentRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const universe = useMemo(() => describeUniverse(), []);
  const dualPreview = useMemo(() => new AgentOsFacade().dualStatus(), []);

  async function runOnce() {
    setLoading(true);
    setError(null);
    try {
      const facade = new AgentOsFacade();
      const r = await runAgentOnce({
        adapter: facade,
        seedPositions: {
          SOL: { qty: 50, avgPrice: 160 },
          DOGE: { qty: 20000, avgPrice: 0.14 },
          AVAX: { qty: 40, avgPrice: 30 },
        },
        defaultOrderUsd: 1500,
        enableBawPath: true,
        premium: { force: true, notionalUsd: 2 },
      });
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const conc = result ? concentration(result.portfolio) : {};
  const pnl = result ? pnlByAsset(result.portfolio) : {};
  return (
    <div className="app">
      <header>
        <div>
          <h1>
            News<span>Pulse</span>
          </h1>
          <p className="sub">
            Track A: brain (rules/lexicon/scorer) + optional x402 premium signals → risk-checked
            BUY/SELL/HOLD via Agent OS MCP (CEX) + BAW (Wallet). Live default; trades need confirmation.
          </p>
          <p className="sub mono">Universe: {universe}</p>
        </div>
        <div className="actions">
          <span className="badge">mode: live</span>
          <span className="badge">MCP + BAW</span>
          <button onClick={runOnce} disabled={loading}>
            {loading ? "Running..." : "Run agent once"}
          </button>
        </div>
      </header>

      {!result ? (
        <div className="grid" style={{ marginBottom: 14 }}>
          <div className="card half">
            <h2>MCP rail (CEX)</h2>
            <p className="mono">{dualPreview.mcp.endpoint}</p>
            <p className="sub">oauth_client_id={dualPreview.mcp.oauthClientId}</p>
            <p className="sub">{dualPreview.mcp.label}</p>
          </div>
          <div className="card half">
            <h2>BAW rail (Wallet)</h2>
            <p className="mono">{dualPreview.baw.hubUrl}</p>
            <p className="sub">
              documented caps: swap ${dualPreview.baw.documentedCapsUsd.swap}/d · defi $
              {dualPreview.baw.documentedCapsUsd.defi}/d · x402 $
              {dualPreview.baw.documentedCapsUsd.x402}/d (defaults, not guarantees)
            </p>
            <p className="sub">{dualPreview.baw.label}</p>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="card">
          <strong>Error:</strong> {error}
        </div>
      ) : null}

      {!result && !loading ? (
        <div className="card">
          <h2>Ready</h2>
          <p className="sub">
            Click Run agent once: brain scores free news → maybe tiny x402 premium → rescore →
            risk → live MCP/BAW (pending confirm or clear auth — never fake fills).
          </p>
        </div>
      ) : null}

      {result ? <AppBody result={result} conc={conc} pnl={pnl} /> : null}

      <p className="disclaimer">
        Disclaimer: not financial advice. Live Agent OS trades require user confirmation
        (MCP OAuth + Agentic Hub). No fake live fills. x402 premium payments stay tiny under
        the documented ~$20/day cap. See AGENT_OS_NOTES.md.
      </p>
    </div>
  );
}
