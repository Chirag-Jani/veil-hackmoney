function iconSlug(symbol: string): string | null {
  const s = symbol.toUpperCase();
  if (s === "ETH") return "eth";
  if (s === "SOL") return "sol";
  if (s === "AVAX") return "avax";
  if (s === "USDC" || s === "USDT") return "usdc";
  return null;
}

/**
 * Returns the URL for a token icon from public/icons, or null if we don't have one.
 * Use in extension (getURL) and non-extension (path) contexts.
 */
export function getTokenIconUrl(symbol: string): string | null {
  const slug = iconSlug(symbol);
  if (!slug) return null;
  if (typeof chrome !== "undefined" && chrome?.runtime?.getURL) {
    return chrome.runtime.getURL(`icons/${slug}.svg`);
  }
  return `/icons/${slug}.svg`;
}
