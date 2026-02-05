import { ALCHEMY_API_KEYS } from "../config/rpcs";

const BASE = "https://api.g.alchemy.com/prices/v1";

type AlchemyPriceItem = {
  symbol: string;
  prices: Array<{ currency: string; value: string; lastUpdatedAt: string }>;
};

type AlchemyResponse = { data: AlchemyPriceItem[] };

async function fetchWithKey(
  apiKey: string,
  symbols: string
): Promise<AlchemyResponse> {
  const url = `${BASE}/${apiKey}/tokens/by-symbol?symbols=${encodeURIComponent(symbols)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Alchemy prices ${res.status}`);
  return res.json();
}

/**
 * Fetch USD price for one or more symbols from Alchemy Prices API.
 * Tries each ALCHEMY_API_KEYS in order until one succeeds.
 */
export async function getAlchemyPrices(
  symbols: string[]
): Promise<Record<string, number>> {
  const list = [...new Set(symbols)].filter(Boolean);
  if (list.length === 0) return {};
  const symbolsParam = list.join(",");
  const keys = [...ALCHEMY_API_KEYS];
  let lastError: unknown;
  for (const key of keys) {
    try {
      const json = await fetchWithKey(key, symbolsParam);
      const out: Record<string, number> = {};
      if (Array.isArray(json?.data)) {
        for (const item of json.data as AlchemyPriceItem[]) {
          const usd = item.prices?.find((p) => p.currency === "usd");
          if (usd?.value != null) {
            const v = parseFloat(usd.value);
            if (Number.isFinite(v)) out[item.symbol] = v;
          }
        }
      }
      return out;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

/**
 * Fetch USD price for a single symbol. Returns null on failure or missing data.
 */
export async function getAlchemyPrice(symbol: string): Promise<number | null> {
  try {
    const prices = await getAlchemyPrices([symbol]);
    const v = prices[symbol.toUpperCase()] ?? prices[symbol] ?? null;
    return v ?? null;
  } catch {
    return null;
  }
}
