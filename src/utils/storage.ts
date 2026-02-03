/**
 * Storage utilities for wallet state management
 */

import type { Keypair } from "@solana/web3.js";
import { retireBurner } from "./keyManager";

export interface BurnerWallet {
  id: number;
  address: string;
  fullAddress: string;
  balance: number;
  site: string;
  isActive: boolean;
  index: number; // HD wallet derivation index
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

/**
 * Store burner wallet data
 */
export async function storeBurnerWallet(wallet: BurnerWallet): Promise<void> {
  const key = `veil:burner:${wallet.index}`;
  await chrome.storage.local.set({ [key]: wallet });
}

/**
 * Get all burner wallets (excluding archived)
 */
export async function getAllBurnerWallets(): Promise<BurnerWallet[]> {
  // Defensive check for chrome.storage availability
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
    if (key.startsWith("veil:burner:")) {
      const wallet = value as BurnerWallet;
      // Only include non-archived wallets
      if (!wallet.archived) {
        wallets.push(wallet);
      }
    }
  }

  return wallets.sort((a, b) => b.id - a.id); // Most recent first
}

/**
 * Get all archived burner wallets
 */
export async function getArchivedBurnerWallets(): Promise<BurnerWallet[]> {
  const allData = await chrome.storage.local.get(null);
  const wallets: BurnerWallet[] = [];

  for (const [key, value] of Object.entries(allData)) {
    if (key.startsWith("veil:burner:")) {
      const wallet = value as BurnerWallet;
      // Only include archived wallets
      if (wallet.archived) {
        wallets.push(wallet);
      }
    }
  }

  return wallets.sort((a, b) => b.id - a.id); // Most recent first
}

/**
 * Archive a burner wallet
 */
export async function archiveBurnerWallet(walletIndex: number): Promise<void> {
  const key = `veil:burner:${walletIndex}`;
  const result = await chrome.storage.local.get(key);
  if (result[key]) {
    const wallet = result[key] as BurnerWallet;
    wallet.archived = true;
    wallet.isActive = false; // Deactivate when archiving
    await chrome.storage.local.set({ [key]: wallet });
    // Explicitly retire this burner index so it is never reused
    await retireBurner(walletIndex);
  }
}

/**
 * Unarchive a burner wallet
 */
export async function unarchiveBurnerWallet(
  walletIndex: number
): Promise<void> {
  const key = `veil:burner:${walletIndex}`;
  const result = await chrome.storage.local.get(key);
  if (result[key]) {
    const wallet = result[key] as BurnerWallet;
    wallet.archived = false;
    await chrome.storage.local.set({ [key]: wallet });
  }
}

/**
 * Get the next account number for naming (Account 1, Account 2, etc.)
 * Includes archived wallets in the count
 */
export async function getNextAccountNumber(): Promise<number> {
  const allData = await chrome.storage.local.get(null);
  const wallets: BurnerWallet[] = [];

  // Get all wallets (including archived) for account numbering
  for (const [key, value] of Object.entries(allData)) {
    if (key.startsWith("veil:burner:")) {
      wallets.push(value as BurnerWallet);
    }
  }

  // Extract account numbers from existing wallets
  const accountNumbers = wallets
    .map((w) => {
      // Check if site matches "Account X" pattern
      const match = w.site.match(/^Account (\d+)$/);
      return match ? parseInt(match[1], 10) : null;
    })
    .filter((num): num is number => num !== null);

  if (accountNumbers.length === 0) {
    return 1; // Start with Account 1
  }

  // Find the next available number
  const maxAccount = Math.max(...accountNumbers);
  return maxAccount + 1;
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
