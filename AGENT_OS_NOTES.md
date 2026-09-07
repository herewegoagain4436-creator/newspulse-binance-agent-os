# Binance Agent OS — Notes for NewsPulse

Agent OS has two rails. NewsPulse uses both with REAL adapters (not hub-HTTP stubs).

## Product loop
1. Brain evaluates free/fixture news (live public market when NEWSPULSE_DATA=live/auto)
2. Optional x402 micropayment (BAW via baw CLI) for labeled premium signal
3. Premium content merged only when truly paid (paper/mock) OR ALLOW_SIMULATED_PREMIUM=1
4. Risk gates then BUY/SELL/HOLD
5. Live MCP host bridge and/or baw CLI (fail closed if unauthenticated)

## MCP (CEX)
- URL: https://agent.binance.com/mcp/agentic
- Auth: MCP host OAuth (example oauth_client_id=grok)
- Adapter: src/adapters/binanceAgentOs.ts + mcpBridge.ts
- Optional NEWSPULSE_MCP_BRIDGE=cli → scripts/mcp-bridge.mjs
- Never bare-fetch place_order without a session

## BAW (Wallet / x402)
- Docs hub: https://web3.binance.com/agentic-hub (documentation only — HTTP 200 is NOT auth)
- CLI: baw from @binance/agentic-wallet
- Auth: baw auth signin → App QR → baw auth verify
- Adapter: src/adapters/bawAgenticWallet.ts + bawExec.ts + bawLive.ts
- Caps from baw wallet settings / documented defaults
- Live spends gated by NEWSPULSE_BAW_ALLOW_SPEND=1 + App confirmation

## Safety
No API secrets in repo. Prefer live with confirmation. Kill-switch + risk limits apply.

## Official docs
- https://developers.binance.com/en/docs/agent-native/mcp-server/agentic
- https://developers.binance.com/en/docs/agent-native/overview
- https://web3.binance.com/agentic-hub
