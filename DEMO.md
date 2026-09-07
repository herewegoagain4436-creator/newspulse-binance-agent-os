# NewsPulse — Live runbook / smoke guide

## Quick start

```bash
cd newspulse-binance-agent-os
npm install
npm run demo
```

Expected:
1. Fixture news scored across the top-10 non-stable universe
2. Dual-rail status shows MCP + BAW in live mode (oauth_client_id=grok)
3. MCP/BAW return pending-confirm OR clear auth REJECTED — never silent FILLED_PAPER in live
4. Exit 0 on PASS (no paper BUY/SELL fill asserts)

## Dashboard

```bash
npm run dev
```

Open the Vite URL, click Run agent once. Adapter cards show **MCP** and **BAW** statuses side by side.

## What the live smoke shows

1. Multi-asset news mapping (BTC ETF bullish, SOL DeFi exploit bearish, etc.)
2. Explainable per-symbol scores and reasons
3. Risk gates: max position, daily trades, cooldown, concentration, kill-switch
4. Portfolio snapshot (local ledger only for explicit paper/mock opt-in)
5. **MCP** adapter: live pending confirm or actionable auth error
6. **BAW** adapter: live pending/auth reject under documented daily caps when news implies on-chain

## Agent OS (both rails)

### MCP (CEX)
- Endpoint: https://agent.binance.com/mcp/agentic
- Auth: OAuth client flow (`oauth_client_id=grok`). No device API keys.
- Do not open the MCP URL in a browser.
- Live trades require confirmation; sub-account starts empty; no withdrawal scope.

### BAW (Wallet / Agentic Hub)
- Hub: https://web3.binance.com/agentic-hub
- Live: pending confirm or clear auth/hub error; paper/mock opt-in only
- Documented defaults (public materials): ~$50k/day swaps, ~$100k/day DeFi, $20/day x402 — **not guarantees**; confirm in App

Details: AGENT_OS_NOTES.md

## Disclaimer

Not financial advice. Live trades require Agent OS confirmation. Missing auth fails clearly. Paper/mock are opt-in only.
