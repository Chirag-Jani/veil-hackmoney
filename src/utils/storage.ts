/**
 * Storage utilities for wallet state management
 */

import type { Keypair } from "@solana/web3.js";
import type { NetworkType } from "../types";
import { retireBurner } from "./keyManager";
import { getActiveBurnerIndex } from "./settings";

export interface BurnerWallet {
  id: number;
  address: string;
  fullAddress: string;
  balance: number;
  site: string;
  isActive: boolean;
  index: number; // HD wallet derivation index
  network: NetworkType;
  archived?: boolean; // Whether the wallet is archived
}

export interface ConnectedSite {
  id: number;
  domain: string;
  favicon: string;
  connected: boolean;
  burnerIndex?: number; // Associated burner wallet index
  connectedAt?: number; // Timestamp when connected
}

export interface PendingConnectionRequest {
  id: string;
  origin: string;
  favicon?: string;
  requestedAt: number;
}

export interface PendingSignRequest {
  id: string;
  origin: string;
  type: "transaction" | "message" | "allTransactions";
  data: {
    transaction?: number[]; // Serialized transaction
    transactions?: number[][]; // For signAllTransactions
    message?: number[]; // Message bytes
    display?: string; // Display format for message
  };
  requestedAt: number;
}

/**
 * Format Solana address for display
 */
export function formatAddress(address: string, chars: number = 4): string {
  if (!address || typeof address !== "string") {
    return "";
  }
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/**
 * Get full address from keypair
 */
export function getAddressFromKeypair(keypair: Keypair): string {
  return keypair.publicKey.toBase58();
}

/** Storage key prefix for burners: veil:burner:{network}:{index} or legacy veil:burner:{index} */
function burnerKey(network: NetworkType, index: number): string {
  return `veil:burner:${network}:${index}`;
}

/**
 * Store burner wallet data
 */
export async function storeBurnerWallet(wallet: BurnerWallet): Promise<void> {
  const key = burnerKey(wallet.network, wallet.index);
  await chrome.storage.local.set({ [key]: wallet });
}

/**
 * Get all burner wallets (excluding archived). If network is provided, only that network; otherwise all.
 * Legacy keys veil:burner:{index} (no network) are treated as Solana.
 */
export async function getAllBurnerWallets(
  network?: NetworkType
): Promise<BurnerWallet[]> {
  if (!chrome?.storage?.local) {
    console.error("[Storage] chrome.storage.local is not available");
    return [];
  }

  const allData = await chrome.storage.local.get(null);
  if (!allData || typeof allData !== "object") {
    console.error("[Storage] Invalid storage data");
    return [];
  }

  const wallets: BurnerWallet[] = [];

  for (const [key, value] of Object.entries(allData)) {
    if (!key.startsWith("veil:burner:")) continue;
    const wallet = value as BurnerWallet;
    if (wallet.archived) continue;

    // New format: veil:burner:solana:0 or veil:burner:ethereum:0
    const newMatch = key.match(/^veil:burner:(solana|ethereum):(\d+)$/);
    if (newMatch) {
      const walletNetwork = newMatch[1] as NetworkType;
      if (network !== undefined && walletNetwork !== network) continue;
      wallets.push({ ...wallet, network: walletNetwork });
      continue;
    }

    // Legacy format: veil:burner:0 (Solana only)
    const legacyMatch = key.match(/^veil:burner:(\d+)$/);
    if (legacyMatch) {
      if (network !== undefined && network !== "solana") continue;
      wallets.push({ ...wallet, network: "solana" });
    }
  }

  const sorted = wallets.sort((a, b) => b.id - a.id);

  // Set isActive from active index per network
  if (network !== undefined) {
    const activeIndex = await getActiveBurnerIndex(network);
    return sorted.map((w) => ({
      ...w,
      isActive:
        activeIndex !== null
          ? w.index === activeIndex
          : sorted[0]?.index === w.index,
    }));
  }

  // When returning all networks, set isActive per network
  const out: BurnerWallet[] = [];
  for (const w of sorted) {
    const activeIndex = await getActiveBurnerIndex(w.network);
    out.push({
      ...w,
      isActive: activeIndex !== null ? w.index === activeIndex : false,
    });
  }
  return out;
}

/**
 * Get active burner wallet for a network
 */
export async function getActiveBurnerWallet(
  network: NetworkType
): Promise<BurnerWallet | null> {
  const wallets = await getAllBurnerWallets(network);
  const active = wallets.find((w) => w.isActive);
  if (active) return active;
  return wallets[0] ?? null;
}

/**
 * Get all archived burner wallets. If network provided, only that network.
 */
export async function getArchivedBurnerWallets(
  network?: NetworkType
): Promise<BurnerWallet[]> {
  const allData = await chrome.storage.local.get(null);
  const wallets: BurnerWallet[] = [];

  for (const [key, value] of Object.entries(allData)) {
    if (!key.startsWith("veil:burner:")) continue;
    const wallet = value as BurnerWallet & { network?: NetworkType };
    if (!wallet.archived) continue;
    const newFormat = key.match(/^veil:burner:(solana|ethereum):(\d+)$/);
    const net: NetworkType = newFormat
      ? (newFormat[1] as NetworkType)
      : "solana";
    if (network !== undefined && net !== network) continue;
    wallets.push({ ...wallet, network: net } as BurnerWallet);
  }

  return wallets.sort((a, b) => b.id - a.id);
}

/**
 * Archive a burner wallet (requires network for key)
 */
export async function archiveBurnerWallet(
  walletIndex: number,
  network: NetworkType
): Promise<void> {
  const key = burnerKey(network, walletIndex);
  const result = await chrome.storage.local.get(key);
  if (result[key]) {
    const wallet = result[key] as BurnerWallet;
    wallet.archived = true;
    wallet.isActive = false;
    await chrome.storage.local.set({ [key]: wallet });
    await retireBurner(walletIndex, network);
  }
  const legacyKey = `veil:burner:${walletIndex}`;
  const legacy = await chrome.storage.local.get(legacyKey);
  if (legacy[legacyKey] && network === "solana") {
    const wallet = legacy[legacyKey] as BurnerWallet;
    wallet.archived = true;
    wallet.isActive = false;
    await chrome.storage.local.set({ [legacyKey]: wallet });
    await retireBurner(walletIndex, "solana");
  }
}

/**
 * Unarchive a burner wallet
 */
export async function unarchiveBurnerWallet(
  walletIndex: number,
  network: NetworkType
): Promise<void> {
  const key = burnerKey(network, walletIndex);
  const result = await chrome.storage.local.get(key);
  if (result[key]) {
    const wallet = result[key] as BurnerWallet;
    wallet.archived = false;
    await chrome.storage.local.set({ [key]: wallet });
  }
}

/**
 * Get the next account number for naming (Account 1, Account 2, etc.) for a network.
 */
export async function getNextAccountNumber(
  network: NetworkType
): Promise<number> {
  const allData = await chrome.storage.local.get(null);
  const wallets: (BurnerWallet & { network?: NetworkType })[] = [];

  for (const [key, value] of Object.entries(allData)) {
    if (!key.startsWith("veil:burner:")) continue;
    const w = value as BurnerWallet & { network?: NetworkType };
    const newFormat = key.match(/^veil:burner:(solana|ethereum):/);
    const n: NetworkType = newFormat ? (newFormat[1] as NetworkType) : "solana";
    if (n !== network) continue;
    wallets.push({ ...w, network: n });
  }

  const accountNumbers = wallets
    .map((w) => {
      const match = w.site.match(/^Account (\d+)$/);
      return match ? parseInt(match[1], 10) : null;
    })
    .filter((num): num is number => num !== null);

  if (accountNumbers.length === 0) return 1;
  return Math.max(...accountNumbers) + 1;
}

/**
 * Store connected site
 */
export async function storeConnectedSite(site: ConnectedSite): Promise<void> {
  if (!chrome?.storage?.local) {
    throw new Error("chrome.storage.local is not available");
  }
  const key = `veil:site:${site.domain}`;
  await chrome.storage.local.set({ [key]: site });
}

/**
 * Get all connected sites
 */
export async function getAllConnectedSites(): Promise<ConnectedSite[]> {
  const allData = await chrome.storage.local.get(null);
  const sites: ConnectedSite[] = [];

  for (const [key, value] of Object.entries(allData)) {
    if (key.startsWith("veil:site:")) {
      sites.push(value as ConnectedSite);
    }
  }

  return sites;
}

/**
 * Get connected site by domain
 */
export async function getConnectedSite(
  domain: string
): Promise<ConnectedSite | null> {
  if (!chrome?.storage?.local) {
    console.error("[Storage] chrome.storage.local is not available");
    return null;
  }
  const key = `veil:site:${domain}`;
  const result = await chrome.storage.local.get(key);
  return result?.[key] || null;
}

/**
 * Remove connected site
 */
export async function removeConnectedSite(domain: string): Promise<void> {
  const key = `veil:site:${domain}`;
  await chrome.storage.local.remove(key);
}

/**
 * Check if a site is connected
 */
export async function isSiteConnected(domain: string): Promise<boolean> {
  const site = await getConnectedSite(domain);
  return site?.connected ?? false;
}

/**
 * Store pending connection request
 */
export async function storePendingConnection(
  request: PendingConnectionRequest
): Promise<void> {
  if (!chrome?.storage?.local) {
    throw new Error("chrome.storage.local is not available");
  }
  const key = `veil:pending_connection:${request.id}`;
  await chrome.storage.local.set({ [key]: request });
}

/**
 * Get pending connection request
 */
export async function getPendingConnection(
  id: string
): Promise<PendingConnectionRequest | null> {
  const key = `veil:pending_connection:${id}`;
  const result = await chrome.storage.local.get(key);
  return result[key] || null;
}

/**
 * Get all pending connection requests
 */
export async function getAllPendingConnections(): Promise<
  PendingConnectionRequest[]
> {
  const allData = await chrome.storage.local.get(null);
  const requests: PendingConnectionRequest[] = [];

  for (const [key, value] of Object.entries(allData)) {
    if (key.startsWith("veil:pending_connection:")) {
      requests.push(value as PendingConnectionRequest);
    }
  }

  return requests.sort((a, b) => b.requestedAt - a.requestedAt);
}

/**
 * Remove pending connection request
 */
export async function removePendingConnection(id: string): Promise<void> {
  const key = `veil:pending_connection:${id}`;
  await chrome.storage.local.remove(key);
}

/**
 * Store connection approval result
 */
export async function storeConnectionApproval(
  id: string,
  approved: boolean,
  publicKey?: string
): Promise<void> {
  if (!chrome?.storage?.local) {
    throw new Error("chrome.storage.local is not available");
  }
  if (!id) {
    throw new Error("Connection request ID is required");
  }
  const key = `veil:connection_result:${id}`;
  console.log("[Storage] Storing connection approval:", {
    id,
    approved,
    publicKey,
  });
  await chrome.storage.local.set({
    [key]: { approved, publicKey, timestamp: Date.now() },
  });
}

/**
 * Get connection approval result
 */
export async function getConnectionApproval(
  id: string
): Promise<{ approved: boolean; publicKey?: string } | null> {
  if (!chrome?.storage?.local) {
    console.error("[Storage] chrome.storage.local is not available");
    return null;
  }

  const key = `veil:connection_result:${id}`;
  const result = await chrome.storage.local.get(key);
  return result?.[key] || null;
}

/**
 * Remove connection approval result
 */
export async function removeConnectionApproval(id: string): Promise<void> {
  const key = `veil:connection_result:${id}`;
  await chrome.storage.local.remove(key);
}

/**
 * Store pending sign request
 */
export async function storePendingSignRequest(
  request: PendingSignRequest
): Promise<void> {
  if (!chrome?.storage?.local) {
    throw new Error("chrome.storage.local is not available");
  }
  const key = `veil:pending_sign:${request.id}`;
  await chrome.storage.local.set({ [key]: request });
}

/**
 * Get pending sign request
 */
export async function getPendingSignRequest(
  id: string
): Promise<PendingSignRequest | null> {
  if (!chrome?.storage?.local) {
    console.error("[Storage] chrome.storage.local is not available");
    return null;
  }
  const key = `veil:pending_sign:${id}`;
  const result = await chrome.storage.local.get(key);
  return result?.[key] || null;
}

/**
 * Get all pending sign requests
 */
export async function getAllPendingSignRequests(): Promise<
  PendingSignRequest[]
> {
  if (!chrome?.storage?.local) {
    return [];
  }
  const allData = await chrome.storage.local.get(null);
  const requests: PendingSignRequest[] = [];

  for (const [key, value] of Object.entries(allData)) {
    if (key.startsWith("veil:pending_sign:")) {
      requests.push(value as PendingSignRequest);
    }
  }

  return requests.sort((a, b) => b.requestedAt - a.requestedAt);
}

/**
 * Remove pending sign request
 */
export async function removePendingSignRequest(id: string): Promise<void> {
  const key = `veil:pending_sign:${id}`;
  await chrome.storage.local.remove(key);
}

/**
 * Store sign approval result
 */
export async function storeSignApproval(
  id: string,
  approved: boolean
): Promise<void> {
  if (!chrome?.storage?.local) {
    throw new Error("chrome.storage.local is not available");
  }
  if (!id) {
    throw new Error("Sign request ID is required");
  }
  const key = `veil:sign_result:${id}`;
  await chrome.storage.local.set({
    [key]: { approved, timestamp: Date.now() },
  });
}

/**
 * Get sign approval result
 */
export async function getSignApproval(
  id: string
): Promise<{ approved: boolean } | null> {
  if (!chrome?.storage?.local) {
    console.error("[Storage] chrome.storage.local is not available");
    return null;
  }
  const key = `veil:sign_result:${id}`;
  const result = await chrome.storage.local.get(key);
  return result?.[key] || null;
}

/**
 * Remove sign approval result
 */
export async function removeSignApproval(id: string): Promise<void> {
  const key = `veil:sign_result:${id}`;
  await chrome.storage.local.remove(key);
}

/**
 * Store private balance for a wallet
 */
export async function storePrivateBalance(
  walletIndex: number,
  balance: number
): Promise<void> {
  const key = `veil:private_balance:${walletIndex}`;
  await chrome.storage.local.set({ [key]: balance });
}

/**
 * Get private balance for a wallet
 */
export async function getPrivateBalance(walletIndex: number): Promise<number> {
  const key = `veil:private_balance:${walletIndex}`;
  const result = await chrome.storage.local.get(key);
  return result[key] ?? 0;
}

/**
 * Clear private balance for a wallet
 */
export async function clearPrivateBalance(walletIndex: number): Promise<void> {
  const key = `veil:private_balance:${walletIndex}`;
  await chrome.storage.local.remove(key);
}
