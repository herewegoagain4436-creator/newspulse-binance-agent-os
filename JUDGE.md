# NewsPulse Judge guide (Track A)

Hook: Conflicting free news to tiny x402 to rescore to risk to live MCP/BAW.
MCP host flexible (Grok example only). Brain = rules/lexicon/scorer.

## Dual judge lanes

Integration lane (package script judge): PASS means real session checks OR honest fail-closed. PENDING only after real CLI/session tool call — never hub HTTP stubs.

Fixture lane (package script judge:fixture): brain-only paper/fixture. Not a live Agent OS claim.

REJECTED/UNCONNECTED without QR/OAuth is honesty, not full Agent OS success.

## baw install

Install the official agentic-wallet CLI globally (package name @binance/agentic-wallet).
Then: baw auth signin --json → open urlForWeb / scan QR in Binance App → baw auth verify --qrCodeId <id> --json.

## MCP

Connect via MCP host (example: Grok /mcps OAuth). Optional NEWSPULSE_MCP_BRIDGE=cli with session file + wrapper. Do not open the MCP URL in a browser.

## Grade

- Dual-rail MCP + BAW with real baw CLI / honest MCP bridge
- Brain without LLM
- x402 honesty; ALLOW_SIMULATED_PREMIUM defaults OFF
- Live default; no invented PENDING from hub webpage
- Tests via package script test

Disclaimer: not financial advice. Live spends need confirmation (NEWSPULSE_BAW_ALLOW_SPEND=1 + App).
