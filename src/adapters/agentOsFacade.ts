/**
 * Agent OS dual-rail facade: MCP (CEX) + BAW (Wallet / on-chain).
 *
 * Judges should see both rails:
 * - MCP  — https://agent.binance.com/mcp/agentic (oauth_client_id=grok)
 *          Market data, agentic sub-account, spot/futures under confirmations
 * - BAW  — https://web3.binance.com/agentic-hub
 *          Agentic wallet swaps / DeFi-style flows with documented daily caps
 */
import type { Decision, MarketTick } from "../core/types.js";
import {
  BinanceAgentOsAdapter,
  type AdapterMode,
  type AdapterResult,
  type OrderAck,
  type OrderRequest,
  describeMcpSession,
} from "./binanceAgentOs.js";
import {
  BawAgenticWalletAdapter,
  BAW_DOCUMENTED_DAILY_CAPS_USD,
  BAW_HUB_URL,
  newsImpliesOnChain,
  type BawAdapterResult,
  type BawSwapAck,
  type BawMode,
} from "./bawAgenticWallet.js";

export type { AdapterMode, BawMode };

export interface DualRailStatus {
  mcp: {
    rail: "MCP";
    endpoint: string;
    oauthClientId: string;
    mode: AdapterMode;
    label: string;
  };
  baw: {
    rail: "BAW";
    hubUrl: string;
    mode: BawMode;
    label: string;
    documentedCapsUsd: typeof BAW_DOCUMENTED_DAILY_CAPS_USD;
    killSwitch: boolean;
    remainingSwapCapUsd: number;
  };
}

export interface DualRailMeta {
  mcp: {
    endpoint: string;
    oauthClientId: string;
    usedMock: boolean;
    label: string;
  };
  baw: {
    hubUrl: string;
    usedMock: boolean;
    label: string;
    documentedCapsUsd: typeof BAW_DOCUMENTED_DAILY_CAPS_USD;
    lastActionLabel?: string;
  };
  /** Combined one-liner for legacy UI slots */
  label: string;
  endpoint: string;
  usedMock: boolean;
}

export class AgentOsFacade {
  readonly mcp: BinanceAgentOsAdapter;
  readonly baw: BawAgenticWalletAdapter;

  constructor(opts?: {
    mode?: AdapterMode;
    mcp?: BinanceAgentOsAdapter;
    baw?: BawAgenticWalletAdapter;
  }) {
    const mode = opts?.mode;
    this.mcp = opts?.mcp ?? new BinanceAgentOsAdapter(mode ? { mode } : undefined);
    this.baw =
      opts?.baw ??
      new BawAgenticWalletAdapter(mode ? { mode: mode as BawMode } : undefined);
  }

  get mode(): AdapterMode {
    return this.mcp.mode;
  }

  get endpoint(): string {
    return this.mcp.endpoint;
  }

  async dualStatusLive() {
    const base = this.dualStatus();
    const mcpSess = describeMcpSession();
    const bawAuth = await this.baw.getAuthStatus();
    return {
      ...base,
      mcp: { ...base.mcp, sessionConnected: mcpSess.connected, sessionLabel: mcpSess.label },
      baw: {
        ...base.baw,
        connectionStatus: bawAuth.connectionStatus,
        address: bawAuth.address,
        authLabel: bawAuth.label,
        instructions: bawAuth.instructions,
      },
    };
  }

  dualStatus(): DualRailStatus {
    const baw = this.baw.status();
    return {
      mcp: {
        rail: "MCP",
        endpoint: this.mcp.endpoint,
        oauthClientId: this.mcp.oauthClientId,
        mode: this.mcp.mode,
        label: this.mcp.metaLabel(this.mcp.mode !== "live"),
      },
      baw: {
        rail: "BAW",
        hubUrl: baw.hubUrl,
        mode: baw.mode,
        label: baw.label,
        documentedCapsUsd: baw.documentedCapsUsd,
        killSwitch: baw.killSwitch,
        remainingSwapCapUsd: baw.remainingSwapCapUsd,
      },
    };
  }

  metaLabel(usedMock: boolean): string {
    return `Dual-rail Agent OS — MCP (CEX): ${this.mcp.metaLabel(usedMock)} | BAW (Wallet): ${this.baw.metaLabel(usedMock)}`;
  }

  async getMarketSnapshot(
    fallback: MarketTick[]
  ): Promise<AdapterResult<MarketTick[]>> {
    return this.mcp.getMarketSnapshot(fallback);
  }

  async placeOrder(req: OrderRequest): Promise<AdapterResult<OrderAck>> {
    return this.mcp.placeOrder(req);
  }

  async executeDecision(
    d: Decision
  ): Promise<AdapterResult<OrderAck | null>> {
    return this.mcp.executeDecision(d);
  }

  /**
   * Optional on-chain leg when news implies DeFi / wallet / bridge / exploit, etc.
   * Live is default; pending confirm or clear auth reject if hub unavailable.
   */
  async maybeOnChainWalletAction(opts: {
    newsTexts: string[];
    preferFrom?: string;
    preferTo?: string;
    notionalUsd?: number;
  }): Promise<BawAdapterResult<BawSwapAck | null>> {
    const hit = opts.newsTexts.find((t) => newsImpliesOnChain(t));
    if (!hit) {
      return {
        data: null,
        usedMock: this.baw.mode !== "live",
        label: "BAW skipped — no on-chain news signal",
        hubUrl: this.baw.hubUrl,
        rail: "BAW",
      };
    }

    const notionalUsd = opts.notionalUsd ?? 25;
    // Small notional under documented x402-scale awareness; still under $50k swap cap.
    const fromAsset = opts.preferFrom ?? "USDT";
    const toAsset = opts.preferTo ?? "ETH";
    const amountIn = notionalUsd; // USDT notional
    const quote = await this.baw.quoteSwap({
      fromAsset,
      toAsset,
      amountIn,
      notionalUsd,
      priceHint: toAsset === "ETH" ? 1 / 3500 : 1,
    });

    if (!quote.data.withinDailyCap) {
      return {
        data: {
          swapId: "REJ-cap",
          status: "REJECTED",
          fromAsset,
          toAsset,
          amountIn,
          amountOut: 0,
          notionalUsd,
          requiresConfirmation: false,
          raw: { quote: quote.data, trigger: hit.slice(0, 120) },
        },
        usedMock: quote.usedMock,
        label: `BAW cap block — ${quote.label}`,
        hubUrl: this.baw.hubUrl,
        rail: "BAW",
      };
    }

    const exec = await this.baw.executeSwap({
      fromAsset,
      toAsset,
      amountIn,
      notionalUsd,
      priceHint: quote.data.price,
      clientId: `onchain-${Date.now().toString(36)}`,
    });
    return {
      ...exec,
      label: `${exec.label} | trigger: ${hit.slice(0, 80)}…`,
    };
  }

  buildMeta(opts: {
    mcpUsedMock: boolean;
    bawUsedMock: boolean;
    bawLastActionLabel?: string;
  }): DualRailMeta {
    const usedMock = opts.mcpUsedMock || opts.bawUsedMock;
    return {
      mcp: {
        endpoint: this.mcp.endpoint,
        oauthClientId: this.mcp.oauthClientId,
        usedMock: opts.mcpUsedMock,
        label: this.mcp.metaLabel(opts.mcpUsedMock),
      },
      baw: {
        hubUrl: this.baw.hubUrl,
        usedMock: opts.bawUsedMock,
        label: this.baw.metaLabel(opts.bawUsedMock),
        documentedCapsUsd: { ...BAW_DOCUMENTED_DAILY_CAPS_USD },
        lastActionLabel: opts.bawLastActionLabel,
      },
      label: this.metaLabel(usedMock),
      endpoint: `${this.mcp.endpoint} + ${BAW_HUB_URL}`,
      usedMock,
    };
  }
}

export { BAW_HUB_URL, BAW_DOCUMENTED_DAILY_CAPS_USD, newsImpliesOnChain };
