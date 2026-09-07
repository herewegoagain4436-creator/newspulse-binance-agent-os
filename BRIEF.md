# NewsPulse — Track A (Binance Agent OS Mini Hackathon 2026)

## Product
NewsPulse has its own **brain** (rules / lexicon / scorer — not requiring an LLM). Flow:

1. Brain evaluates free / fixture news
2. When useful, pay a small amount via **x402** for a **premium signal**
3. Feed premium signal into the brain
4. Brain decides BUY/SELL/HOLD with risk gates
5. Act via live Agent OS: **MCP (CEX)** and/or **BAW** — live default; no silent paper fills; pending confirm / clear auth reject OK

Grok (or other MCP hosts) are optional hosts for Agent OS — not hard-required for the brain.

## Universe (required)
Top 10 market-cap coins EXCLUDING stablecoins (not BTC-only).

BTC, ETH, BNB, SOL, XRP, DOGE, ADA, TRX, AVAX, LINK

Excluded stables: USDT, USDC, DAI, FDUSD, TUSD, USDE, etc.

## Agent OS dual-rail
- **MCP** — https://agent.binance.com/mcp/agentic (OAuth client flow; example `oauth_client_id=grok`). Market data, agentic sub-account, spot/futures under confirmations.
- **BAW** — https://web3.binance.com/agentic-hub. On-chain / agentic wallet (swaps, DeFi-style flows, **x402** micropayments) with documented daily caps ($50k swap / $100k DeFi / $20 x402 — public defaults, not guarantees).

## Defaults
- **Live** mode (`NEWSPULSE_MODE=live`)
- Premium x402 notional tiny ($1–5) under documented ~$20/day cap
- Dual adapters + x402 premium status visible in dashboard + live smoke CLI
- Auth/hub failures are explicit — never unlabeled paper success in live
- Paper/mock only when explicitly opted in

See README.md, DEMO.md, AGENT_OS_NOTES.md.
