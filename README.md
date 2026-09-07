# NewsPulse

Track A — Binance Agent OS Mini Hackathon 2026.

**Hook:** Conflicting free news → tiny **x402** micropay (BAW) → brain **rescores** → **risk** → live **MCP**/BAW. MCP host flexible (**Grok = example only**). Brain = rules/lexicon/scorer (**no LLM**); `src/core/reasoning.ts` adds template rationales.

## Flow
1. Brain evaluates free/fixture news
2. Optionally pay tiny x402 for premium signal (low confidence / conflicts / flag)
3. Feed premium into brain
4. BUY/SELL/HOLD with risk gates
5. Live MCP/BAW — pending confirm or clear auth reject; no silent paper fills

## Dual-rail
- MCP CEX: https://agent.binance.com/mcp/agentic
- BAW Wallet/x402: https://web3.binance.com/agentic-hub

Live default. MCP hosts flexible (Grok is one optional example only).

## Features
- Top-10 non-stable universe
- Explainable brain + premiumSignal module ($1-5 under ~$20/day x402 cap)
- Risk gates + dual adapters
- Dashboard/CLI honesty banners: SIMULATED after PENDING vs truly paid; live never claims PAID fill
- Template rationales in CLI + dashboard (`reasoning.ts`)

## Quick start
Install deps, run package script `judge` (or `demo`) for live smoke + checklist, then Vite dashboard. Keep NEWSPULSE_MODE=live. See JUDGE.md (60-90s script).

## Key files
- src/core/premiumSignal.ts, reasoning.ts, agent.ts
- src/adapters/bawAgenticWallet.ts (payX402)
- src/cli/demo.ts, src/ui/
- JUDGE.md, AGENT_OS_NOTES.md, DEMO.md, BRIEF.md

## Disclaimer
Not financial advice. No fake live fills. Documented BAW caps are public defaults, not guarantees. Premium x402 stays tiny.
