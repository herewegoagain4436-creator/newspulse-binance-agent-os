/**
 * Binance Agent OS MCP adapter (agentic).
 *
 * Endpoint: https://agent.binance.com/mcp/agentic
 * Auth: client OAuth (oauth_client_id=grok for Grok) — NO API keys on device.
 * Do not open the MCP URL in a browser.
 *
 * Default: live (NEWSPULSE_MODE=live). Paper/mock are explicit opt-in only.
 * Live path requires MCP host OAuth (oauth_client_id=grok). Missing auth fails clearly — never unlabeled paper fills.
 *
 * @see ./AGENT_OS_NOTES.md
 * @see https://developers.binance.com/en/docs/agent-native/mcp-server/agentic
 */
import type { Decision, MarketTick, SymbolId } from "../core/types.js";
import { pairFor } from "../core/universe.js";
import { envStr } from "../core/env.js";

export const AGENT_OS_MCP_URL =
  envStr("BINANCE_AGENT_OS_MCP_URL", "https://agent.binance.com/mcp/agentic");

/** Grok / Cursor MCP registration uses this OAuth client id */
export const AGENT_OS_OAUTH_CLIENT_ID =
  envStr("BINANCE_AGENT_OS_OAUTH_CLIENT_ID", "grok");

export type AdapterMode = "paper" | "mock" | "live";

export interface AdapterResult<T> {
  data: T;
  usedMock: boolean;
  label: string;
  endpoint: string;
  oauthClientId: string;
}

export interface OrderRequest {
  symbol: SymbolId;
  side: "BUY" | "SELL";
  sizeUsd: number;
  price: number;
  clientOrderId: string;
}

export interface OrderAck {
  orderId: string;
  status: "FILLED_PAPER" | "REJECTED" | "SUBMITTED_MOCK" | "SUBMITTED_LIVE_PENDING_CONFIRM";
  filledQty: number;
  avgPrice: number;
  requiresConfirmation: boolean;
  raw?: unknown;
}

function modeFromEnv(): AdapterMode {
  const m = envStr("NEWSPULSE_MODE", "live").toLowerCase();
  if (m === "live" || m === "mock" || m === "paper") return m;
  return "live";
}

/**
 * Probe MCP reachability. OAuth tokens live in the MCP host (e.g. Grok),
 * not as API keys in this app — so a bare fetch often fails; live mode then rejects with auth required.
 */
async function tryMcpToolsList(endpoint: string): Promise<boolean> {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return false;
    const body = await res.json().catch(() => null);
    return body != null && typeof body === "object";
  } catch {
    return false;
  }
}

function mockFill(req: OrderRequest): OrderAck {
  return {
    orderId: `MOCK-${req.clientOrderId}`,
    status: "SUBMITTED_MOCK",
    filledQty: req.sizeUsd / req.price,
    avgPrice: req.price,
    requiresConfirmation: false,
    raw: {
      mock: true,
      note: "MOCK — Agent OS MCP/OAuth not available in-process; not a live Binance order",
      pair: pairFor(req.symbol),
      oauthClientId: AGENT_OS_OAUTH_CLIENT_ID,
    },
  };
}


function liveAuthRequired(req: OrderRequest, reason: string): OrderAck {
  return {
    orderId: `AUTH-${req.clientOrderId}`,
    status: "REJECTED",
    filledQty: 0,
    avgPrice: req.price,
    requiresConfirmation: false,
    raw: {
      live: true,
      authRequired: true,
      reason,
      note: "LIVE auth required — register Binance Agent OS MCP with oauth_client_id=grok in the MCP host (e.g. Grok). Do not open the MCP URL in a browser. Trades still need user confirmation after auth.",
      pair: pairFor(req.symbol),
      oauthClientId: AGENT_OS_OAUTH_CLIENT_ID,
      endpoint: AGENT_OS_MCP_URL,
    },
  };
}

function paperFill(req: OrderRequest): OrderAck {
  return {
    orderId: `PAPER-${req.clientOrderId}`,
    status: "FILLED_PAPER",
    filledQty: req.sizeUsd / req.price,
    avgPrice: req.price,
    requiresConfirmation: false,
    raw: {
      paper: true,
      note: "PAPER SIM — local fill only; not submitted to Binance",
      pair: pairFor(req.symbol),
    },
  };
}

export class BinanceAgentOsAdapter {
  readonly endpoint: string;
  readonly mode: AdapterMode;
  readonly oauthClientId: string;
  private liveOk: boolean | null = null;

  constructor(opts?: { endpoint?: string; mode?: AdapterMode; oauthClientId?: string }) {
    this.endpoint = opts?.endpoint ?? AGENT_OS_MCP_URL;
    this.mode = opts?.mode ?? modeFromEnv();
    this.oauthClientId = opts?.oauthClientId ?? AGENT_OS_OAUTH_CLIENT_ID;
  }

  async resolveLive(): Promise<boolean> {
    if (this.mode === "mock" || this.mode === "paper") {
      this.liveOk = false;
      return false;
    }
    if (this.liveOk != null) return this.liveOk;
    this.liveOk = await tryMcpToolsList(this.endpoint);
    return this.liveOk;
  }

  metaLabel(usedMock: boolean): string {
    if (this.mode === "paper") {
      return "PAPER SIM (opt-in) — local fills; Agent OS OAuth unused";
    }
    if (this.mode === "mock") {
      return `MOCK — MCP OAuth (client_id=${this.oauthClientId}) not in-process; not live Binance`;
    }
    if (this.mode === "live") {
      return "LIVE via Agent OS MCP — trades require user confirmation; sub-account must be funded in Binance UI";
    }
    if (usedMock) {
      return `MOCK — MCP OAuth (client_id=${this.oauthClientId}) not in-process; not live Binance`;
    }
    return "LIVE via Agent OS MCP — trades require user confirmation; sub-account must be funded in Binance UI";
  }

  async getMarketSnapshot(fallback: MarketTick[]): Promise<AdapterResult<MarketTick[]>> {
    const live = await this.resolveLive();
    if (this.mode === "live") {
      return {
        data: fallback,
        usedMock: false,
        label: live
          ? "Fixture market — wire MCP host public tickers when OAuth session is available"
          : "Fixture market snapshot — live MCP public tickers require host OAuth",
        endpoint: this.endpoint,
        oauthClientId: this.oauthClientId,
      };
    }
    return {
      data: fallback,
      usedMock: true,
      label: "Fixture market snapshot (paper/mock mode)",
      endpoint: this.endpoint,
      oauthClientId: this.oauthClientId,
    };
  }

  async placeOrder(req: OrderRequest): Promise<AdapterResult<OrderAck>> {
    if (this.mode === "paper") {
      return {
        data: paperFill(req),
        usedMock: false,
        label: "PAPER SIM fill (no Agent OS submit)",
        endpoint: this.endpoint,
        oauthClientId: this.oauthClientId,
      };
    }
    if (this.mode === "mock") {
      return {
        data: mockFill(req),
        usedMock: true,
        label: "MOCK order ack",
        endpoint: this.endpoint,
        oauthClientId: this.oauthClientId,
      };
    }

    const live = await this.resolveLive();
    if (!live) {
      return {
        data: liveAuthRequired(
          req,
          "MCP tools/list unreachable without host OAuth session"
        ),
        usedMock: false,
        label:
          "LIVE auth required — MCP/OAuth unavailable in-process; add Agent OS MCP with oauth_client_id=grok",
        endpoint: this.endpoint,
        oauthClientId: this.oauthClientId,
      };
    }

    try {
      // Live trades MUST go through OAuth MCP host and require confirmation.
      // No API keys. Sub-account transfers only; no withdrawals.
      const res = await fetch(this.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: req.clientOrderId,
          method: "tools/call",
          params: {
            name: "place_order",
            arguments: {
              symbol: pairFor(req.symbol),
              side: req.side,
              notional: req.sizeUsd,
              type: "MARKET",
              requireConfirmation: true,
            },
          },
        }),
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) throw new Error(`MCP HTTP ${res.status}`);
      const raw = await res.json();
      return {
        data: {
          orderId: `LIVE-PENDING-${req.clientOrderId}`,
          status: "SUBMITTED_LIVE_PENDING_CONFIRM",
          filledQty: 0,
          avgPrice: req.price,
          requiresConfirmation: true,
          raw,
        },
        usedMock: false,
        label: "LIVE MCP submit — awaiting user confirmation (Agent OS rule)",
        endpoint: this.endpoint,
        oauthClientId: this.oauthClientId,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        data: liveAuthRequired(req, `live MCP place_order failed: ${msg}`),
        usedMock: false,
        label:
          "LIVE auth/submit failed — ensure MCP host OAuth (oauth_client_id=grok) and retry; not a paper fill",
        endpoint: this.endpoint,
        oauthClientId: this.oauthClientId,
      };
    }
  }

  async executeDecision(d: Decision): Promise<AdapterResult<OrderAck | null>> {
    if (!d.executed || d.side === "HOLD") {
      return {
        data: null,
        usedMock: this.mode !== "live",
        label: "no order",
        endpoint: this.endpoint,
        oauthClientId: this.oauthClientId,
      };
    }
    return this.placeOrder({
      symbol: d.symbol,
      side: d.side,
      sizeUsd: d.sizeUsd,
      price: d.price,
      clientOrderId: d.id,
    });
  }
}
