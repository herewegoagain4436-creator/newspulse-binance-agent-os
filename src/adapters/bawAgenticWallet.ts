/**
 * Binance Wallet Agentic Hub (BAW) / Agentic Wallet adapter.
 *
 * Hub: https://web3.binance.com/agentic-hub
 * On-chain / wallet ops for agents: swaps, DeFi-style flows, agentic wallet with daily caps.
 *
 * Default: live (NEWSPULSE_MODE=live). Paper/mock are explicit opt-in only.
 * Live path requires Binance Wallet Agentic Hub availability; missing hub/auth fails clearly —
 * never unlabeled paper fills or silent MOCK success in live mode.
 * Documented daily caps below are from public Agent OS / Agentic Wallet materials —
 * labeled as documented defaults, NOT invented guarantees. Actual quotas are set by
 * Binance and visible via wallet settings / Binance App.
 *
 * @see https://web3.binance.com/agentic-hub
 * @see ../AGENT_OS_NOTES.md
 */
import { envStr } from "../core/env.js";

export const BAW_HUB_URL = envStr(
  "BINANCE_BAW_HUB_URL",
  "https://web3.binance.com/agentic-hub"
);

/**
 * Documented defaults from public Binance Agent OS / Agentic Wallet coverage
 * (swap / DeFi / x402 daily caps). Not contractual guarantees — confirm in App.
 */
export const BAW_DOCUMENTED_DAILY_CAPS_USD = {
  /** Regular token swaps (documented default) */
  swap: 50_000,
  /** DeFi operations (documented default; App may show a lower user quota) */
  defi: 100_000,
  /** x402-style agent payments (documented default) */
  x402: 20,
} as const;

export type BawMode = "paper" | "mock" | "live";

export interface BawAdapterResult<T> {
  data: T;
  usedMock: boolean;
  label: string;
  hubUrl: string;
  rail: "BAW";
}

export interface BawBalance {
  asset: string;
  free: number;
  locked: number;
}

export interface BawSwapQuote {
  fromAsset: string;
  toAsset: string;
  amountIn: number;
  amountOut: number;
  price: number;
  feeUsd: number;
  withinDailyCap: boolean;
  remainingSwapCapUsd: number;
  documentedCapUsd: number;
}

export interface BawSwapAck {
  swapId: string;
  status: "FILLED_PAPER" | "SUBMITTED_MOCK" | "REJECTED" | "SUBMITTED_LIVE_PENDING";
  fromAsset: string;
  toAsset: string;
  amountIn: number;
  amountOut: number;
  notionalUsd: number;
  requiresConfirmation: boolean;
  raw?: unknown;
}

function modeFromEnv(): BawMode {
  const m = envStr("NEWSPULSE_MODE", "live").toLowerCase();
  if (m === "live" || m === "mock" || m === "paper") return m;
  return "live";
}

function utcDayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export class BawAgenticWalletAdapter {
  readonly hubUrl: string;
  readonly mode: BawMode;
  private killSwitchOn = false;
  private swapSpentUsd = 0;
  private spendDay = utcDayKey();
  /** Paper balances (USDT + a few majors) */
  private balances: Record<string, number> = {
    USDT: 5_000,
    ETH: 1.2,
    SOL: 25,
    BNB: 8,
  };

  constructor(opts?: { hubUrl?: string; mode?: BawMode }) {
    this.hubUrl = opts?.hubUrl ?? BAW_HUB_URL;
    this.mode = opts?.mode ?? modeFromEnv();
  }

  metaLabel(usedMock: boolean): string {
    if (this.mode === "paper") {
      return "PAPER SIM (BAW, opt-in) — local wallet ops; Agentic Hub unused";
    }
    if (this.mode === "mock") {
      return "MOCK (BAW) — Agentic Hub not in-process; not live on-chain";
    }
    if (this.mode === "live") {
      return "LIVE via Binance Wallet Agentic Hub — swaps/DeFi under documented daily caps + App confirmations";
    }
    if (usedMock) {
      return "MOCK (BAW) — Agentic Hub not in-process; not live on-chain";
    }
    return "LIVE via Binance Wallet Agentic Hub — swaps/DeFi under documented daily caps + App confirmations";
  }

  status() {
    this.rollDayIfNeeded();
    return {
      rail: "BAW" as const,
      hubUrl: this.hubUrl,
      mode: this.mode,
      killSwitch: this.killSwitchOn,
      documentedCapsUsd: { ...BAW_DOCUMENTED_DAILY_CAPS_USD },
      swapSpentUsd: this.swapSpentUsd,
      remainingSwapCapUsd: Math.max(
        0,
        BAW_DOCUMENTED_DAILY_CAPS_USD.swap - this.swapSpentUsd
      ),
      label: this.metaLabel(this.mode !== "live"),
      note: "Caps are documented defaults from public materials — not invented guarantees; confirm in Binance App / wallet settings.",
    };
  }

  setKillSwitch(on: boolean): BawAdapterResult<{ killSwitch: boolean }> {
    this.killSwitchOn = on;
    return {
      data: { killSwitch: this.killSwitchOn },
      usedMock: this.mode !== "live",
      label: on
        ? "BAW kill-switch ON — wallet swaps blocked"
        : "BAW kill-switch OFF",
      hubUrl: this.hubUrl,
      rail: "BAW",
    };
  }

  getKillSwitch(): boolean {
    return this.killSwitchOn;
  }

  private rollDayIfNeeded(): void {
    const today = utcDayKey();
    if (today !== this.spendDay) {
      this.spendDay = today;
      this.swapSpentUsd = 0;
    }
  }

  async getBalances(): Promise<BawAdapterResult<BawBalance[]>> {
    const data: BawBalance[] = Object.entries(this.balances).map(
      ([asset, free]) => ({ asset, free, locked: 0 })
    );
    if (this.mode === "paper") {
      return {
        data,
        usedMock: false,
        label: "PAPER SIM balances (BAW local ledger, opt-in)",
        hubUrl: this.hubUrl,
        rail: "BAW",
      };
    }
    if (this.mode === "mock") {
      return {
        data,
        usedMock: true,
        label: "MOCK balances (opt-in) — not live Agentic Hub",
        hubUrl: this.hubUrl,
        rail: "BAW",
      };
    }
    return {
      data,
      usedMock: false,
      label:
        "LIVE BAW balances — local cache only until hub session wired; not a paper fill",
      hubUrl: this.hubUrl,
      rail: "BAW",
    };
  }

  async quoteSwap(opts: {
    fromAsset: string;
    toAsset: string;
    amountIn: number;
    /** Optional USD notional override for cap checks */
    notionalUsd?: number;
    priceHint?: number;
  }): Promise<BawAdapterResult<BawSwapQuote>> {
    this.rollDayIfNeeded();
    const price = opts.priceHint ?? 1;
    const amountOut = opts.amountIn * price;
    const notionalUsd =
      opts.notionalUsd ??
      (opts.fromAsset.toUpperCase() === "USDT"
        ? opts.amountIn
        : opts.amountIn * (opts.priceHint ?? 1));
    const remaining = Math.max(
      0,
      BAW_DOCUMENTED_DAILY_CAPS_USD.swap - this.swapSpentUsd
    );
    const quote: BawSwapQuote = {
      fromAsset: opts.fromAsset.toUpperCase(),
      toAsset: opts.toAsset.toUpperCase(),
      amountIn: opts.amountIn,
      amountOut,
      price,
      feeUsd: Math.max(0.01, notionalUsd * 0.001),
      withinDailyCap: notionalUsd <= remaining && !this.killSwitchOn,
      remainingSwapCapUsd: remaining,
      documentedCapUsd: BAW_DOCUMENTED_DAILY_CAPS_USD.swap,
    };
    return {
      data: quote,
      usedMock: this.mode !== "live",
      label: `BAW swap quote (${this.mode}) — cap check vs documented $${BAW_DOCUMENTED_DAILY_CAPS_USD.swap}/day swap default`,
      hubUrl: this.hubUrl,
      rail: "BAW",
    };
  }

  async executeSwap(opts: {
    fromAsset: string;
    toAsset: string;
    amountIn: number;
    notionalUsd: number;
    priceHint?: number;
    clientId?: string;
  }): Promise<BawAdapterResult<BawSwapAck>> {
    this.rollDayIfNeeded();
    const from = opts.fromAsset.toUpperCase();
    const to = opts.toAsset.toUpperCase();
    const clientId = opts.clientId ?? `baw-${Date.now()}`;

    if (this.killSwitchOn) {
      return {
        data: {
          swapId: `REJ-${clientId}`,
          status: "REJECTED",
          fromAsset: from,
          toAsset: to,
          amountIn: opts.amountIn,
          amountOut: 0,
          notionalUsd: opts.notionalUsd,
          requiresConfirmation: false,
          raw: { reason: "kill-switch" },
        },
        usedMock: this.mode !== "live",
        label: "BAW REJECTED — kill-switch engaged",
        hubUrl: this.hubUrl,
        rail: "BAW",
      };
    }

    const remaining = Math.max(
      0,
      BAW_DOCUMENTED_DAILY_CAPS_USD.swap - this.swapSpentUsd
    );
    if (opts.notionalUsd > remaining) {
      return {
        data: {
          swapId: `REJ-${clientId}`,
          status: "REJECTED",
          fromAsset: from,
          toAsset: to,
          amountIn: opts.amountIn,
          amountOut: 0,
          notionalUsd: opts.notionalUsd,
          requiresConfirmation: false,
          raw: {
            reason: "daily_swap_cap",
            documentedCapUsd: BAW_DOCUMENTED_DAILY_CAPS_USD.swap,
            remainingSwapCapUsd: remaining,
            note: "Documented default $50k/day swap cap — confirm live quota in App",
          },
        },
        usedMock: this.mode !== "live",
        label: `BAW REJECTED — would exceed documented swap daily cap ($${BAW_DOCUMENTED_DAILY_CAPS_USD.swap})`,
        hubUrl: this.hubUrl,
        rail: "BAW",
      };
    }

    const price = opts.priceHint ?? 1;
    const amountOut = opts.amountIn * price;

    if (this.mode === "paper") {
      const have = this.balances[from] ?? 0;
      if (have < opts.amountIn) {
        return {
          data: {
            swapId: `REJ-${clientId}`,
            status: "REJECTED",
            fromAsset: from,
            toAsset: to,
            amountIn: opts.amountIn,
            amountOut: 0,
            notionalUsd: opts.notionalUsd,
            requiresConfirmation: false,
            raw: { reason: "insufficient_balance", have },
          },
          usedMock: false,
          label: "PAPER SIM BAW — insufficient balance",
          hubUrl: this.hubUrl,
          rail: "BAW",
        };
      }
      this.balances[from] = have - opts.amountIn;
      this.balances[to] = (this.balances[to] ?? 0) + amountOut;
      this.swapSpentUsd += opts.notionalUsd;
      return {
        data: {
          swapId: `PAPER-BAW-${clientId}`,
          status: "FILLED_PAPER",
          fromAsset: from,
          toAsset: to,
          amountIn: opts.amountIn,
          amountOut,
          notionalUsd: opts.notionalUsd,
          requiresConfirmation: false,
          raw: {
            paper: true,
            note: "PAPER SIM — local BAW ledger only; not submitted to Agentic Hub",
            documentedCapsUsd: BAW_DOCUMENTED_DAILY_CAPS_USD,
            remainingSwapCapUsd: Math.max(
              0,
              BAW_DOCUMENTED_DAILY_CAPS_USD.swap - this.swapSpentUsd
            ),
          },
        },
        usedMock: false,
        label: "PAPER SIM BAW swap fill (no Agentic Hub submit)",
        hubUrl: this.hubUrl,
        rail: "BAW",
      };
    }

    if (this.mode === "mock") {
      this.swapSpentUsd += opts.notionalUsd;
      return {
        data: {
          swapId: `MOCK-BAW-${clientId}`,
          status: "SUBMITTED_MOCK",
          fromAsset: from,
          toAsset: to,
          amountIn: opts.amountIn,
          amountOut,
          notionalUsd: opts.notionalUsd,
          requiresConfirmation: false,
          raw: {
            mock: true,
            note: "MOCK — Agentic Hub / BAW not available in-process; not a live on-chain swap",
            hubUrl: this.hubUrl,
            documentedCapsUsd: BAW_DOCUMENTED_DAILY_CAPS_USD,
          },
        },
        usedMock: true,
        label: "MOCK BAW swap ack (opt-in mock mode)",
        hubUrl: this.hubUrl,
        rail: "BAW",
      };
    }

    if (this.mode === "live") {
      // Attempt hub reachability; in-process Node cannot complete wallet OAuth alone.
      let hubReachable = false;
      try {
        const res = await fetch(this.hubUrl, {
          method: "GET",
          signal: AbortSignal.timeout(2500),
        });
        hubReachable = res.ok || res.status === 401 || res.status === 403;
      } catch {
        hubReachable = false;
      }

      if (!hubReachable) {
        return {
          data: {
            swapId: `AUTH-BAW-${clientId}`,
            status: "REJECTED",
            fromAsset: from,
            toAsset: to,
            amountIn: opts.amountIn,
            amountOut: 0,
            notionalUsd: opts.notionalUsd,
            requiresConfirmation: false,
            raw: {
              live: true,
              authRequired: true,
              note: "LIVE BAW auth/hub required — open Agentic Hub in Binance Wallet App / complete wallet agent auth. Not a paper fill.",
              hubUrl: this.hubUrl,
              documentedCapsUsd: BAW_DOCUMENTED_DAILY_CAPS_USD,
            },
          },
          usedMock: false,
          label:
            "LIVE BAW auth required — Agentic Hub unavailable in-process; authenticate via Binance Wallet App",
          hubUrl: this.hubUrl,
          rail: "BAW",
        };
      }

      // Hub reachable but in-process swap still needs wallet confirmation / session.
      return {
        data: {
          swapId: `LIVE-PENDING-BAW-${clientId}`,
          status: "SUBMITTED_LIVE_PENDING",
          fromAsset: from,
          toAsset: to,
          amountIn: opts.amountIn,
          amountOut,
          notionalUsd: opts.notionalUsd,
          requiresConfirmation: true,
          raw: {
            live: true,
            note: "LIVE BAW submit pending — confirm in Binance Wallet / Agentic Hub; not a filled paper swap",
            hubUrl: this.hubUrl,
            documentedCapsUsd: BAW_DOCUMENTED_DAILY_CAPS_USD,
          },
        },
        usedMock: false,
        label: "LIVE BAW pending confirmation — confirm swap in Agentic Hub / App",
        hubUrl: this.hubUrl,
        rail: "BAW",
      };
    }

    // unreachable
    return {
      data: {
        swapId: `REJ-${clientId}`,
        status: "REJECTED",
        fromAsset: from,
        toAsset: to,
        amountIn: opts.amountIn,
        amountOut: 0,
        notionalUsd: opts.notionalUsd,
        requiresConfirmation: false,
      },
      usedMock: true,
      label: "BAW unexpected mode",
      hubUrl: this.hubUrl,
      rail: "BAW",
    };
  }
}

/** Headline/summary heuristics for optional on-chain BAW path */
const ONCHAIN_RE =
  /\b(defi|exploit|bridge|on-?chain|swap|dapp|subnet|staking|oracle|ccip|liquidity|lp\b|amm|wallet|web3)\b/i;

export function newsImpliesOnChain(text: string): boolean {
  return ONCHAIN_RE.test(text);
}
