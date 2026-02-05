/**
 * Balance Monitor Service
 * Monitors burner wallet addresses for SOL (Solana) and ETH (Ethereum) balances.
 */

import { PublicKey } from "@solana/web3.js";
import type { NetworkType } from "../types";
import {
  getArbitrumBalance,
  getAvalancheBalance,
  getEthBalance,
  weiToEth,
} from "./ethRpcManager";
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

function balanceKey(network: NetworkType, index: number): string {
  return `${network}:${index}`;
}

class BalanceMonitor {
  private rpcManager: RPCManager | null = null;
  private monitoringInterval: ReturnType<typeof setInterval> | null = null;
  private isMonitoring: boolean = false;
  private lastCheckedBalances: Map<string, number> = new Map();

  async initialize(): Promise<void> {
    if (this.rpcManager) return;
    try {
      this.rpcManager = createRPCManager();
      console.log("[BalanceMonitor] Initialized");
    } catch (error) {
      console.error("[BalanceMonitor] Error initializing:", error);
      throw error;
    }
  }

  /**
   * Check balances for all burner wallets (Solana and Ethereum).
   */
  async checkBalances(): Promise<BalanceUpdate[]> {
    if (!this.rpcManager) await this.initialize();
    const wallets = await getAllBurnerWallets();
    const updates: BalanceUpdate[] = [];

    if (wallets.length === 0) return updates;

    try {
      for (const wallet of wallets) {
        const key = balanceKey(wallet.network, wallet.index);
        try {
          let balance: number;
          if (wallet.network === "solana") {
            balance = await this.rpcManager!.executeWithRetry(
              async (connection) => {
                const publicKey = new PublicKey(wallet.fullAddress);
                const lamports = await connection.getBalance(publicKey);
                return lamports / 1e9;
              }
            );
          } else if (wallet.network === "arbitrum") {
            const wei = await getArbitrumBalance(wallet.fullAddress);
            balance = weiToEth(wei);
          } else if (wallet.network === "avalanche") {
            const wei = await getAvalancheBalance(wallet.fullAddress);
            balance = weiToEth(wei);
          } else {
            const wei = await getEthBalance(wallet.fullAddress);
            balance = weiToEth(wei);
          }

          const previousBalance = wallet.balance;
          const lastChecked =
            this.lastCheckedBalances.get(key) ?? previousBalance;

          if (balance !== lastChecked) {
            wallet.balance = balance;
            await storeBurnerWallet(wallet);

            if (balance !== previousBalance) {
              updates.push({
                walletIndex: wallet.index,
                newBalance: balance,
                previousBalance: previousBalance,
              });

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

            this.lastCheckedBalances.set(key, balance);
          }
        } catch (error) {
          console.error(
            `[BalanceMonitor] Error checking balance for ${wallet.network} wallet ${wallet.index}:`,
            error
          );
        }

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
