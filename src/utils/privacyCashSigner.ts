/**
 * Transaction Signer Factory for Privacy Cash SDK
 * 
 * Creates transaction signer functions for the SDK that use the active wallet's keypair.
 * The SDK requires a signer function that receives a VersionedTransaction and signs it.
 */

import { Keypair, VersionedTransaction } from '@solana/web3.js';

/**
 * Create a transaction signer function for the Privacy Cash SDK
 * 
 * @param keypair The keypair to use for signing transactions
 * @returns A signer function that the SDK expects
 */
export function createPrivacyCashSigner(
  keypair: Keypair
): (tx: VersionedTransaction) => Promise<VersionedTransaction> {
  return async (tx: VersionedTransaction): Promise<VersionedTransaction> => {
    // Sign the transaction with the provided keypair
    tx.sign([keypair]);
    return tx;
  };
}

/**
 * Create a signer function that signs with multiple keypairs (if needed in future)
 */
export function createMultiSigner(
  keypairs: Keypair[]
): (tx: VersionedTransaction) => Promise<VersionedTransaction> {
  return async (tx: VersionedTransaction): Promise<VersionedTransaction> => {
    tx.sign(keypairs);
    return tx;
  };
}
