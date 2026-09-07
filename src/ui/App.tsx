import { useEffect, useMemo, useState } from "react";
import { runAgentOnce, describeUniverse } from "../core/agent";
import { concentration, pnlByAsset } from "../core/portfolio";
import { AgentOsFacade } from "../adapters/agentOsFacade";
import { BawAgenticWalletAdapter } from "../adapters/bawAgenticWallet";
import { describeMcpSession } from "../adapters/binanceAgentOs";
import type { AgentRunResult } from "../core/types";
import { AppBody } from "./AppBody";

export function App() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AgentRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bawStatus, setBawStatus] = useState<string>("probing…");
  const [bawAddr, setBawAddr] = useState<string>("");
  const [signinInfo, setSigninInfo] = useState<string>("");
  const [connecting, setConnecting] = useState(false);
  const universe = useMemo(() => describeUniverse(), []);
  const dualPreview = useMemo(() => new AgentOsFacade().dualStatus(), []);
  const mcpSess = useMemo(() => describeMcpSession(), []);

  async function refreshBaw() {
    try {
      const baw = new BawAgenticWalletAdapter();
      const auth = await baw.getAuthStatus();
      setBawStatus(auth.connectionStatus + " — " + auth.label);
      setBawAddr(auth.address || "");
    } catch (e) {
      setBawStatus(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => { void refreshBaw(); }, []);

  async function connectWallet() {
    setConnecting(true);
    setSigninInfo("");
    try {
      const baw = new BawAgenticWalletAdapter();
      const started = await baw.beginConnect();
      if (!started.ok) {
        setSigninInfo(started.label);
      } else {
        const d = started.data || {};
        setSigninInfo([
          "1) Open urlForWeb / scan QR in Binance Wallet App",
          d.urlForWeb ? "urlForWeb: " + d.urlForWeb : "",
          d.pairingCode ? "pairingCode: " + d.pairingCode : "",
          d.qrCodeId ? "qrCodeId: " + d.qrCodeId : "",
          "2) Confirm in App, then run: baw auth verify --qrCodeId <id> --json",
          "Real baw CLI auth only — not a fake in-page wallet inject.",
        ].filter(Boolean).join("\n"));
      }
      await refreshBaw();
    } catch (e) {
      setSigninInfo(e instanceof Error ? e.message : String(e));
    } finally {
      setConnecting(false);
    }
  }

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
      await refreshBaw();
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
            Track A: conflicting free news → tiny x402 → rescore → risk → live MCP/BAW.
            Real baw CLI + honest MCP host bridge — no hub-HTTP stubs.
          </p>
          <p className="sub mono">Universe: {universe}</p>
        </div>
        <div className="actions">
          <span className="badge">mode: live</span>
          <span className="badge">MCP + BAW</span>
          <button onClick={connectWallet} disabled={connecting}>
            {connecting ? "Starting baw auth…" : "Connect Wallet (baw)"}
          </button>
          <button onClick={runOnce} disabled={loading}>
            {loading ? "Running..." : "Run agent once"}
          </button>
        </div>
      </header>

      <div className="grid" style={{ marginBottom: 14 }}>
        <div className="card half">
          <h2>MCP session</h2>
          <p className="mono">{dualPreview.mcp.endpoint}</p>
          <p className="sub">oauth_client_id={dualPreview.mcp.oauthClientId} (Grok = example)</p>
          <p className="sub">{mcpSess.connected ? "SESSION ENV PRESENT" : "UNCONNECTED"} — {mcpSess.label}</p>
        </div>
        <div className="card half">
          <h2>BAW wallet (baw CLI)</h2>
          <p className="mono">{dualPreview.baw.hubUrl} (docs only — not auth)</p>
          <p className="sub">{bawStatus}</p>
          {bawAddr ? <p className="mono">address: {bawAddr}</p> : null}
          <p className="sub">Install agentic-wallet CLI globally · Auth: baw auth signin then App QR then verify</p>
          {signinInfo ? <pre className="mono reason" style={{ whiteSpace: "pre-wrap" }}>{signinInfo}</pre> : null}
        </div>
      </div>

      {error ? (
        <div className="card">
          <strong>Error:</strong> {error}
        </div>
      ) : null}

      {!result && !loading ? (<div className="card"><h2>Ready</h2><p className="sub">Use Connect Wallet for real baw auth. Live rails fail closed without QR/OAuth.</p></div>) : null}
      {result ? <AppBody result={result} conc={conc} pnl={pnl} /> : null}
      <p className="disclaimer">Disclaimer: not financial advice. Live trades need MCP OAuth + baw App confirmation. No fake live fills.</p>
    </div>
  );
}
