/**
 * Balance Monitor Service
 *
 * Monitors burner wallet addresses for incoming SOL deposits
 * and updates stored balances accordingly.
 */

import { PublicKey } from "@solana/web3.js";
import { createRPCManager, RPCManager } from "./rpcManager";
import { getAllBurnerWallets, storeBurnerWallet } from "./storage";
import {
  generateTransactionId,
  storeTransaction,
  type Transaction,
} from "./transactionHistory";

interface BalanceUpdate {
  walletIndex: number;
  newBalance: number;
  previousBalance: number;
}

class BalanceMonitor {
  private rpcManager: RPCManager | null = null;
  private monitoringInterval: ReturnType<typeof setInterval> | null = null;
  private isMonitoring: boolean = false;
  private lastCheckedBalances: Map<number, number> = new Map();

  /**
   * Initialize the balance monitor
   */
  async initialize(): Promise<void> {
    if (this.rpcManager) {
      return; // Already initialized
    }

    try {
      this.rpcManager = createRPCManager();
      console.log("[BalanceMonitor] Initialized");
    } catch (error) {
      console.error("[BalanceMonitor] Error initializing:", error);
      throw error;
    }
  }

  /**
   * Check balances for all burner wallets
   */
  async checkBalances(): Promise<BalanceUpdate[]> {
    if (!this.rpcManager) {
      await this.initialize();
    }

    const wallets = await getAllBurnerWallets();
    const updates: BalanceUpdate[] = [];

    if (wallets.length === 0) {
      return updates;
    }

    try {
      // Check wallet balances sequentially with delay to avoid rate limits
      for (const wallet of wallets) {
        try {
          const balance = await this.rpcManager!.executeWithRetry(
            async (connection) => {
              const publicKey = new PublicKey(wallet.fullAddress);
              const balance = await connection.getBalance(publicKey);
              return balance / 1e9; // Convert lamports to SOL
            }
          );

          const previousBalance = wallet.balance;
          const lastChecked =
            this.lastCheckedBalances.get(wallet.index) ?? previousBalance;

          // Only update if balance changed
          if (balance !== lastChecked) {
            // Update stored wallet balance
            wallet.balance = balance;
            await storeBurnerWallet(wallet);

            // Track the update
            if (balance !== previousBalance) {
              updates.push({
                walletIndex: wallet.index,
                newBalance: balance,
                previousBalance: previousBalance,
              });

              // Record incoming transaction if balance increased
              if (balance > previousBalance) {
                const incomingAmount = balance - previousBalance;
                const transaction: Transaction = {
                  id: generateTransactionId(),
                  type: "incoming",
                  timestamp: Date.now(),
                  amount: incomingAmount,
                  toAddress: wallet.fullAddress,
                  walletIndex: wallet.index,
                  status: "confirmed",
                };
                await storeTransaction(transaction);
              }
            }

            // Update last checked
            this.lastCheckedBalances.set(wallet.index, balance);
          }
        } catch (error) {
          console.error(
            `[BalanceMonitor] Error checking balance for wallet ${wallet.index}:`,
            error
          );
          // Continue to next wallet instead of failing all
        }

        // Small delay between wallet checks to avoid rate limits
        if (wallets.length > 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      if (updates.length > 0) {
        console.log(
          `[BalanceMonitor] Detected ${updates.length} balance update(s)`
        );
      }

      return updates;
    } catch (error) {
      console.error("[BalanceMonitor] Error checking balances:", error);
      return updates;
    }
  }

  /**
   * Start monitoring balances at regular intervals
   * Reads interval from VITE_BALANCE_CHECK_INTERVAL_MS or defaults to 30000ms (30 seconds)
   */
  startMonitoring(intervalMs?: number): void {
    if (this.isMonitoring) {
      console.warn("[BalanceMonitor] Already monitoring");
      return;
    }

    // Get interval from environment variable or use provided/default
    const envInterval = import.meta.env.VITE_BALANCE_CHECK_INTERVAL_MS
      ? parseInt(import.meta.env.VITE_BALANCE_CHECK_INTERVAL_MS, 10)
      : undefined;

    const finalInterval = intervalMs ?? envInterval ?? 30000;

    // Validate interval (minimum 5 seconds, maximum 5 minutes)
    const validatedInterval = Math.max(5000, Math.min(300000, finalInterval));

    this.isMonitoring = true;
    console.log(
      `[BalanceMonitor] Starting balance monitoring (interval: ${validatedInterval}ms)`
    );

    // Initial check
    this.checkBalances().catch((error) => {
      console.error("[BalanceMonitor] Error in initial balance check:", error);
    });

    // Set up interval (use global setInterval in service worker context)
    this.monitoringInterval = setInterval(() => {
      this.checkBalances().catch((error) => {
        console.error(
          "[BalanceMonitor] Error in periodic balance check:",
          error
        );
      });
    }, validatedInterval);
  }

  /**
   * Stop monitoring balances
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;

    if (this.monitoringInterval !== null) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    console.log("[BalanceMonitor] Stopped monitoring");
  }

  /**
   * Check if currently monitoring
   */
  isCurrentlyMonitoring(): boolean {
    return this.isMonitoring;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stopMonitoring();
    this.lastCheckedBalances.clear();

    if (this.rpcManager) {
      this.rpcManager.clearCache();
      this.rpcManager = null;
    }

    console.log("[BalanceMonitor] Destroyed");
  }
}

// Export singleton instance
let monitorInstance: BalanceMonitor | null = null;

/**
 * Get the balance monitor instance (singleton)
 */
export function getBalanceMonitor(): BalanceMonitor {
  if (!monitorInstance) {
    monitorInstance = new BalanceMonitor();
  }
  return monitorInstance;
}

export { BalanceMonitor };
export type { BalanceUpdate };
