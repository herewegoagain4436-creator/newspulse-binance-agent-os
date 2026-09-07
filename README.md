# NewsPulse

Track A — Binance Agent OS Mini Hackathon 2026.

Hook: Conflicting free news to tiny x402 (BAW/baw CLI) to brain rescores to risk to live MCP/BAW.
MCP host flexible (Grok = example only). Brain = rules/lexicon/scorer (no LLM).

## Real rails (not stubs)

- BAW: shells to official baw CLI (package @binance/agentic-wallet). Auth: baw auth signin then App QR then baw auth verify. Never invents PENDING from hub webpage HTTP 200.
- MCP: honest host bridge (NEWSPULSE_MCP_BRIDGE=cli / session env). Fail closed without OAuth session.
- Dashboard: Connect Wallet (baw) + MCP session status.

## Quick start

npm install
Install baw CLI globally from @binance/agentic-wallet
npm run judge
npm run judge:fixture
npm test
npm run build
npm run dev

See JUDGE.md and AGENT_OS_NOTES.md.

Disclaimer: not financial advice. No fake live fills.
