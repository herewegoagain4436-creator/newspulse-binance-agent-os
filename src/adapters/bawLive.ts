import { bawJson, resolveBawBin } from "./bawExec.js";
export const BAW_INSTALL_HINT = "install agentic wallet package globally";
export const BAW_AUTH_HINT = "run baw auth signin then scan QR then baw auth verify";
export const BSC_CHAIN_ID = "56";
export const USDT_BSC = "0x55d398326f99059fF775485246999027B3197955";
export const NATIVE_BNB = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
export function tokenAddress(asset: string): string {
  const a = asset.toUpperCase();
  if (a === "USDT") return USDT_BSC;
  if (a === "BNB" || a === "ETH" || a === "NATIVE") return NATIVE_BNB;
  if (asset.startsWith("0x") || asset.startsWith("0X")) return asset;
  return asset;
}

export type LiveAuthProbe = {
  connectionStatus: string;
  address: string;
  cliAvailable: boolean;
  ok: boolean;
  label: string;
  remainingSwapUsd?: number;
  remainingX402Usd?: number;
  caps?: { swap: number; defi: number; x402: number };
  balances?: Array<{ asset: string; free: number; locked: number }>;
};

export async function probeLiveAuth(): Promise<LiveAuthProbe> {
  const bin = resolveBawBin();
  const runner = globalThis.__newspulseBawJsonSync;
  if (!bin && !runner) {
    return {
      connectionStatus: "BAW_MISSING",
      address: "",
      cliAvailable: false,
      ok: false,
      label: "BAW_MISSING — " + BAW_INSTALL_HINT + " then " + BAW_AUTH_HINT,
    };
  }
  const st = await bawJson(["wallet", "status"]);
  if (!st.ok) {
    const missing = (st.code || "").includes("MISSING") || /BAW_MISSING|not found|ENOENT/i.test(st.label);
    return {
      connectionStatus: missing ? "BAW_MISSING" : "UNCONNECTED",
      address: "",
      cliAvailable: !missing,
      ok: false,
      label: missing ? st.label + " — " + BAW_INSTALL_HINT : st.label + " — " + BAW_AUTH_HINT,
    };
  }
  const stData = st.data as { status?: string };
  const connectionStatus = String(stData?.status || "UNKNOWN").toUpperCase();
  if (connectionStatus !== "CONNECTED") {
    return {
      connectionStatus,
      address: "",
      cliAvailable: true,
      ok: false,
      label: "UNCONNECTED (" + connectionStatus + ") — " + BAW_AUTH_HINT,
    };
  }
  return { connectionStatus: "CONNECTED", address: "", cliAvailable: true, ok: true, label: "CONNECTED" };
}

export async function enrichConnected(base: LiveAuthProbe): Promise<LiveAuthProbe> {
  if (!base.ok) return base;
  let address = "";
  const addr = await bawJson(["wallet", "address"]);
  if (addr.ok) {
    const addresses = (addr.data as { addresses?: Array<{ binanceChainId?: string; address?: string }> })?.addresses;
    const bsc = addresses?.find((a) => String(a.binanceChainId) === BSC_CHAIN_ID);
    address = bsc?.address || addresses?.[0]?.address || "";
  }
  let balances: LiveAuthProbe["balances"] = [];
  const bal = await bawJson(["wallet", "balance"]);
  if (bal.ok && Array.isArray(bal.data)) {
    balances = (bal.data as Array<{ symbol?: string; balance?: string }>).map((row) => ({
      asset: String(row.symbol || "?").toUpperCase(),
      free: Number(row.balance || 0),
      locked: 0,
    }));
  }
  const caps = { swap: 50000, defi: 100000, x402: 20 };
  let remainingSwapUsd = caps.swap;
  let remainingX402Usd = caps.x402;
  const settings = await bawJson(["wallet", "settings"]);
  if (settings.ok && settings.data && typeof settings.data === "object") {
    const s = settings.data as Record<string, number>;
    if (typeof s.dailyLimit === "number") caps.swap = s.dailyLimit;
    if (typeof s.defiDailyLimit === "number") caps.defi = s.defiDailyLimit;
    if (typeof s.x402DailyLimit === "number") caps.x402 = s.x402DailyLimit;
    if (typeof s.quotaLeft === "number") remainingSwapUsd = s.quotaLeft;
    if (typeof s.x402QuotaLeft === "number") remainingX402Usd = s.x402QuotaLeft;
  }
  return {
    ...base,
    address,
    balances,
    caps,
    remainingSwapUsd,
    remainingX402Usd,
    label: "LIVE CONNECTED — BSC " + (address || "(no address)") + " via baw",
  };
}

export async function liveQuoteSwap(opts: { fromAsset: string; toAsset: string; amountIn: number }) {
  const auth = await enrichConnected(await probeLiveAuth());
  if (!auth.ok) return { ok: false as const, auth, amountOut: 0, raw: null, label: auth.label };
  const res = await bawJson([
    "market-order", "quote",
    "--binanceChainId", BSC_CHAIN_ID,
    "--fromTokenQty", String(opts.amountIn),
    "--fromToken", tokenAddress(opts.fromAsset),
    "--toToken", tokenAddress(opts.toAsset),
  ]);
  if (!res.ok) return { ok: false as const, auth, amountOut: 0, raw: res, label: res.label };
  const d = res.data as { toCoinAmount?: string };
  const amountOut = Number(d.toCoinAmount || 0);
  return { ok: true as const, auth, amountOut, raw: res.data, label: "LIVE quote via baw" };
}

export async function liveExecuteSwap(opts: {
  fromAsset: string; toAsset: string; amountIn: number; confirm?: boolean;
}) {
  const auth = await enrichConnected(await probeLiveAuth());
  if (!auth.ok) return { ok: false as const, auth, orderId: "", amountOut: 0, label: auth.label, status: "UNCONNECTED" as const };
  const allow = opts.confirm || process.env.NEWSPULSE_BAW_ALLOW_SPEND === "1";
  if (!allow) {
    return {
      ok: false as const,
      auth,
      orderId: "",
      amountOut: 0,
      status: "REJECTED" as const,
      label: "BAW swap gated — set NEWSPULSE_BAW_ALLOW_SPEND=1 after user confirms; App confirmation still required",
    };
  }
  const res = await bawJson([
    "market-order", "swap",
    "--binanceChainId", BSC_CHAIN_ID,
    "--fromTokenQty", String(opts.amountIn),
    "--fromToken", tokenAddress(opts.fromAsset),
    "--toToken", tokenAddress(opts.toAsset),
  ]);
  if (!res.ok) {
    return { ok: false as const, auth, orderId: "", amountOut: 0, status: "REJECTED" as const, label: res.label };
  }
  const d = res.data as { orderId?: string; toCoinAmount?: string };
  return {
    ok: true as const,
    auth,
    orderId: String(d.orderId || "baw-swap"),
    amountOut: Number(d.toCoinAmount || 0),
    status: "SUBMITTED_LIVE_PENDING" as const,
    label: "PENDING — real baw market-order swap submitted; awaiting Binance App confirmation (NOT a fill)",
    raw: res.data,
  };
}

export async function livePayX402(opts: {
  notionalUsd: number; purpose: string; confirm?: boolean; paymentRequirements?: unknown;
}) {
  const auth = await enrichConnected(await probeLiveAuth());
  if (!auth.ok) {
    return { ok: false as const, auth, paymentId: "", status: "UNCONNECTED" as const, label: auth.label };
  }
  if (!opts.paymentRequirements) {
    return {
      ok: false as const,
      auth,
      paymentId: "",
      status: "REJECTED" as const,
      label: "BAW x402 needs paymentRequirements (HTTP 402 merchant). Wallet is CONNECTED but no invoice — not inventing PENDING. Set NEWSPULSE_PREMIUM_URL or pass requirements.",
    };
  }
  const allow = opts.confirm || process.env.NEWSPULSE_BAW_ALLOW_SPEND === "1";
  if (!allow) {
    return {
      ok: false as const,
      auth,
      paymentId: "",
      status: "REJECTED" as const,
      label: "BAW x402 gated — user must confirm spend (NEWSPULSE_BAW_ALLOW_SPEND=1)",
    };
  }
  const preview = await bawJson([
    "x402-payment", "preview",
    "--paymentRequirements", JSON.stringify(opts.paymentRequirements),
  ]);
  if (!preview.ok) {
    return { ok: false as const, auth, paymentId: "", status: "REJECTED" as const, label: preview.label, raw: preview };
  }
  const pdata = preview.data as { paymentId?: string; options?: Array<{ index: number; status: string }> };
  const option = (pdata.options || []).find((o) => o.status === "READY_TO_SIGN");
  if (!pdata.paymentId || !option) {
    return { ok: false as const, auth, paymentId: String(pdata.paymentId || ""), status: "REJECTED" as const, label: "No READY_TO_SIGN x402 option", raw: preview.data };
  }
  const sign = await bawJson([
    "x402-payment", "sign",
    "--paymentId", pdata.paymentId,
    "--selectedIndex", String(option.index),
  ]);
  if (!sign.ok) {
    return { ok: false as const, auth, paymentId: pdata.paymentId, status: "REJECTED" as const, label: sign.label, raw: sign };
  }
  return {
    ok: true as const,
    auth,
    paymentId: pdata.paymentId,
    status: "SUBMITTED_LIVE_PENDING" as const,
    label: "PENDING — real baw x402-payment sign completed; settle/replay merchant still required (NOT a silent PAID fill)",
    raw: { preview: preview.data, sign: sign.data, purpose: opts.purpose },
  };
}

export async function startAuthSignin() {
  const res = await bawJson(["auth", "signin"]);
  if (!res.ok) {
    return { ok: false as const, label: res.label + " — " + BAW_INSTALL_HINT, data: null };
  }
  const d = res.data as { urlForWeb?: string; qrCodeId?: string; pairingCode?: string; expireAt?: string };
  return {
    ok: true as const,
    label: "Scan QR / open urlForWeb in Binance App, match pairingCode, then run baw auth verify",
    data: d,
  };
}

export async function verifyAuth(qrCodeId: string) {
  const res = await bawJson(["auth", "verify", "--qrCodeId", qrCodeId]);
  if (!res.ok) return { ok: false as const, label: res.label, data: null };
  return { ok: true as const, label: "auth verify returned — re-check wallet status", data: res.data };
}

