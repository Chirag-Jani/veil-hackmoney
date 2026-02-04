/**
 * Privacy Cash Service
 *
 * Main integration layer for Privacy Cash SDK in the Veil extension.
 * Manages client lifecycle, provides high-level methods, and handles
 * all the browser extension-specific adaptations.
 */

import { WasmFactory } from "@lightprotocol/hasher.rs";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import {
  deposit,
  EncryptionService,
  getBalanceFromUtxos,
  getUtxos,
  withdraw,
} from "privacycash/utils";
import { createPrivacyCashSigner } from "./privacyCashSigner";
import {
  getPrivacyCashStorage,
  initializeStorageCache,
  preloadStorageForPublicKey,
} from "./privacyCashStorage";
import { createRPCManager, RPCManager } from "./rpcManager";

export interface DepositResult {
  tx: string;
}

export interface WithdrawResult {
  isPartial: boolean;
  tx: string;
  recipient: string;
  amount_in_lamports: number;
  fee_in_lamports: number;
}

export interface DepositAndWithdrawResult {
  depositTx: string;
  withdrawTx: string;
  recipient: string;
  amount_in_lamports: number;
}

class PrivacyCashService {
  private rpcManager: RPCManager | null = null;
  private currentKeypair: Keypair | null = null;
  private currentPublicKey: string | null = null;
  private encryptionService: EncryptionService | null = null;
  private storage: Storage | null = null;

  /**
   * Initialize Privacy Cash service for a specific wallet
   */
  async initialize(keypair: Keypair, rpcUrls?: string[]): Promise<void> {
    // Clean up existing service if switching wallets
    if (this.currentKeypair && this.currentKeypair !== keypair) {
      console.log("[PrivacyCash] Switching wallets, destroying old service...");
      await this.destroy();
    }

    // If already initialized for this keypair, skip
    if (this.currentKeypair === keypair && this.rpcManager) {
      console.log("[PrivacyCash] Already initialized for this keypair");
      return;
    }

    try {
      console.log("[PrivacyCash] Initializing service...");

      // Initialize storage cache
      await initializeStorageCache();
      this.storage = getPrivacyCashStorage();
      console.log("[PrivacyCash] Storage initialized");

      // Get or create RPC manager
      if (rpcUrls && rpcUrls.length > 0) {
        this.rpcManager = new RPCManager({ rpcUrls });
      } else {
        this.rpcManager = createRPCManager();
      }
      console.log("[PrivacyCash] RPC manager created");

      // Preload storage for this public key
      const publicKey = keypair.publicKey.toBase58();
      await preloadStorageForPublicKey(publicKey);
      console.log("[PrivacyCash] Storage preloaded for:", publicKey);

      // Create encryption service
      this.encryptionService = new EncryptionService();
      const keys =
        this.encryptionService.deriveEncryptionKeyFromWallet(keypair);
      console.log("[PrivacyCash] Encryption service initialized");
      console.log("[PrivacyCash] Has V1 key:", !!keys.v1);
      console.log("[PrivacyCash] Has V2 key:", !!keys.v2);

      // Store current state
      this.currentKeypair = keypair;
      this.currentPublicKey = publicKey;

      console.log("[PrivacyCash] Initialized for wallet:", publicKey);
    } catch (error) {
      console.error("[PrivacyCash] Error initializing:", error);
      console.error(
        "[PrivacyCash] Error stack:",
        error instanceof Error ? error.stack : "No stack",
      );
      throw error;
    }
  }

  /**
   * Get the circuit file base path for browser extension
   * Uses chrome.runtime.getURL to get extension resource URLs
   * snarkjs can work with URLs in the browser
   */
  private getCircuitBasePath(): string {
    return chrome.runtime.getURL("circuit2/transaction2");
  }

  /**
   * Get current public key
   */
  private getPublicKey(): PublicKey {
    if (!this.currentKeypair) {
      throw new Error("Service not initialized");
    }
    return this.currentKeypair.publicKey;
  }

  /**
   * Deposit SOL to Privacy Cash
   * Includes retry logic for blockhash expiration errors
   */
  async deposit(lamports: number): Promise<DepositResult> {
    if (
      !this.currentKeypair ||
      !this.encryptionService ||
      !this.rpcManager ||
      !this.storage
    ) {
      throw new Error(
        "Privacy Cash service not initialized. Call initialize() first.",
      );
    }

    // Extract keypair to local variable to satisfy TypeScript null checks
    const keypair = this.currentKeypair;
    const encryptionService = this.encryptionService;
    const storage = this.storage;

    console.log("[PrivacyCash] Starting deposit:", {
      lamports,
      publicKey: this.currentPublicKey,
    });

    // Retry logic for blockhash expiration errors
    // The SDK fetches blockhash early, but ZK proof generation can take time,
    // causing the signature to expire before relay
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.rpcManager.executeWithRetry(
          async (connection) => {
            const lightWasm = await WasmFactory.getInstance();
            const publicKey = this.getPublicKey();
            const transactionSigner = createPrivacyCashSigner(keypair);
            const keyBasePath = this.getCircuitBasePath();
            // Explicitly pass signer to ensure the correct keypair is used for balance checks and transaction signing
            const signer = keypair.publicKey;

            console.log("[PrivacyCash] Calling deposit (attempt", attempt, ")...");

            return await deposit({
              lightWasm,
              amount_in_lamports: lamports,
              connection,
              encryptionService,
              publicKey,
              transactionSigner,
              keyBasePath,
              storage,
              signer,
            });
          },
        );

        console.log("[PrivacyCash] Deposit successful:", result.tx);
        return {
          tx: result.tx,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(
          `[PrivacyCash] Deposit attempt ${attempt}/${maxRetries} failed:`,
          lastError.message,
        );

        // Check if this is a blockhash expiration error
        const errorMessage = lastError.message.toLowerCase();
        const isBlockhashExpired =
          errorMessage.includes("block height exceeded") ||
          errorMessage.includes("has expired") ||
          (errorMessage.includes("signature") && errorMessage.includes("expired")) ||
          errorMessage.includes("deposit relay failed") && errorMessage.includes("expired");

        if (isBlockhashExpired && attempt < maxRetries) {
          // Wait a bit before retrying to allow network to progress
          const waitTime = attempt * 2000; // 2s, 4s, 6s
          console.log(
            `[PrivacyCash] Blockhash expired, retrying in ${waitTime}ms...`,
          );
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          continue;
        }

        // If not a blockhash error or we've exhausted retries, throw
        console.error("[PrivacyCash] Deposit error:", lastError);
        if (lastError instanceof Error) {
          console.error("[PrivacyCash] Error message:", lastError.message);
          console.error("[PrivacyCash] Error stack:", lastError.stack);
        }
        throw lastError;
      }
    }

    // Should never reach here, but TypeScript needs it
    throw lastError || new Error("Deposit failed after all retries");
  }

  /**
   * Withdraw SOL from Privacy Cash
   * Includes retry logic for blockhash expiration errors
   */
  async withdraw(
    lamports: number,
    recipientAddress?: string,
  ): Promise<WithdrawResult> {
    if (
      !this.currentKeypair ||
      !this.encryptionService ||
      !this.rpcManager ||
      !this.storage
    ) {
      throw new Error(
        "Privacy Cash service not initialized. Call initialize() first.",
      );
    }

    // Extract to local variables for closure
    const encryptionService = this.encryptionService;
    const storage = this.storage;

    console.log("[PrivacyCash] Starting withdraw:", {
      lamports,
      recipientAddress: recipientAddress || "self",
      publicKey: this.currentPublicKey,
    });

    // Retry logic for blockhash expiration errors
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.rpcManager.executeWithRetry(
          async (connection) => {
            console.log("[PrivacyCash] Getting lightWasm...");
            const lightWasm = await WasmFactory.getInstance();

            const publicKey = this.getPublicKey();
            const recipient = recipientAddress
              ? new PublicKey(recipientAddress)
              : publicKey;
            const keyBasePath = this.getCircuitBasePath();

            console.log("[PrivacyCash] Calling withdraw with:", {
              recipient: recipient.toBase58(),
              publicKey: publicKey.toBase58(),
              amount_in_lamports: lamports,
              keyBasePath,
              attempt,
            });

            return await withdraw({
              recipient,
              lightWasm,
              storage,
              publicKey,
              connection,
              amount_in_lamports: lamports,
              encryptionService,
              keyBasePath,
            });
          },
        );

        console.log("[PrivacyCash] Withdraw successful:", result);

        return {
          isPartial: result.isPartial,
          tx: result.tx,
          recipient: result.recipient,
          amount_in_lamports: result.amount_in_lamports,
          fee_in_lamports: result.fee_in_lamports,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(
          `[PrivacyCash] Withdraw attempt ${attempt}/${maxRetries} failed:`,
          lastError.message,
        );

        // Check if this is a blockhash expiration error
        const isBlockhashExpired =
          lastError.message.includes("block height exceeded") ||
          lastError.message.includes("has expired") ||
          lastError.message.includes("Signature");

        if (isBlockhashExpired && attempt < maxRetries) {
          // Wait a bit before retrying to allow network to progress
          const waitTime = attempt * 2000; // 2s, 4s, 6s
          console.log(
            `[PrivacyCash] Blockhash expired, retrying in ${waitTime}ms...`,
          );
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          continue;
        }

        // If not a blockhash error or we've exhausted retries, throw
        console.error("[PrivacyCash] Withdraw error:", lastError);
        if (lastError instanceof Error) {
          console.error("[PrivacyCash] Error message:", lastError.message);
          console.error("[PrivacyCash] Error stack:", lastError.stack);
        }
        throw lastError;
      }
    }

    // Should never reach here, but TypeScript needs this
    throw lastError || new Error("Withdraw failed after all retries");
  }

  /**
   * Deposit and withdraw in one combined operation
   * This deposits funds to Privacy Cash and immediately withdraws to recipient
   * Returns both transaction signatures
   */
  async depositAndWithdraw(
    lamports: number,
    recipientAddress?: string,
  ): Promise<DepositAndWithdrawResult> {
    if (
      !this.currentKeypair ||
      !this.encryptionService ||
      !this.rpcManager ||
      !this.storage
    ) {
      throw new Error(
        "Privacy Cash service not initialized. Call initialize() first.",
      );
    }

    console.log("[PrivacyCash] Starting deposit and withdraw:", {
      lamports,
      recipientAddress: recipientAddress || "self",
      publicKey: this.currentPublicKey,
    });

    try {
      // Step 1: Deposit to Privacy Cash
      console.log("[PrivacyCash] Step 1: Depositing to Privacy Cash...");
      const depositResult = await this.deposit(lamports);
      console.log("[PrivacyCash] Deposit successful:", depositResult.tx);

      // Clear cache and wait for UTXOs to appear on-chain
      await this.clearCache();
      
      // Wait for UTXOs to be indexed - this can take time
      console.log("[PrivacyCash] Waiting for UTXOs to be indexed...");
      await new Promise((resolve) => setTimeout(resolve, 5000)); // Initial wait

      // Retry logic: Check if UTXOs are available before withdrawing
      const maxRetries = 15; // Increased retries for more time
      let retries = 0;
      let utxosAvailable = false;
      const expectedBalance = lamports / LAMPORTS_PER_SOL;
      // Allow for some tolerance due to fees - check if we have at least 90% of expected amount
      const minRequiredBalance = expectedBalance * 0.9;

      while (retries < maxRetries && !utxosAvailable) {
        try {
          await this.clearCache();
          const balance = await this.getPrivateBalance();
          console.log(`[PrivacyCash] Retry ${retries + 1}/${maxRetries}: Private balance: ${balance} SOL (expected: ${expectedBalance} SOL, min required: ${minRequiredBalance} SOL)`);
          
          // Check if we have sufficient balance (with tolerance for fees)
          if (balance >= minRequiredBalance) {
            utxosAvailable = true;
            console.log("[PrivacyCash] UTXOs are available, proceeding with withdraw");
            break;
          }
          
          // Wait before next retry (longer wait for first few retries)
          const waitTime = retries < 3 ? 5000 : 3000; // 5s for first 3, then 3s
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          retries++;
        } catch (error) {
          console.error(`[PrivacyCash] Error checking balance (retry ${retries + 1}):`, error);
          const waitTime = retries < 3 ? 5000 : 3000;
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          retries++;
        }
      }

      if (!utxosAvailable) {
        // Try to get the current balance for better error message
        let currentBalance = 0;
        try {
          await this.clearCache();
          currentBalance = await this.getPrivateBalance();
        } catch (e) {
          console.error("[PrivacyCash] Could not fetch balance for error message:", e);
        }
        
        throw new Error(
          `UTXOs are not yet available after deposit. Current private balance: ${currentBalance.toFixed(4)} SOL, Expected: ${expectedBalance.toFixed(4)} SOL. Please wait a moment and try withdrawing manually, or the transaction may still be processing.`
        );
      }

      // Step 2: Withdraw from Privacy Cash to recipient
      console.log("[PrivacyCash] Step 2: Withdrawing from Privacy Cash...");
      const withdrawResult = await this.withdraw(lamports, recipientAddress);
      console.log("[PrivacyCash] Withdraw successful:", withdrawResult.tx);

      return {
        depositTx: depositResult.tx,
        withdrawTx: withdrawResult.tx,
        recipient: withdrawResult.recipient,
        amount_in_lamports: withdrawResult.amount_in_lamports,
      };
    } catch (error) {
      console.error("[PrivacyCash] Deposit and withdraw error:", error);
      throw error;
    }
  }

  /**
   * Get private SOL balance
   */
  async getPrivateBalance(): Promise<number> {
    if (
      !this.currentKeypair ||
      !this.encryptionService ||
      !this.rpcManager ||
      !this.storage
    ) {
      console.error(
        "[PrivacyCash] Service not initialized for getPrivateBalance",
      );
      throw new Error(
        "Privacy Cash service not initialized. Call initialize() first.",
      );
    }

    // Extract to local variables for closure
    const encryptionService = this.encryptionService;
    const storage = this.storage;

    try {
      console.log("[PrivacyCash] Fetching private balance...");
      console.log("[PrivacyCash] Public key:", this.currentPublicKey);

      const balanceResult = await this.rpcManager.executeWithRetry(
        async (connection) => {
          const publicKey = this.getPublicKey();
          console.log(
            "[PrivacyCash] Calling getUtxos for:",
            publicKey.toBase58(),
          );

          const utxos = await getUtxos({
            publicKey,
            connection,
            encryptionService,
            storage,
          });

          console.log("[PrivacyCash] Found UTXOs:", utxos.length);

          if (utxos.length > 0) {
            console.log(
              "[PrivacyCash] UTXO amounts:",
              utxos.map((u) => u.amount.toString()),
            );
          }

          return getBalanceFromUtxos(utxos);
        },
      );

      const balanceInSol = balanceResult.lamports / LAMPORTS_PER_SOL;
      console.log(
        "[PrivacyCash] Balance result:",
        balanceResult.lamports,
        "lamports =",
        balanceInSol,
        "SOL",
      );

      return balanceInSol;
    } catch (error) {
      console.error("[PrivacyCash] Get balance error:", error);
      console.error(
        "[PrivacyCash] Error stack:",
        error instanceof Error ? error.stack : "No stack",
      );
      // Return 0 on error rather than throwing - but log the error for debugging
      return 0;
    }
  }

  /**
   * Get private SPL token balance
   * Note: SPL token support requires additional implementation
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getPrivateBalanceSPL(_mintAddress: string): Promise<number> {
    // TODO: Implement SPL token balance fetching
    console.warn("[PrivacyCash] SPL token balance not yet implemented");
    return 0;
  }

  /**
   * Clear cached UTXOs
   */
  async clearCache(): Promise<void> {
    if (!this.currentPublicKey || !this.storage) {
      return;
    }

    try {
      // Clear storage keys for this public key
      const publicKey = this.currentPublicKey;

      // Clear fetch offset
      await this.storage.removeItem(`fetch_offset${publicKey}`);

      // Clear encrypted outputs
      await this.storage.removeItem(`encrypted_outputs${publicKey}`);

      console.log("[PrivacyCash] Cache cleared");
    } catch (error) {
      console.error("[PrivacyCash] Clear cache error:", error);
    }
  }

  /**
   * Destroy the service and clean up resources
   */
  async destroy(): Promise<void> {
    if (this.rpcManager) {
      this.rpcManager.clearCache();
    }

    this.rpcManager = null;
    this.currentKeypair = null;
    this.currentPublicKey = null;
    this.encryptionService = null;
    this.storage = null;

    console.log("[PrivacyCash] Service destroyed");
  }

  /**
   * Check if service is initialized
   */
  isInitialized(): boolean {
    return this.currentKeypair !== null && this.rpcManager !== null;
  }

  /**
   * Get current public key
   */
  getCurrentPublicKey(): string | null {
    return this.currentPublicKey;
  }
}

// Export singleton instance
let serviceInstance: PrivacyCashService | null = null;

/**
 * Get the Privacy Cash service instance (singleton)
 */
export function getPrivacyCashService(): PrivacyCashService {
  if (!serviceInstance) {
    serviceInstance = new PrivacyCashService();
  }
  return serviceInstance;
}

export { PrivacyCashService };
