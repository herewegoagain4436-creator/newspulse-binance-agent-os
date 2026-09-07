# NewsPulse

Track A product for the **Binance Agent OS Mini Hackathon 2026**.

News-driven multi-asset trading workflow agent: **news to explainable scores to risk-checked BUY/SELL/HOLD** across the **top 10 market-cap coins excluding stablecoins**.

## Dual-rail Agent OS

Binance Agent OS has **both** rails — NewsPulse wires both:

| Rail | Role | Endpoint |
|------|------|----------|
| **MCP** | CEX: market data, agentic sub-account, spot/futures under confirmations | `https://agent.binance.com/mcp/agentic` (`oauth_client_id=grok`) |
| **BAW** | Wallet / on-chain: Agentic Hub swaps & DeFi-style flows with daily caps | `https://web3.binance.com/agentic-hub` |

**Live is the default.** Missing OAuth/MCP/hub fails with actionable auth errors — no silent paper fills.

## Features

- Universe: BTC, ETH, BNB, SOL, XRP, DOGE, ADA, TRX, AVAX, LINK (hardcoded top-10 non-stables in `src/core/universe.ts`; optional best-effort CoinGecko refresh when online — falls back to hardcoded)
- Explainable scoring with keyword lexicon + symbol mapping + fixture sentiment hints
- Risk: max position per asset, max daily trades, cooldown, portfolio concentration, kill-switch
- **MCP adapter** — OAuth (`oauth_client_id=grok`), no API keys on device
- **BAW adapter** — live Agentic Hub path (pending confirm / auth reject); paper/mock opt-in only
- Dual-rail facade + dashboard statuses for both adapters
- Vite + React dashboard + CLI live smoke
- `npm run demo` (live smoke) checks dual-rail live status + agent loop — not paper BUY/SELL fills

## Architecture

```mermaid
flowchart LR
  News[News fixtures / feed] --> Scorer[Explainable scorer]
  Scorer --> Risk[Risk gates]
  Risk --> Decision[BUY / SELL / HOLD]
  Decision --> MCP[MCP adapter — CEX live]
  Decision -.->|on-chain news| BAW[BAW adapter — Wallet live]
  MCP --> Pending[SUBMITTED_LIVE_PENDING_CONFIRM]
  BAW --> HubPending[LIVE pending / auth reject]
  MCP -.->|OAuth MCP| BinanceMcp[agent.binance.com/mcp/agentic]
  BAW -.->|Agentic Hub| BinanceBaw[web3.binance.com/agentic-hub]
  Pending --> UI[Dashboard + CLI]
  HubPending --> UI
```

## Quick start

> **Live default.** Keep `NEWSPULSE_MODE=live`. Live trades still require Agent OS confirmation. Without OAuth expect clear auth errors — not fake fills.

```bash
git clone https://github.com/herewegoagain4436-creator/newspulse-binance-agent-os.git
cd newspulse-binance-agent-os
npm install
npm run demo
npm run dev
```

Copy `.env.example` to `.env` if you want to tweak thresholds. Keep `NEWSPULSE_MODE=live` unless you explicitly opt into `paper` or `mock`.

## Agent OS usage

See **AGENT_OS_NOTES.md** for MCP + BAW endpoints, OAuth, documented wallet caps, scopes, and doc URLs.

Grok MCP registration (reference):

```text
add binance-mcp-server with url=https://agent.binance.com/mcp/agentic oauth_client_id=grok
```

Do **not** open the MCP endpoint in a browser.

BAW hub (wallet): https://web3.binance.com/agentic-hub

## Scripts

| Script | Purpose |
|--------|--------|
| `npm run demo` | Live smoke: agent loop + dual-rail status (pending confirm or auth errors) |
| `npm run dev` | Vite dashboard |
| `npm run cli` / `npm run agent:once` | JSON once-run |
| `npm run build` | Typecheck + Vite build |

## Key files

- `src/core/` — universe, scorer, risk, portfolio, agent loop
- `src/adapters/binanceAgentOs.ts` — MCP CEX adapter (live default; paper/mock opt-in)
- `src/adapters/bawAgenticWallet.ts` — BAW wallet / Agentic Hub adapter
- `src/adapters/agentOsFacade.ts` — dual-rail facade (MCP + BAW)
- `src/cli/demo.ts` — live smoke runner
- `src/ui/` — React dashboard (both adapter statuses)
- `src/data/fixtures/` — news + market snapshots
- `AGENT_OS_NOTES.md`, `DEMO.md`, `BRIEF.md`

## Disclaimer

Not financial advice. Live Agent OS trades require user confirmation. This app does **not** invent fake live fills. Paper/mock are opt-in only; the agentic sub-account starts empty and has no withdrawal scope. BAW daily caps cited in-code are **documented defaults** from public materials (e.g. ~$50k swaps / ~$100k DeFi / $20 x402) — **not invented guarantees**; confirm live quotas in the Binance App / wallet settings.
