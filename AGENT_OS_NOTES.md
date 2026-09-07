# Binance Agent OS — Notes for NewsPulse

Agent OS has two rails. NewsPulse uses both. The brain (rules/lexicon/scorer) does not require an LLM; optional src/core/reasoning.ts emits template rationales. MCP hosts such as Grok are optional examples for CEX execution (host-flexible).

## Product loop
1. Brain evaluates free/fixture news
2. Optional x402 micropayment (BAW) for labeled premium signal
3. Premium content merged then brain rescores
4. Risk gates then BUY/SELL/HOLD
5. Live MCP and/or BAW (pending confirm / clear auth reject)

## MCP (CEX)
- URL: https://agent.binance.com/mcp/agentic
- Auth: client OAuth (no API keys on device)
- Example oauth client id: grok (other hosts may differ)
- Adapter: src/adapters/binanceAgentOs.ts

## BAW (Wallet / x402)
- Hub: https://web3.binance.com/agentic-hub
- Documented daily caps (defaults, not guarantees): swap $50k, DeFi $100k, x402 $20
- NewsPulse premium payments stay $1-5
- Adapter: src/adapters/bawAgenticWallet.ts (payX402)
- Premium module: src/core/premiumSignal.ts
- Honesty: fixture premium content in paper/mock, or labeled simulate-after-pending on live pending ack — never claim a live x402 fill that did not happen. Fields: honestyBanner, contentKind, trulyPaid (false on live PENDING/REJECTED).

## Dual-rail facade
src/adapters/agentOsFacade.ts — MCP for CEX + BAW for wallet/on-chain and x402 premium.

## Safety
Never put Binance API secrets in .env. Prefer live with confirmation. Kill-switch and risk limits apply before MCP; BAW has kill-switch + cap checks including x402.

## Official docs
- https://developers.binance.com/en/docs/agent-native/mcp-server/agentic
- https://developers.binance.com/en/docs/agent-native/overview
- https://web3.binance.com/agentic-hub
