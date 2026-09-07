/**
 * Trade universe: top ~10 market-cap coins EXCLUDING stablecoins.
 *
 * Update path:
 * 1. Optional best-effort CoinGecko fetch when online (see fetchTopNonStableUniverse); not required for demos.
 * 2. Fall back to HARDCODED_UNIVERSE below when offline / rate-limited.
 * 3. Re-check rankings periodically; remove stables (USDT, USDC, DAI, FDUSD, TUSD, USDE, etc.).
 */
import type { SymbolId, UniverseCoin } from "./types.js";

export const STABLECOIN_SYMBOLS = new Set([
  "USDT",
  "USDC",
  "DAI",
  "FDUSD",
  "TUSD",
  "USDE",
  "BUSD",
  "USDP",
  "PYUSD",
  "EUR",
  "USD1",
]);

/** Fallback top-10 non-stable set (update when rankings shift) */
export const HARDCODED_UNIVERSE: UniverseCoin[] = [
  { symbol: "BTC", name: "Bitcoin", binancePair: "BTCUSDT", coingeckoId: "bitcoin" },
  { symbol: "ETH", name: "Ethereum", binancePair: "ETHUSDT", coingeckoId: "ethereum" },
  { symbol: "BNB", name: "BNB", binancePair: "BNBUSDT", coingeckoId: "binancecoin" },
  { symbol: "SOL", name: "Solana", binancePair: "SOLUSDT", coingeckoId: "solana" },
  { symbol: "XRP", name: "XRP", binancePair: "XRPUSDT", coingeckoId: "ripple" },
  { symbol: "DOGE", name: "Dogecoin", binancePair: "DOGEUSDT", coingeckoId: "dogecoin" },
  { symbol: "ADA", name: "Cardano", binancePair: "ADAUSDT", coingeckoId: "cardano" },
  { symbol: "TRX", name: "TRON", binancePair: "TRXUSDT", coingeckoId: "tron" },
  { symbol: "AVAX", name: "Avalanche", binancePair: "AVAXUSDT", coingeckoId: "avalanche-2" },
  { symbol: "LINK", name: "Chainlink", binancePair: "LINKUSDT", coingeckoId: "chainlink" },
];

export const SYMBOLS: SymbolId[] = HARDCODED_UNIVERSE.map((c) => c.symbol);

export function getUniverse(): UniverseCoin[] {
  return HARDCODED_UNIVERSE;
}

export function pairFor(symbol: SymbolId): string {
  const coin = HARDCODED_UNIVERSE.find((c) => c.symbol === symbol);
  return coin?.binancePair ?? `${symbol}USDT`;
}

/**
 * Best-effort optional top-10 non-stable fetch (CoinGecko public API). Demos use hardcoded universe by default.
 * Returns hardcoded list on any failure — never blocks the agent loop.
 */
export async function fetchTopNonStableUniverse(
  limit = 10
): Promise<{ coins: UniverseCoin[]; source: "coingecko" | "hardcoded" }> {
  try {
    const url =
      "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=30&page=1&sparkline=false";
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`coingecko ${res.status}`);
    const data = (await res.json()) as Array<{
      id: string;
      symbol: string;
      name: string;
    }>;
    const mapped: UniverseCoin[] = [];
    for (const row of data) {
      const sym = row.symbol.toUpperCase();
      if (STABLECOIN_SYMBOLS.has(sym)) continue;
      // Only keep symbols we have typed support for, or first 10 non-stables mapped to known set
      const known = HARDCODED_UNIVERSE.find(
        (c) => c.symbol === sym || c.coingeckoId === row.id
      );
      if (known) {
        mapped.push(known);
      }
      if (mapped.length >= limit) break;
    }
    if (mapped.length >= 8) {
      return { coins: mapped.slice(0, limit), source: "coingecko" };
    }
  } catch {
    // fall through
  }
  return { coins: HARDCODED_UNIVERSE.slice(0, limit), source: "hardcoded" };
}
