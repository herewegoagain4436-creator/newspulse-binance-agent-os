# NewsPulse — Track A (Binance Agent OS Mini Hackathon 2026)

## Product
AI trading-workflow agent: news to explainable scores to BUY/SELL/HOLD with paper/sim execution via **Binance Agent OS dual-rail** adapters — **MCP (CEX)** + **BAW (Wallet / Agentic Hub)**.

## Universe (required)
Top 10 market-cap coins EXCLUDING stablecoins (not BTC-only).

Typical set (dynamic CoinGecko fetch when available, else hardcoded with update path in src/core/universe.ts):

BTC, ETH, BNB, SOL, XRP, DOGE, ADA, TRX, AVAX, LINK

Excluded stables: USDT, USDC, DAI, FDUSD, TUSD, USDE, etc.

News scoring maps headlines to multiple affected symbols.

## Agent OS dual-rail
- **MCP** — https://agent.binance.com/mcp/agentic (OAuth `oauth_client_id=grok`; no API keys on device). Market data, agentic sub-account, spot/futures under confirmations.
- **BAW** — https://web3.binance.com/agentic-hub. On-chain / agentic wallet (swaps, DeFi-style flows) with documented daily caps ($50k swap / $100k DeFi / $20 x402 — public defaults, not guarantees). Paper/mock when live unavailable; labeled clearly.

## Defaults
- Paper/sim mode
- Dual adapters always visible in dashboard + demo
- Mocks explicitly labeled when live MCP/BAW unavailable

See README.md, DEMO.md, AGENT_OS_NOTES.md.
