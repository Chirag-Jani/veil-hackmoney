/**
 * Solana Provider Implementation
 * Provides window.solana API compatibility for dApp connections
 */

import { Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import nacl from "tweetnacl";
import { getKeypairForIndex } from "./keyManager";
import { getAllBurnerWallets } from "./storage";
import { isSessionValid, isWalletLocked } from "./walletLock";

export interface ProviderAccount {
  address: string;
  publicKey: PublicKey;
}

export interface ConnectResponse {
  publicKey: PublicKey;
}

export interface SignTransactionResponse {
  signature: string;
  publicKey: PublicKey;
}

export interface SignMessageResponse {
  signature: Uint8Array;
  publicKey: PublicKey;
}

/**
 * Get the active burner wallet
 */
export async function getActiveBurnerWallet() {
  const wallets = await getAllBurnerWallets();
  const activeWallet = wallets.find((w) => w.isActive && !w.archived);

  if (!activeWallet) {
    throw new Error(
      "No active wallet found. Please generate a burner wallet first."
    );
  }

  return activeWallet;
}

/**
 * Get keypair for active wallet
 * Requires password to decrypt seed
 */
export async function getActiveWalletKeypair(
  password: string
): Promise<Keypair> {
  const activeWallet = await getActiveBurnerWallet();
  return getKeypairForIndex(password, activeWallet.index);
}

/**
 * Check if wallet is unlocked and session is valid
 */
export async function checkWalletUnlocked(): Promise<boolean> {
  const locked = await isWalletLocked();
  if (locked) return false;

  const valid = await isSessionValid();
  return valid;
}

/**
 * Sign a transaction with the active wallet
 * Only supports VersionedTransaction (modern standard)
 */
export async function signTransactionWithActiveWallet(
  transaction: VersionedTransaction,
  password: string
): Promise<VersionedTransaction> {
  const keypair = await getActiveWalletKeypair(password);
  transaction.sign([keypair]);
  return transaction;
}

/**
 * Sign a message with the active wallet
 * Uses nacl.sign.detached for Ed25519 message signing
 */
export async function signMessageWithActiveWallet(
  message: Uint8Array,
  password: string
): Promise<Uint8Array> {
  const keypair = await getActiveWalletKeypair(password);

  // Solana message signing using nacl.sign.detached
  // keypair.secretKey is 64 bytes: 32 bytes seed + 32 bytes public key
  const signature = nacl.sign.detached(message, keypair.secretKey);
  return signature;
}
