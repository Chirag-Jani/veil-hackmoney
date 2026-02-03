/**
 * RPC Manager for Privacy Cash SDK
 *
 * Handles RPC endpoint rotation and failover to avoid rate limits
 * and provide reliable connection to Solana network.
 */

import { Connection } from "@solana/web3.js";

interface RPCManagerOptions {
  rpcUrls: string[];
  maxRetries?: number;
  retryDelay?: number;
}

class RPCManager {
  private rpcUrls: string[];
  private currentIndex: number = 0;
  private maxRetries: number;
  private retryDelay: number;
  private connectionCache: Map<string, Connection> = new Map();

  constructor(options: RPCManagerOptions) {
    if (!options.rpcUrls || options.rpcUrls.length === 0) {
      throw new Error("At least one RPC URL is required");
    }

    this.rpcUrls = [...options.rpcUrls]; // Create a copy
    this.maxRetries = options.maxRetries ?? 3;
    this.retryDelay = options.retryDelay ?? 3000; // 3 seconds default (increased from 1s)
  }

  /**
   * Get the current RPC URL
   */
  getCurrentRpcUrl(): string {
    return this.rpcUrls[this.currentIndex];
  }

  /**
   * Get a Connection instance for the current RPC
   */
  getConnection(): Connection {
    const url = this.getCurrentRpcUrl();

    // Cache connections to avoid creating new ones
    if (!this.connectionCache.has(url)) {
      this.connectionCache.set(url, new Connection(url, "confirmed"));
    }

    return this.connectionCache.get(url)!;
  }

  /**
   * Rotate to the next RPC endpoint
   */
  rotateRpc(): void {
    this.currentIndex = (this.currentIndex + 1) % this.rpcUrls.length;
  }

  /**
   * Execute a function with automatic RPC rotation on failure
   */
  async executeWithRetry<T>(
    fn: (connection: Connection) => Promise<T>,
    customRetries?: number
  ): Promise<T> {
    const maxAttempts = customRetries ?? this.maxRetries;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const connection = this.getConnection();
        return await fn(connection);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if it's a network/RPC error (not a logic error)
        const isNetworkError = this.isNetworkError(lastError);

        if (isNetworkError && attempt < maxAttempts - 1) {
          // Rotate to next RPC and retry
          this.rotateRpc();

          // Use longer delay for rate limit errors
          const isRateLimit = this.isRateLimitError(lastError);
          const baseDelay = isRateLimit ? this.retryDelay * 3 : this.retryDelay;

          // Exponential backoff with jitter to prevent thundering herd
          const jitter = Math.random() * 1000; // 0-1 second jitter
          const delay = baseDelay * Math.pow(2, attempt) + jitter;

          console.warn(
            `[RPCManager] ${
              isRateLimit ? "Rate limit" : "RPC error"
            } on attempt ${attempt + 1}, ` +
              `waiting ${Math.round(
                delay / 1000
              )}s before rotating to ${this.getCurrentRpcUrl()}`
          );

          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          // Not a network error or max retries reached
          throw lastError;
        }
      }
    }

    // Should never reach here, but TypeScript needs it
    throw lastError || new Error("Failed after all retries");
  }

  /**
   * Check if an error is a network/RPC error that warrants retry
   */
  private isNetworkError(error: Error): boolean {
    const message = error.message.toLowerCase();
    const networkErrorPatterns = [
      "network",
      "timeout",
      "econnrefused",
      "enotfound",
      "fetch failed",
      "rate limit",
      "access forbidden",
      "403",
      "429",
      "503",
      "502",
      "500",
      "connection",
      "failed to get balance",
    ];

    return networkErrorPatterns.some((pattern) => message.includes(pattern));
  }

  /**
   * Check if error is a rate limit error (needs longer delay)
   */
  private isRateLimitError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return (
      message.includes("429") ||
      message.includes("403") ||
      message.includes("rate limit") ||
      message.includes("access forbidden")
    );
  }

  /**
   * Test connection to current RPC
   */
  async testConnection(): Promise<boolean> {
    try {
      const connection = this.getConnection();
      await connection.getSlot();
      return true;
    } catch (error) {
      console.error("[RPCManager] Connection test failed:", error);
      return false;
    }
  }

  /**
   * Get all RPC URLs
   */
  getRpcUrls(): string[] {
    return [...this.rpcUrls];
  }

  /**
   * Clear connection cache
   */
  clearCache(): void {
    this.connectionCache.clear();
  }
}

/**
 * Default RPC URLs as fallback
 */
const DEFAULT_RPC_URLS = ["https://api.mainnet-beta.solana.com"];

/**
 * Create an RPC manager from environment variables
 */
export function createRPCManager(): RPCManager {
  let rpcUrls: string[] = [];

  try {
    const rpcUrlsEnv = import.meta.env.VITE_SOLANA_RPCS;

    if (rpcUrlsEnv) {
      // Parse comma-separated URLs
      rpcUrls = rpcUrlsEnv
        .split(",")
        .map((url: string) => url.trim())
        .filter((url: string) => url.length > 0);
    }
  } catch (error) {
    console.warn(
      "[RPCManager] Error reading env variable, using defaults:",
      error
    );
  }

  // Use default if no URLs found
  if (rpcUrls.length === 0) {
    console.warn("[RPCManager] No RPC URLs in env, using defaults");
    rpcUrls = DEFAULT_RPC_URLS;
  }

  return new RPCManager({ rpcUrls });
}

export { RPCManager };
export type { RPCManagerOptions };
