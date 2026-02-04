/**
 * Settings management utilities
 * Handles user preferences and configuration
 */

import type { NetworkType } from "../types";

const SETTINGS_KEYS = {
  PRIVACY_CASH_MODE: "veil:privacy_cash_mode",
  ACTIVE_NETWORK: "veil:active_network",
  ACTIVE_BURNER_INDEX: "veil:active_burner_index", // suffix :solana or :ethereum
} as const;

/**
 * Get Privacy Cash mode setting.
 * Optional feature for unlinkable on-chain transfers; burner wallets are the core security.
 */
export async function getPrivacyCashMode(): Promise<boolean> {
  const result = await chrome.storage.local.get(
    SETTINGS_KEYS.PRIVACY_CASH_MODE
  );
  const stored = result[SETTINGS_KEYS.PRIVACY_CASH_MODE];

  if (stored === undefined) {
    return true;
  }

  return stored === true;
}

/**
 * Set Privacy Cash mode setting
 */
export async function setPrivacyCashMode(enabled: boolean): Promise<void> {
  await chrome.storage.local.set({
    [SETTINGS_KEYS.PRIVACY_CASH_MODE]: enabled,
  });
}

/**
 * Get active network (Ethereum or Solana). Default: ethereum.
 */
export async function getActiveNetwork(): Promise<NetworkType> {
  const result = await chrome.storage.local.get(SETTINGS_KEYS.ACTIVE_NETWORK);
  const stored = result[SETTINGS_KEYS.ACTIVE_NETWORK];
  if (stored === "ethereum" || stored === "solana") return stored;
  return "ethereum";
}

/**
 * Set active network
 */
export async function setActiveNetwork(network: NetworkType): Promise<void> {
  await chrome.storage.local.set({
    [SETTINGS_KEYS.ACTIVE_NETWORK]: network,
  });
}

/**
 * Get active burner wallet index for a network. Returns null if not set.
 */
export async function getActiveBurnerIndex(
  network: NetworkType
): Promise<number | null> {
  const key = `${SETTINGS_KEYS.ACTIVE_BURNER_INDEX}:${network}`;
  const result = await chrome.storage.local.get(key);
  const value = result[key];
  if (typeof value === "number" && Number.isInteger(value)) return value;
  return null;
}

/**
 * Set active burner wallet index for a network
 */
export async function setActiveBurnerIndex(
  network: NetworkType,
  index: number
): Promise<void> {
  const key = `${SETTINGS_KEYS.ACTIVE_BURNER_INDEX}:${network}`;
  await chrome.storage.local.set({ [key]: index });
}
