/**
 * ENS resolution and Veil preference text records (Ethereum mainnet).
 * Used for: send-to-ENS in TransferModal, and "Load preferences from ENS" in Swap.
 */

import { JsonRpcProvider } from "ethers";
import { getEthRpcUrl } from "./ethRpcManager";

let mainnetProvider: JsonRpcProvider | null = null;

function getMainnetProvider(): JsonRpcProvider {
  if (!mainnetProvider) {
    mainnetProvider = new JsonRpcProvider(getEthRpcUrl());
  }
  return mainnetProvider;
}

/** Check if string looks like an ENS name (e.g. vitalik.eth). */
export function looksLikeEnsName(s: string): boolean {
  const t = s.trim();
  return t.length > 3 && t.includes(".") && !/^0x[a-fA-F0-9]{40}$/.test(t);
}

/**
 * Resolve ENS name to Ethereum address. Uses mainnet.
 * Returns null if not found or invalid.
 */
export async function resolveName(name: string): Promise<string | null> {
  const n = name.trim();
  if (!n) return null;
  try {
    const provider = getMainnetProvider();
    const address = await provider.resolveName(n);
    return address ? address.toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * Reverse resolve address to primary ENS name. Uses mainnet.
 */
export async function resolveAddress(address: string): Promise<string | null> {
  const a = address.trim();
  if (!a || !a.startsWith("0x") || a.length !== 42) return null;
  try {
    const provider = getMainnetProvider();
    const name = await provider.lookupAddress(a);
    return name ?? null;
  } catch {
    return null;
  }
}

/** ENS text record keys used by Veil for DeFi preferences. */
export const VEIL_ENS_KEYS = {
  slippage: "com.veil.slippage",
  defaultFromToken: "com.veil.defaultFromToken",
  defaultToToken: "com.veil.defaultToToken",
} as const;

/**
 * Get a single ENS text record for a name. Uses mainnet.
 * Returns null if name has no resolver or record is missing.
 */
export async function getText(
  name: string,
  key: string,
): Promise<string | null> {
  const n = name.trim();
  if (!n) return null;
  try {
    const provider = getMainnetProvider();
    const resolver = await provider.getResolver(n);
    if (!resolver) return null;
    const value = await resolver.getText(key);
    return value && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

/** Parsed Veil preferences from ENS text records (for swap/send UX). */
export interface VeilEnsPreferences {
  /** Default slippage as decimal, e.g. 0.01 for 1%. */
  slippage?: number;
  /** Preferred "from" token symbol, e.g. ETH, USDC. */
  defaultFromToken?: string;
  /** Preferred "to" token symbol, e.g. USDC. */
  defaultToToken?: string;
  /** Preferred "from" chain id (1, 43114, 42161). Enables multi-chain presets. */
  defaultFromChainId?: number;
  /** Preferred "to" chain id (1, 43114, 42161). */
  defaultToChainId?: number;
}

/**
 * Default Veil preferences when ENS has no text records (or as fallback).
 * Equivalent to setting: com.veil.slippage=1, com.veil.defaultFromToken=ETH, com.veil.defaultToToken=USDC
 */
export const DEFAULT_VEIL_PREFERENCES: VeilEnsPreferences = {
  slippage: 0.01,
  defaultFromToken: "ETH",
  defaultToToken: "USDC",
};

/**
 * Built-in preset configs that resolve without an on-chain lookup.
 * Use these names in the swap "Load from ENS" dropdown for guaranteed preferences.
 */
export const PRESET_ENS_CONFIGS: Record<string, VeilEnsPreferences> = {
  "veil-default.eth": {
    slippage: 0.01,
    defaultFromToken: "ETH",
    defaultToToken: "USDC",
  },
  "veil-conservative.eth": {
    slippage: 0.005,
    defaultFromToken: "ETH",
    defaultToToken: "USDC",
  },
  "veil-flexible.eth": {
    slippage: 0.03,
    defaultFromToken: "ETH",
    defaultToToken: "USDC",
  },
  "veil-stable.eth": {
    slippage: 0.01,
    defaultFromToken: "USDC",
    defaultToToken: "USDT",
  },
  "veil-avax.eth": {
    slippage: 0.01,
    defaultFromToken: "AVAX",
    defaultToToken: "USDC",
    defaultFromChainId: 43114,
    defaultToChainId: 1,
  },
  "veil-arb.eth": {
    slippage: 0.01,
    defaultFromToken: "ETH",
    defaultToToken: "USDC",
    defaultFromChainId: 42161,
    defaultToChainId: 42161,
  },
};

const CHAIN_LABEL: Record<number, string> = {
  1: "Eth",
  43114: "Avax",
  42161: "Arb",
};

/** Human-readable one-liner for a preset (e.g. "1% · ETH → USDC" or "1% · Avax AVAX → USDC"). */
export function formatPresetDescription(prefs: VeilEnsPreferences): string {
  const pct = prefs.slippage != null ? `${prefs.slippage * 100}%` : "—";
  const from = prefs.defaultFromToken ?? "—";
  const to = prefs.defaultToToken ?? "—";
  const fromChain =
    prefs.defaultFromChainId != null
      ? (CHAIN_LABEL[prefs.defaultFromChainId] ?? "")
      : "";
  const toChain =
    prefs.defaultToChainId != null
      ? (CHAIN_LABEL[prefs.defaultToChainId] ?? "")
      : "";
  const fromPart = fromChain ? `${fromChain} ${from}` : from;
  const toPart = toChain ? `${toChain} ${to}` : to;
  return `${pct} · ${fromPart} → ${toPart}`;
}

const ENS_RECENT_STORAGE_KEY = "veil:ens_recent_names";
const ENS_RECENT_MAX = 10;

/** Default ENS names in dropdown (presets that resolve in-app). */
const DEFAULT_ENS_NAMES = Object.keys(PRESET_ENS_CONFIGS);

/** Get recently used ENS names (for swap preferences dropdown). Seeds defaults when empty. */
export async function getRecentEnsNames(): Promise<string[]> {
  try {
    if (typeof chrome?.storage?.local?.get !== "function")
      return DEFAULT_ENS_NAMES;
    const result = await chrome.storage.local.get(ENS_RECENT_STORAGE_KEY);
    const raw = result[ENS_RECENT_STORAGE_KEY];
    const list = Array.isArray(raw)
      ? raw
          .filter(
            (x): x is string => typeof x === "string" && x.trim().length > 0,
          )
          .slice(0, ENS_RECENT_MAX)
      : [];
    if (list.length === 0) {
      await chrome.storage.local.set({
        [ENS_RECENT_STORAGE_KEY]: DEFAULT_ENS_NAMES,
      });
      return DEFAULT_ENS_NAMES;
    }
    return list;
  } catch {
    return DEFAULT_ENS_NAMES;
  }
}

/** Add an ENS name to recent list (call after successful Load). */
export async function addRecentEnsName(name: string): Promise<void> {
  const n = name.trim();
  if (!n) return;
  try {
    if (typeof chrome?.storage?.local?.get !== "function") return;
    const list = await getRecentEnsNames();
    const next = [
      n,
      ...list.filter((x) => x.toLowerCase() !== n.toLowerCase()),
    ].slice(0, ENS_RECENT_MAX);
    await chrome.storage.local.set({ [ENS_RECENT_STORAGE_KEY]: next });
  } catch {
    // ignore
  }
}

/**
 * Load Veil DeFi preferences from an ENS name's text records.
 * Reads com.veil.slippage, com.veil.defaultFromToken, com.veil.defaultToToken.
 * If a record is missing, the value from DEFAULT_VEIL_PREFERENCES is used.
 */
export async function getVeilPreferences(
  name: string,
): Promise<VeilEnsPreferences> {
  const n = name.trim();
  const out: VeilEnsPreferences = { ...DEFAULT_VEIL_PREFERENCES };
  if (!n) return out;

  const preset = PRESET_ENS_CONFIGS[n.toLowerCase()];
  if (preset) {
    return { ...out, ...preset };
  }

  const [slippageRaw, fromToken, toToken] = await Promise.all([
    getText(n, VEIL_ENS_KEYS.slippage),
    getText(n, VEIL_ENS_KEYS.defaultFromToken),
    getText(n, VEIL_ENS_KEYS.defaultToToken),
  ]);

  if (slippageRaw) {
    const pct = parseFloat(slippageRaw);
    if (Number.isFinite(pct) && pct >= 0 && pct <= 100) {
      out.slippage = pct / 100;
    }
  }
  if (fromToken && fromToken.trim().length > 0) {
    out.defaultFromToken = fromToken.trim().toUpperCase();
  }
  if (toToken && toToken.trim().length > 0) {
    out.defaultToToken = toToken.trim().toUpperCase();
  }
  return out;
}
