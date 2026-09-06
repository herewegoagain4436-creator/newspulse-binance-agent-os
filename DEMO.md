# NewsPulse — Demo guide

## Quick start

```bash
cd /workspace/hackathons/binance-agent-os-2026
npm install
npm run demo
```

Expected:
1. Fixture news scored across the top-10 non-stable universe
2. At least one executed BUY and one executed SELL on different assets (**MCP paper** path)
3. At least one **BAW** paper/mock wallet action (dual-rail visibility)
4. Exit 0 on PASS

## Dashboard

```bash
npm run dev
```

Open the Vite URL, click Run agent once. Adapter cards show **MCP** and **BAW** statuses side by side.

## What the demo shows

1. Multi-asset news mapping (BTC ETF bullish, SOL DeFi exploit bearish, etc.)
2. Explainable per-symbol scores and reasons
3. Risk gates: max position, daily trades, cooldown, concentration, kill-switch
4. Paper portfolio PnL per asset
5. **MCP** adapter label: PAPER SIM / MOCK (CEX orders)
6. **BAW** adapter: paper/mock swap under documented daily caps when news implies on-chain

## Agent OS (both rails)

### MCP (CEX)
- Endpoint: https://agent.binance.com/mcp/agentic
- Auth: OAuth client flow (`oauth_client_id=grok`). No device API keys.
- Do not open the MCP URL in a browser.
- Live trades require confirmation; sub-account starts empty; no withdrawal scope.

### BAW (Wallet / Agentic Hub)
- Hub: https://web3.binance.com/agentic-hub
- Paper/mock: balance, quote swap, execute swap within documented daily caps, kill-switch
- Documented defaults (public materials): ~$50k/day swaps, ~$100k/day DeFi, $20/day x402 — **not guarantees**; confirm in App

Details: AGENT_OS_NOTES.md

## Disclaimer

Not financial advice. Paper/mock is not live Binance execution.
