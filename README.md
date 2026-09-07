# NewsPulse

Track A — Binance Agent OS Mini Hackathon 2026.

**Product:** brain (rules/lexicon/scorer, no LLM required) evaluates free news; may pay tiny x402 for premium signal; rescores; risk-gates BUY/SELL/HOLD; acts via live MCP and/or BAW.

## Flow
1. Brain evaluates free/fixture news
2. Optionally pay tiny x402 for premium signal (low confidence / conflicts / flag)
3. Feed premium into brain
4. BUY/SELL/HOLD with risk gates
5. Live MCP/BAW — pending confirm or clear auth reject; no silent paper fills

## Dual-rail
- MCP CEX: https://agent.binance.com/mcp/agentic
- BAW Wallet/x402: https://web3.binance.com/agentic-hub

Live default. MCP hosts flexible (Grok is one optional example).

## Features
- Top-10 non-stable universe
- Explainable brain + premiumSignal module ($1-5 under ~$20/day x402 cap)
- Risk gates + dual adapters
- Dashboard shows x402 paid/pending/rejected

## Quick start
Clone the repo, install deps, run the demo script, then the Vite dashboard. Keep NEWSPULSE_MODE=live.

## Key files
- src/core/premiumSignal.ts, agent.ts
- src/adapters/bawAgenticWallet.ts (payX402)
- src/cli/demo.ts, src/ui/
- AGENT_OS_NOTES.md, DEMO.md, BRIEF.md

## Disclaimer
Not financial advice. No fake live fills. Documented BAW caps are public defaults, not guarantees. Premium x402 stays tiny.
