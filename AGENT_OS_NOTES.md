# Binance Agent OS — Notes for NewsPulse

Agent OS exposes **two rails**. NewsPulse integrates both.

## 1) MCP — exchange / CEX rail

| Key | Value |
|-----|-------|
| URL | `https://agent.binance.com/mcp/agentic` |
| Auth | **Client OAuth flow** — no API keys stored on device |
| OAuth client id (Grok) | `grok` |

### Grok CLI setup (reference)

```text
add binance-mcp-server with url=https://agent.binance.com/mcp/agentic oauth_client_id=grok
```

Do **not** open the MCP endpoint in a browser. Use the MCP client / OAuth flow only.

### Capabilities (agentic MCP)

- **Market data (public):** tickers, order books, klines, funding
- **Account:** agentic **sub-account** balances / positions
- **Trading:** Spot, Margin, Convert, USD-M futures, COIN-M futures
- **Transfers:** within the agentic sub-account only
- **No withdrawal scope**
- **Every trade/transfer requires confirmation**
- Sub-account **starts empty** — fund from the Binance UI

Adapter: `src/adapters/binanceAgentOs.ts`

## 2) BAW — Binance Wallet Agentic Hub / Agentic Wallet

| Key | Value |
|-----|-------|
| Hub | `https://web3.binance.com/agentic-hub` |
| Role | On-chain / wallet ops for agents (swaps, DeFi-style flows, agentic wallet) |

### Documented daily caps (defaults — not guarantees)

From public Agent OS / Agentic Wallet materials. **Confirm live quotas in Binance App / `wallet settings`.** NewsPulse labels these as documented defaults only.

| Cap | Documented default |
|-----|---------------|
| Regular swaps | **$50,000 / day** |
| DeFi operations | **$100,000 / day** (default; App may show a lower user quota) |
| x402-style payments | **$20 / day** |

Quotas are independent (DeFi does not consume the regular swap bucket). Settings are read-only via CLI tools; change in the Binance Wallet App.

Adapter: `src/adapters/bawAgenticWallet.ts`  
Live interface: hub probe / pending confirm; clear auth reject when unavailable. Paper/mock only if NEWSPULSE_MODE=paper|mock.

## Dual-rail facade

`src/adapters/agentOsFacade.ts` exposes **both**:

- **MCP** for CEX trading of top-10 non-stables (BUY/SELL/HOLD)
- **BAW** for optional wallet/on-chain leg when news implies on-chain events (DeFi, exploit, bridge, swap, staking, dApp, etc.), and always visible on the dashboard

## NewsPulse usage

- Default mode: **live** (`NEWSPULSE_MODE=live`). Live orders go through OAuth MCP / Agentic Hub and require confirmation.
- When live MCP or BAW is unavailable in-process, adapters return **REJECTED** with an actionable auth/hub message — not unlabeled paper fills. Paper/mock are opt-in only.
- This project does **not** invent Binance guarantees or fake live fills. Documented caps ≠ contractual SLAs.

## Official docs

- Agentic MCP server: https://developers.binance.com/en/docs/agent-native/mcp-server/agentic
- Agent Native overview: https://developers.binance.com/en/docs/agent-native/overview
- LLms index: https://developers.binance.com/en/docs/llms.txt
- Agentic Hub (wallet): https://web3.binance.com/agentic-hub

## Safety

- Never put Binance API secret keys in `.env` for Agent OS — MCP auth is OAuth.
- Prefer **live** with confirmation for real Agent OS usage; use paper/mock only when explicitly testing local ledgers.
- Kill-switch and risk limits in NewsPulse apply before MCP orders; BAW has its own kill-switch + documented daily-cap checks.
