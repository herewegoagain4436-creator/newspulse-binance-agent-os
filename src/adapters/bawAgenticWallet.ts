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
import { envBool, envStr } from "../core/env.js";
import {
  enrichConnected,
  liveExecuteSwap,
  liveQuoteSwap,
  livePayX402,
  probeLiveAuth,
  startAuthSignin,
  verifyAuth,
  BAW_AUTH_HINT,
  BAW_INSTALL_HINT,
  BSC_CHAIN_ID,
} from "./bawLive.js";

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
  status: "FILLED_PAPER" | "SUBMITTED_MOCK" | "REJECTED" | "SUBMITTED_LIVE_PENDING" | "UNCONNECTED";
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

export interface BawX402Ack {
  paymentId: string;
  status: "FILLED_PAPER" | "SUBMITTED_MOCK" | "REJECTED" | "SUBMITTED_LIVE_PENDING" | "UNCONNECTED";
  notionalUsd: number;
  purpose: string;
  remainingX402CapUsd: number;
  documentedCapUsd: number;
  requiresConfirmation: boolean;
  raw?: unknown;
}

export class BawAgenticWalletAdapter {
  readonly hubUrl: string;
  readonly mode: BawMode;
  private killSwitchOn = false;
  private swapSpentUsd = 0;
  private spendDay = utcDayKey();
  /** x402 micropayment spend (documented ~$20/day cap) */
  private x402SpentUsd = 0;
  private x402SpendDay = utcDayKey();
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
      return "LIVE via baw CLI — auth required (baw auth signin + QR); never hub-HTTP stubs";
    }
    if (usedMock) {
      return "MOCK (BAW) — not live on-chain";
    }
    return "LIVE via baw CLI — swaps/x402 under App confirmations";
  }

  status() {
    this.rollDayIfNeeded();
    this.rollX402DayIfNeeded();
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
      x402SpentUsd: this.x402SpentUsd,
      remainingX402CapUsd: Math.max(
        0,
        BAW_DOCUMENTED_DAILY_CAPS_USD.x402 - this.x402SpentUsd
      ),
      label: this.metaLabel(this.mode !== "live"),
      connectionStatus: this.mode === "live" ? "PROBE_VIA_getAuthStatus" : this.mode.toUpperCase(),
      chainId: BSC_CHAIN_ID,
      note: "Caps are documented defaults / baw wallet settings — not invented guarantees. Auth = baw auth signin + QR + verify. Hub URL is docs only — never treat hub HTTP 200 as auth.",
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
    const auth = await enrichConnected(await probeLiveAuth());
    if (!auth.ok) {
      return {
        data: [],
        usedMock: false,
        label: auth.label,
        hubUrl: this.hubUrl,
        rail: "BAW",
      };
    }
    return {
      data: auth.balances || [],
      usedMock: false,
      label: auth.label + " balances",
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
    if (this.mode === "live") {
      const live = await liveQuoteSwap({
        fromAsset: opts.fromAsset,
        toAsset: opts.toAsset,
        amountIn: opts.amountIn,
      });
      const notionalUsd =
        opts.notionalUsd ??
        (opts.fromAsset.toUpperCase() === "USDT" ? opts.amountIn : opts.amountIn * (opts.priceHint ?? 1));
      const remaining = live.auth.remainingSwapUsd ?? Math.max(0, BAW_DOCUMENTED_DAILY_CAPS_USD.swap - this.swapSpentUsd);
      const amountOut = live.ok ? live.amountOut : opts.amountIn * (opts.priceHint ?? 1);
      const price = opts.amountIn ? amountOut / opts.amountIn : opts.priceHint ?? 1;
      return {
        data: {
          fromAsset: opts.fromAsset.toUpperCase(),
          toAsset: opts.toAsset.toUpperCase(),
          amountIn: opts.amountIn,
          amountOut,
          price,
          feeUsd: Math.max(0.01, notionalUsd * 0.001),
          withinDailyCap: live.ok && notionalUsd <= remaining && !this.killSwitchOn,
          remainingSwapCapUsd: remaining,
          documentedCapUsd: live.auth.caps?.swap ?? BAW_DOCUMENTED_DAILY_CAPS_USD.swap,
        },
        usedMock: false,
        label: live.label,
        hubUrl: this.hubUrl,
        rail: "BAW",
      };
    }
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
      usedMock: this.mode === "mock",
      label: `BAW swap quote (${this.mode}) — cap check vs documented ${BAW_DOCUMENTED_DAILY_CAPS_USD.swap}/day swap default`,
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
      const live = await liveExecuteSwap({
        fromAsset: from,
        toAsset: to,
        amountIn: opts.amountIn,
        confirm: envBool("NEWSPULSE_BAW_ALLOW_SPEND", false),
      });
      if (!live.ok) {
        const st = live.status === "UNCONNECTED" ? "UNCONNECTED" : "REJECTED";
        return {
          data: {
            swapId: `REJ-${clientId}`,
            status: st,
            fromAsset: from,
            toAsset: to,
            amountIn: opts.amountIn,
            amountOut: 0,
            notionalUsd: opts.notionalUsd,
            requiresConfirmation: false,
            raw: { live: true, auth: live.auth, note: live.label },
          },
          usedMock: false,
          label: live.label,
          hubUrl: this.hubUrl,
          rail: "BAW",
        };
      }
      return {
        data: {
          swapId: live.orderId || `LIVE-BAW-${clientId}`,
          status: "SUBMITTED_LIVE_PENDING",
          fromAsset: from,
          toAsset: to,
          amountIn: opts.amountIn,
          amountOut: live.amountOut,
          notionalUsd: opts.notionalUsd,
          requiresConfirmation: true,
          raw: { live: true, note: live.label, raw: (live as { raw?: unknown }).raw },
        },
        usedMock: false,
        label: live.label,
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

  /**
   * Tiny x402-style micropayment for premium data / signals.
   * Documented default cap ~$20/day — keep notional well under that (e.g. $1–5).
   * Live without hub/auth: REJECTED or SUBMITTED_LIVE_PENDING — never fake FILLED_PAPER.
   */
  async payX402(opts: {
    notionalUsd: number;
    purpose: string;
    clientId?: string;
  }): Promise<BawAdapterResult<BawX402Ack>> {
    this.rollDayIfNeeded();
    this.rollX402DayIfNeeded();
    const clientId = opts.clientId ?? `x402-${Date.now()}`;
    const notional = Math.max(0.01, Number(opts.notionalUsd) || 0);
    const remaining = Math.max(
      0,
      BAW_DOCUMENTED_DAILY_CAPS_USD.x402 - this.x402SpentUsd
    );

    const baseAck = {
      notionalUsd: notional,
      purpose: opts.purpose,
      remainingX402CapUsd: remaining,
      documentedCapUsd: BAW_DOCUMENTED_DAILY_CAPS_USD.x402,
    };

    if (this.killSwitchOn) {
      return {
        data: {
          paymentId: `REJ-${clientId}`,
          status: "REJECTED",
          ...baseAck,
          requiresConfirmation: false,
          raw: { reason: "kill-switch" },
        },
        usedMock: this.mode !== "live",
        label: "BAW x402 REJECTED — kill-switch engaged",
        hubUrl: this.hubUrl,
        rail: "BAW",
      };
    }

    if (notional > remaining) {
      return {
        data: {
          paymentId: `REJ-${clientId}`,
          status: "REJECTED",
          ...baseAck,
          requiresConfirmation: false,
          raw: {
            reason: "daily_x402_cap",
            note: `Documented default $${BAW_DOCUMENTED_DAILY_CAPS_USD.x402}/day x402 cap — confirm live quota in App`,
          },
        },
        usedMock: this.mode !== "live",
        label: `BAW x402 REJECTED — would exceed documented x402 daily cap ($${BAW_DOCUMENTED_DAILY_CAPS_USD.x402})`,
        hubUrl: this.hubUrl,
        rail: "BAW",
      };
    }

    if (this.mode === "paper") {
      this.x402SpentUsd += notional;
      return {
        data: {
          paymentId: `PAPER-X402-${clientId}`,
          status: "FILLED_PAPER",
          ...baseAck,
          remainingX402CapUsd: Math.max(
            0,
            BAW_DOCUMENTED_DAILY_CAPS_USD.x402 - this.x402SpentUsd
          ),
          requiresConfirmation: false,
          raw: {
            paper: true,
            note: "PAPER SIM — local x402 ledger only; not submitted to Agentic Hub",
          },
        },
        usedMock: false,
        label: `PAPER SIM BAW x402 fill $${notional} (no Agentic Hub submit)`,
        hubUrl: this.hubUrl,
        rail: "BAW",
      };
    }

    if (this.mode === "mock") {
      this.x402SpentUsd += notional;
      return {
        data: {
          paymentId: `MOCK-X402-${clientId}`,
          status: "SUBMITTED_MOCK",
          ...baseAck,
          remainingX402CapUsd: Math.max(
            0,
            BAW_DOCUMENTED_DAILY_CAPS_USD.x402 - this.x402SpentUsd
          ),
          requiresConfirmation: false,
          raw: {
            mock: true,
            note: "MOCK — Agentic Hub x402 not available in-process; not a live payment",
          },
        },
        usedMock: true,
        label: `MOCK BAW x402 ack $${notional} (opt-in mock mode)`,
        hubUrl: this.hubUrl,
        rail: "BAW",
      };
    }

    // live — real baw CLI only; never invent PENDING from hub webpage HTTP 200
    const premiumUrl = envStr("NEWSPULSE_PREMIUM_URL", "");
    let paymentRequirements: unknown = undefined;
    if (premiumUrl) {
      try {
        const hit = await fetch(premiumUrl, { signal: AbortSignal.timeout(4000) });
        if (hit.status === 402) {
          const hdr = hit.headers.get("PAYMENT-REQUIRED") || hit.headers.get("payment-required");
          if (hdr) {
            try { paymentRequirements = JSON.parse(Buffer.from(hdr, "base64").toString("utf8")); }
            catch { try { paymentRequirements = JSON.parse(hdr); } catch { /* ignore */ } }
          } else {
            paymentRequirements = await hit.json().catch(() => null);
          }
        }
      } catch {
        /* no merchant invoice */
      }
    }
    const live = await livePayX402({
      notionalUsd: notional,
      purpose: opts.purpose,
      confirm: envBool("NEWSPULSE_BAW_ALLOW_SPEND", false),
      paymentRequirements,
    });
    const st =
      live.status === "UNCONNECTED"
        ? "UNCONNECTED"
        : live.status === "SUBMITTED_LIVE_PENDING"
          ? "SUBMITTED_LIVE_PENDING"
          : "REJECTED";
    return {
      data: {
        paymentId: live.paymentId || `REJ-${clientId}`,
        status: st,
        ...baseAck,
        remainingX402CapUsd: live.auth?.remainingX402Usd ?? baseAck.remainingX402CapUsd,
        requiresConfirmation: st === "SUBMITTED_LIVE_PENDING",
        raw: { live: true, note: live.label, auth: live.auth, raw: (live as { raw?: unknown }).raw },
      },
      usedMock: false,
      label: live.label,
      hubUrl: this.hubUrl,
      rail: "BAW",
    };
  }

  private rollX402DayIfNeeded(): void {
    const today = utcDayKey();
    if (today !== this.x402SpendDay) {
      this.x402SpendDay = today;
      this.x402SpentUsd = 0;
    }
  }


  async getAuthStatus() {
    if (this.mode !== "live") {
      return {
        connectionStatus: this.mode.toUpperCase(),
        address: "",
        cliAvailable: false,
        instructions: "Mode is " + this.mode + " — BAW CLI unused",
        label: this.metaLabel(this.mode === "mock"),
      };
    }
    const auth = await enrichConnected(await probeLiveAuth());
    return {
      connectionStatus: auth.connectionStatus,
      address: auth.address,
      cliAvailable: auth.cliAvailable,
      instructions: auth.ok ? "Wallet CONNECTED via baw" : BAW_AUTH_HINT + " | " + BAW_INSTALL_HINT,
      label: auth.label,
      remainingSwapUsd: auth.remainingSwapUsd,
      remainingX402Usd: auth.remainingX402Usd,
      balances: auth.balances,
    };
  }

  async beginConnect() {
    return startAuthSignin();
  }

  async completeConnect(qrCodeId: string) {
    return verifyAuth(qrCodeId);
  }

}

/** Headline/summary heuristics for optional on-chain BAW path */
const ONCHAIN_RE =
  /\b(defi|exploit|bridge|on-?chain|swap|dapp|subnet|staking|oracle|ccip|liquidity|lp\b|amm|wallet|web3)\b/i;

export function newsImpliesOnChain(text: string): boolean {
  return ONCHAIN_RE.test(text);
}
